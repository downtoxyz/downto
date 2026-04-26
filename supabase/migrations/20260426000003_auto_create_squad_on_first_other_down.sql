-- Auto-form the squad as soon as the first non-author down response lands.
--
-- Squad creation used to have two paths and neither covered the obvious case
-- "author makes a check, friend taps Down, plan happens":
--   1. Author taps a "Squad →" button on the check card (manual).
--   2. Client-side onAutoSquad in useChecks fires when the local user taps
--      "down" and the threshold of >=2 explicit responders is met.
--
-- Both ignore that the author is *implicitly* down — we shouldn't need them
-- to tap anything for the squad to form. And both depend on a specific
-- client being online at the right moment.
--
-- This trigger does the work in SQL so it's deterministic regardless of who
-- tapped what or who's online. The companion auto_join_squad_on_down_response
-- trigger from 20260217000008 keeps adding subsequent responders to the
-- existing squad — this only handles the *creation* moment.

CREATE OR REPLACE FUNCTION public.auto_create_squad_on_first_other_down()
RETURNS TRIGGER AS $$
DECLARE
  v_check_id UUID := NEW.check_id;
  v_author_id UUID;
  v_check_text TEXT;
  v_squad_name TEXT;
  v_existing_squad_id UUID;
  v_existing_archived_squad_id UUID;
  v_squad_id UUID;
  v_opener TEXT;
BEGIN
  -- Only act on "down" responses.
  IF NEW.response != 'down' THEN
    RETURN NEW;
  END IF;

  SELECT author_id, text INTO v_author_id, v_check_text
  FROM public.interest_checks
  WHERE id = v_check_id;

  -- Author tapping down on their own check doesn't form a squad — author is
  -- implicit, we need at least one OTHER person down.
  IF NEW.user_id = v_author_id THEN
    RETURN NEW;
  END IF;

  -- Skip if a non-archived squad already exists for this check. The
  -- companion auto-join trigger will fold this responder in.
  SELECT id INTO v_existing_squad_id
  FROM public.squads
  WHERE check_id = v_check_id
    AND archived_at IS NULL
  LIMIT 1;
  IF v_existing_squad_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- If an archived squad exists for this check, reactivate it instead of
  -- spinning up a duplicate. Mirrors the client's "rebuild the same squad"
  -- semantics.
  SELECT id INTO v_existing_archived_squad_id
  FROM public.squads
  WHERE check_id = v_check_id
    AND archived_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_archived_squad_id IS NOT NULL THEN
    UPDATE public.squads
      SET archived_at = NULL
      WHERE id = v_existing_archived_squad_id;
    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_existing_archived_squad_id, NEW.user_id)
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Squad name is the check text trimmed to 30 chars.
  v_squad_name := SUBSTRING(COALESCE(v_check_text, 'squad') FROM 1 FOR 30);
  IF char_length(COALESCE(v_check_text, '')) > 30 THEN
    v_squad_name := v_squad_name || '...';
  END IF;

  INSERT INTO public.squads (name, check_id, created_by)
  VALUES (v_squad_name, v_check_id, NEW.user_id)
  RETURNING id INTO v_squad_id;

  INSERT INTO public.squad_members (squad_id, user_id, role)
  VALUES
    (v_squad_id, v_author_id, 'member'),
    (v_squad_id, NEW.user_id, 'member')
  ON CONFLICT (squad_id, user_id) DO NOTHING;

  -- Random opener so the squad chat doesn't open empty. Curated subset of the
  -- client's SQUAD_OPENERS list (skip the title-interpolated ones — pure SQL
  -- random pick is enough flavor).
  v_opener := (ARRAY[
    'i cleared my schedule. i didn''t have anything but still',
    'already mentally there tbh',
    'just cancelled plans i didn''t have for this',
    'mentally i''m already there waiting for you guys',
    'if anyone flakes i''m airing it out',
    'screenshot taken. evidence logged.',
    'flaking is a federal offense btw',
    'historians will write about this squad',
    'main character energy activated',
    'cool. no turning back now',
    'well that happened fast',
    'anyway i''m already dressed',
    'ok bet',
    'LETS GOOOOO',
    'oh this is gonna be unhinged',
    'everybody act normal',
    'this energy is immaculate'
  ])[1 + floor(random() * 17)::int];

  INSERT INTO public.messages (squad_id, sender_id, text)
  VALUES (v_squad_id, NEW.user_id, v_opener);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_response_auto_create_squad ON public.check_responses;
CREATE TRIGGER on_check_response_auto_create_squad
  AFTER INSERT OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_squad_on_first_other_down();
