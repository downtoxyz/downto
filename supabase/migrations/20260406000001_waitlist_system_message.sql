-- Post a waitlist-specific system message when someone joins a squad as waitlisted,
-- instead of silently skipping.  Also fix the direct notification INSERT in
-- auto_squad_on_event_down to say "waitlisted" when role = 'waitlist'.

-- ─── 1. Update post_join_system_message to handle waitlist ───────────────────

CREATE OR REPLACE FUNCTION public.post_join_system_message()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_id UUID;
  v_joiner_name TEXT;
  v_msg TEXT;
  v_messages TEXT[] := ARRAY[
    '{name} just entered the chat',
    '{name} has arrived. the vibes shifted and we don''t know which way yet',
    '{name} joined. no turning back now',
    'everybody act normal {name} is here',
    '{name} locked in fr fr',
    'oh {name} is here?? ok this is real now',
    'the squad was mid until {name} showed up',
    'not {name} actually following through',
    'plot twist: {name} showed up and meant it',
    '{name} said less and just joined. we have no choice but to respect it'
  ];
  v_waitlist_messages TEXT[] := ARRAY[
    '{name} is on the waitlist. manifesting a spot',
    '{name} joined the waitlist. the dedication is noted',
    '{name} is waitlisted but spiritually already in the squad'
  ];
BEGIN
  -- Waitlisted members get a different message
  IF NEW.role = 'waitlist' THEN
    SELECT display_name INTO v_joiner_name
    FROM public.profiles WHERE id = NEW.user_id;

    v_msg := replace(pick_random(v_waitlist_messages), '{name}', coalesce(v_joiner_name, 'Someone'));

    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (NEW.squad_id, NULL, v_msg, TRUE);

    RETURN NEW;
  END IF;

  SELECT created_by INTO v_creator_id
  FROM public.squads WHERE id = NEW.squad_id;

  IF v_creator_id IS NULL THEN RETURN NEW; END IF;

  -- Skip system message for the creator (they get the opener message)
  IF NEW.user_id = v_creator_id THEN RETURN NEW; END IF;

  SELECT display_name INTO v_joiner_name
  FROM public.profiles WHERE id = NEW.user_id;

  v_msg := replace(pick_random(v_messages), '{name}', coalesce(v_joiner_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (NEW.squad_id, NULL, v_msg, TRUE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Fix auto_squad_on_event_down notification for waitlisted users ───────
-- The direct INSERT on the notification needs to say "waitlisted" not "added".
-- We replace the function to branch on role.

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
  v_role TEXT;
BEGIN
  -- Only fire on actual is_down changes
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_down = NEW.is_down THEN RETURN NEW; END IF;
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
  END IF;

  SELECT created_by, title INTO v_event_creator, v_event_title
  FROM public.events WHERE id = NEW.event_id;

  IF v_event_creator IS NULL OR v_event_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = NEW.user_id AND addressee_id = v_event_creator)
        OR (requester_id = v_event_creator AND addressee_id = NEW.user_id))
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN RETURN NEW; END IF;

  SELECT s.id INTO v_existing_squad_id
  FROM public.squads s
  JOIN public.squad_members sm ON sm.squad_id = s.id
  WHERE s.event_id = NEW.event_id AND sm.user_id = v_event_creator
  LIMIT 1;

  SELECT display_name INTO v_creator_name FROM public.profiles WHERE id = v_event_creator;
  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
  v_creator_name := COALESCE(v_creator_name, 'Someone');
  v_user_name := COALESCE(v_user_name, 'Someone');

  IF v_existing_squad_id IS NOT NULL THEN
    SELECT ic.max_squad_size INTO v_max_size
    FROM public.squads s JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.id = v_existing_squad_id;
    v_max_size := COALESCE(v_max_size, 20);

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members WHERE squad_id = v_existing_squad_id AND role = 'member';

    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      IF v_current_count < v_max_size THEN
        v_role := 'member';
      ELSE
        v_role := 'waitlist';
      END IF;

      INSERT INTO public.squad_members (squad_id, user_id, role)
      VALUES (v_existing_squad_id, NEW.user_id, v_role);

      IF v_role = 'waitlist' THEN
        INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
        VALUES (NEW.user_id, 'squad_invite', COALESCE(v_event_title, 'Event') || ' squad', 'Squad is full — you''re on the waitlist', v_existing_squad_id);
      ELSE
        INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
        VALUES (NEW.user_id, 'squad_invite', COALESCE(v_event_title, 'Event') || ' squad', 'You''ve been added to the squad', v_existing_squad_id);
      END IF;
    END IF;
  ELSE
    v_event_title := COALESCE(v_event_title, 'Event');
    INSERT INTO public.squads (name, event_id, created_by) VALUES (LEFT(v_event_title, 30), NEW.event_id, v_event_creator) RETURNING id INTO v_new_squad_id;
    INSERT INTO public.squad_members (squad_id, user_id) VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);
    INSERT INTO public.messages (squad_id, sender_id, text, is_system) VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES (NEW.user_id, 'squad_invite', COALESCE(v_event_title, 'Event') || ' squad', 'You''ve been added to the squad', v_new_squad_id);

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (v_event_creator, 'squad_invite', COALESCE(v_event_title, 'Event') || ' squad', v_user_name || ' is down — squad created', NEW.user_id, v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
