-- When a user is removed from squad_members (by any path: leave_squad RPC,
-- confirm-date "no", kick-member, or direct delete), auto-un-down them from
-- the linked event IF they are no longer in ANY squad for that event.

CREATE OR REPLACE FUNCTION public.undown_event_on_squad_member_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
  v_still_in_squad BOOLEAN;
BEGIN
  -- Get the event linked to this squad (if any)
  SELECT s.event_id INTO v_event_id
  FROM public.squads s
  WHERE s.id = OLD.squad_id;

  -- Nothing to do if squad has no linked event
  IF v_event_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Check if user is still in any other squad for this event
  SELECT EXISTS (
    SELECT 1
    FROM public.squad_members sm
    JOIN public.squads s ON s.id = sm.squad_id
    WHERE s.event_id = v_event_id
      AND sm.user_id = OLD.user_id
  ) INTO v_still_in_squad;

  -- Only un-down if user has no remaining squads for this event
  IF NOT v_still_in_squad THEN
    UPDATE public.saved_events
    SET is_down = false
    WHERE event_id = v_event_id
      AND user_id = OLD.user_id
      AND is_down = true;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_delete_undown_event ON public.squad_members;
CREATE TRIGGER on_squad_member_delete_undown_event
  AFTER DELETE ON public.squad_members
  FOR EACH ROW
  EXECUTE FUNCTION public.undown_event_on_squad_member_delete();


-- Remove the now-redundant event un-down from leave_squad RPC.
-- The trigger above handles it for all code paths.
CREATE OR REPLACE FUNCTION public.leave_squad(p_squad_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
  v_check_id UUID;
  v_event_id UUID;
  v_leave_messages TEXT[] := ARRAY[
    '{name} left the squad',
    '{name} ghosted. classic {name} behavior honestly',
    '{name} said "something came up" lmaooo sure',
    'and just like that… {name} is gone. alexa play see you again',
    '{name} left. pour one out',
    '{name} pulled an irish goodbye and we''re not even irish',
    'rip {name}''s commitment. cause of death: being {name}',
    '{name} chose peace and violence at the same time by leaving',
    '{name} left the squad. their loss genuinely',
    'not {name} actually leaving omg'
  ];
  v_last_one_messages TEXT[] := ARRAY[
    'it''s just you now. squad of one is lowkey sad. invite someone or this dissolves',
    'everyone else bounced. you''re the last one here and the vibes are tragic',
    'solo squad. party of one. find your people before this expires fr',
    'literally everyone left. you''re the main character but like in a horror movie'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = p_squad_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- The DELETE above fires the on_squad_member_delete_undown_event trigger,
  -- which handles setting is_down = false on the linked event's saved_events row.

  SELECT s.check_id, s.event_id INTO v_check_id, v_event_id
  FROM public.squads s WHERE s.id = p_squad_id;

  IF v_check_id IS NOT NULL THEN
    -- Record as "left" before deleting response
    IF EXISTS (SELECT 1 FROM public.check_responses WHERE check_id = v_check_id AND user_id = v_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = v_check_id AND author_id = v_user_id)
    THEN
      INSERT INTO public.left_checks (user_id, check_id)
      VALUES (v_user_id, v_check_id)
      ON CONFLICT (user_id, check_id) DO UPDATE SET left_at = NOW();
    END IF;

    DELETE FROM public.check_responses
    WHERE check_id = v_check_id AND user_id = v_user_id;
  END IF;

  -- Event un-down is now handled by the squad_members DELETE trigger.
  -- No manual UPDATE on saved_events needed here.

  SELECT display_name INTO v_display_name
  FROM public.profiles WHERE id = v_user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = p_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (p_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = p_squad_id;
  END IF;

  -- Auto-promote from check-level waitlist (not squad-level)
  IF v_check_id IS NOT NULL THEN
    PERFORM public.promote_waitlisted_check_response(v_check_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
