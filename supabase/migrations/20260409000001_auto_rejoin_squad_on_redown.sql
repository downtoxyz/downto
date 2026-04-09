-- When a user re-downs a check or event that has an existing active squad,
-- auto-add them back into the squad if there's room. This restores the
-- squad membership users lose when they accidentally toggle the down button off.
--
-- Background: previously the squad button on interest checks let users
-- manually rejoin squads. After removing those buttons, the down toggle is
-- the only way to (re)join a squad — so re-downing must restore membership.

-- ============================================================================
-- Trigger 1: rejoin squad when a check_response is inserted as 'down'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_rejoin_squad_on_check_down()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  -- Find active (not archived) squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = NEW.check_id
    AND s.archived_at IS NULL
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN NEW; END IF;

  -- Skip if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.squad_members
    WHERE squad_id = v_squad_id AND user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Check capacity
  SELECT max_squad_size INTO v_max_size
  FROM public.interest_checks WHERE id = NEW.check_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.squad_members
  WHERE squad_id = v_squad_id
    AND COALESCE(role, 'member') != 'waitlist';

  IF v_max_size IS NOT NULL AND v_current_count >= v_max_size THEN
    RETURN NEW;
  END IF;

  -- Add as member
  INSERT INTO public.squad_members (squad_id, user_id, role)
  VALUES (v_squad_id, NEW.user_id, 'member')
  ON CONFLICT (squad_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_response_auto_rejoin ON public.check_responses;
CREATE TRIGGER on_check_response_auto_rejoin
  AFTER INSERT ON public.check_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_rejoin_squad_on_check_down();

-- ============================================================================
-- Trigger 2: rejoin squad when a saved_event is_down goes false → true
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_rejoin_squad_on_event_redown()
RETURNS TRIGGER AS $$
DECLARE
  v_squad RECORD;
  v_member_count INT;
BEGIN
  -- Only act when re-downing
  IF (TG_OP = 'INSERT' AND NEW.is_down = true)
    OR (TG_OP = 'UPDATE' AND OLD.is_down = false AND NEW.is_down = true) THEN

    -- Loop over each active squad linked to this event
    FOR v_squad IN
      SELECT s.id FROM public.squads s
      WHERE s.event_id = NEW.event_id
        AND s.archived_at IS NULL
    LOOP
      -- Skip if already a member
      IF EXISTS (
        SELECT 1 FROM public.squad_members
        WHERE squad_id = v_squad.id AND user_id = NEW.user_id
      ) THEN
        CONTINUE;
      END IF;

      -- Add as member (no capacity check for events — they have no max_squad_size)
      INSERT INTO public.squad_members (squad_id, user_id, role)
      VALUES (v_squad.id, NEW.user_id, 'member')
      ON CONFLICT (squad_id, user_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_saved_event_auto_rejoin ON public.saved_events;
CREATE TRIGGER on_saved_event_auto_rejoin
  AFTER INSERT OR UPDATE ON public.saved_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_rejoin_squad_on_event_redown();
