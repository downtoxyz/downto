-- Fix squad size enforcement: max_squad_size includes the creator.
-- The auto-join trigger was counting all members but not filtering by role,
-- and wasn't accounting for the creator already being in the squad.

-- 1. Fix auto_join_squad_on_down_response: only count active members
CREATE OR REPLACE FUNCTION public.auto_join_squad_on_down_response()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  -- Only act on "down" responses
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  -- Find squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = NEW.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN NEW; END IF;

  -- Get max size from the interest check
  SELECT ic.max_squad_size INTO v_max_size
  FROM public.interest_checks ic
  WHERE ic.id = NEW.check_id;

  -- Count current active members (including creator)
  SELECT COUNT(*) INTO v_current_count
  FROM public.squad_members
  WHERE squad_id = v_squad_id AND role = 'member';

  -- Add if room, otherwise waitlist
  IF v_current_count < v_max_size THEN
    INSERT INTO public.squad_members (squad_id, user_id, role)
    VALUES (v_squad_id, NEW.user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.squad_members (squad_id, user_id, role)
    VALUES (v_squad_id, NEW.user_id, 'waitlist')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update auto_squad_on_event_down to respect squad size when adding to existing squad
CREATE OR REPLACE FUNCTION public.auto_squad_on_event_down()
RETURNS TRIGGER AS $$
DECLARE
  v_event_creator UUID;
  v_event_title TEXT;
  v_existing_squad_id UUID;
  v_new_squad_id UUID;
  v_is_friend BOOLEAN;
  v_creator_name TEXT;
  v_user_name TEXT;
  v_names TEXT;
  v_formation_msg TEXT;
  v_max_size INT;
  v_current_count INT;
BEGIN
  -- Only fire when is_down changes to true
  IF NOT NEW.is_down OR (OLD IS NOT NULL AND OLD.is_down) THEN
    RETURN NEW;
  END IF;

  -- Get event info
  SELECT created_by, title INTO v_event_creator, v_event_title
  FROM public.events WHERE id = NEW.event_id;

  -- Only auto-squad between friends and the event creator
  IF v_event_creator IS NULL OR v_event_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Check if they're friends
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = NEW.user_id AND addressee_id = v_event_creator)
        OR (requester_id = v_event_creator AND addressee_id = NEW.user_id))
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN NEW;
  END IF;

  -- Check if the event creator already has a squad for this event
  SELECT s.id INTO v_existing_squad_id
  FROM public.squads s
  JOIN public.squad_members sm ON sm.squad_id = s.id
  WHERE s.event_id = NEW.event_id
    AND sm.user_id = v_event_creator
  LIMIT 1;

  -- Get display names
  SELECT display_name INTO v_creator_name FROM public.profiles WHERE id = v_event_creator;
  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
  v_creator_name := COALESCE(v_creator_name, 'Someone');
  v_user_name := COALESCE(v_user_name, 'Someone');

  IF v_existing_squad_id IS NOT NULL THEN
    -- Squad exists: check size cap before adding
    -- Get max size from linked check (if any), default to 20
    SELECT ic.max_squad_size INTO v_max_size
    FROM public.squads s
    JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.id = v_existing_squad_id;
    v_max_size := COALESCE(v_max_size, 20);

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members
    WHERE squad_id = v_existing_squad_id AND role = 'member';

    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      IF v_current_count < v_max_size THEN
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'member');
      ELSE
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'waitlist');
      END IF;

      INSERT INTO public.messages (squad_id, sender_id, text, is_system)
      VALUES (v_existing_squad_id, NULL, v_user_name || ' joined the squad', TRUE);

      INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
      VALUES (
        NEW.user_id,
        'squad_invite',
        COALESCE(v_event_title, 'Event') || ' squad',
        'You''ve been added to the squad',
        v_existing_squad_id
      );
    END IF;
  ELSE
    -- No squad yet: create one with creator + this user
    v_event_title := COALESCE(v_event_title, 'Event');

    INSERT INTO public.squads (name, event_id, created_by)
    VALUES (LEFT(v_event_title, 30), NEW.event_id, v_event_creator)
    RETURNING id INTO v_new_squad_id;

    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);

    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES
      (v_event_creator, 'squad_invite', v_event_title || ' squad', v_user_name || ' is down — squad formed!', v_new_squad_id),
      (NEW.user_id, 'squad_invite', v_event_title || ' squad', 'You and ' || v_creator_name || ' are squadded up', v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
