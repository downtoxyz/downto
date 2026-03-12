-- ─── Left checks: remember checks a user left so they can re-down ───────────

CREATE TABLE public.left_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_id UUID NOT NULL REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  left_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, check_id)
);

ALTER TABLE public.left_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own left checks"
  ON public.left_checks FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own left checks"
  ON public.left_checks FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- No INSERT policy — only the SECURITY DEFINER leave_squad RPC inserts.

-- ─── Modify leave_squad to record left checks before deleting response ──────

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

  -- Remove the member
  DELETE FROM public.squad_members
  WHERE squad_id = p_squad_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Also un-down from the associated check or event so it leaves their calendar
  SELECT s.check_id, s.event_id INTO v_check_id, v_event_id
  FROM public.squads s WHERE s.id = p_squad_id;

  IF v_check_id IS NOT NULL THEN
    -- Record as "left" before deleting response (only if user had a response and is not the check author)
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

  IF v_event_id IS NOT NULL THEN
    UPDATE public.saved_events
    SET is_down = false
    WHERE event_id = v_event_id AND user_id = v_user_id;
  END IF;

  -- Get display name and post leave message
  SELECT display_name INTO v_display_name
  FROM public.profiles WHERE id = v_user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL, v_msg, TRUE);

  -- Check remaining members
  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = p_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (p_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = p_squad_id;
  END IF;

  -- Auto-promote first waitlisted member
  PERFORM public.promote_waitlisted_member(p_squad_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Auto-cleanup: when user re-downs, remove their left_checks record ──────

CREATE FUNCTION public.cleanup_left_check_on_redown() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.left_checks WHERE user_id = NEW.user_id AND check_id = NEW.check_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cleanup_left_check
  AFTER INSERT ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_left_check_on_redown();
