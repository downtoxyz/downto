-- Spice up system messages for join, leave, and maybe events.
-- Matches the energy of the kick messages in kick-member/route.ts.

-- ─── Helper: pick a random message from an array ────────────────────────────
CREATE OR REPLACE FUNCTION public.pick_random(arr TEXT[])
RETURNS TEXT AS $$
BEGIN
  RETURN arr[1 + floor(random() * array_length(arr, 1))::int];
END;
$$ LANGUAGE plpgsql;


-- ─── Join messages ──────────────────────────────────────────────────────────
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
BEGIN
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


-- ─── Squad invite notifications (varied text) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS TRIGGER AS $$
DECLARE
  squad_name TEXT;
  creator_id UUID;
  creator_name TEXT;
  joiner_name TEXT;
  existing_member RECORD;
  v_body TEXT;
  v_invited_messages TEXT[] := ARRAY[
    '{creator} put you in a squad. you didn''t consent but here we are',
    '{creator} assembled a squad and you got drafted. thank them later',
    '{creator} locked you in. escape is not an option',
    '{creator} said "trust me" and added you to a squad',
    '{creator} built a squad and you''re in it whether you like it or not',
    'congrats {creator} just voluntold you for a squad',
    '{creator} chose you specifically. take that how you will',
    '{creator} started a squad w you. thoughts and prayers',
    'you have been conscripted into {creator}''s squad',
    '{creator} said your name out loud and now you''re in a squad'
  ];
  v_self_join_messages TEXT[] := ARRAY[
    'you just joined {creator}''s squad. no takebacks',
    '{creator}''s squad just got you. that''s either really good or really bad',
    'you''re in {creator}''s squad now. this is legally binding',
    '{creator} started this and you said bet without thinking',
    'welcome to {creator}''s squad. all sales are final',
    'you slid into {creator}''s squad like it was nothing',
    'you joined {creator}''s squad and honestly we respect it',
    '{creator}''s squad needed you apparently. don''t let them down',
    'you''re locked in w {creator} now. no weird stuff',
    'you are now a member of {creator}''s squad. your parents would be proud'
  ];
  v_someone_joined_messages TEXT[] := ARRAY[
    '{joiner} joined the squad',
    '{joiner} just slid in like they own the place',
    '{joiner} pulled up and now we''re actually cooking',
    '{joiner} said less and just joined',
    'not {joiner} actually following through for once',
    '{joiner} is here everybody act normal',
    '{joiner} just made this squad lowkey unbeatable',
    'the squad got {joiner} now it''s genuinely over',
    '{joiner} joined and the group chat energy shifted',
    'oh {joiner} is here?? ok this is serious now'
  ];
BEGIN
  SELECT s.name, s.created_by INTO squad_name, creator_id
  FROM public.squads s WHERE s.id = NEW.squad_id;

  -- Skip notification to the squad creator's own row
  IF NEW.user_id = creator_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO creator_name
  FROM public.profiles WHERE id = creator_id;

  -- Self-join: user joined on their own (clicked "Join Squad" or auto-joined via down response)
  IF auth.uid() = NEW.user_id THEN
    -- Notify the joiner with contextual text
    v_body := replace(pick_random(v_self_join_messages), '{creator}', coalesce(creator_name, 'someone'));

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      squad_name,
      v_body,
      creator_id,
      NEW.squad_id
    );

    -- Notify existing squad members that someone joined
    SELECT display_name INTO joiner_name
    FROM public.profiles WHERE id = NEW.user_id;

    FOR existing_member IN
      SELECT user_id FROM public.squad_members
      WHERE squad_id = NEW.squad_id AND user_id != NEW.user_id
    LOOP
      v_body := replace(pick_random(v_someone_joined_messages), '{joiner}', coalesce(joiner_name, 'Someone'));

      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
      VALUES (
        existing_member.user_id,
        'squad_invite',
        squad_name,
        v_body,
        NEW.user_id,
        NEW.squad_id
      );
    END LOOP;
  ELSE
    -- Added by someone else (initial squad creation) — keep original behavior
    v_body := replace(pick_random(v_invited_messages), '{creator}', coalesce(creator_name, 'someone'));

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      squad_name,
      v_body,
      creator_id,
      NEW.squad_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Leave + maybe messages (check response changes) ───────────────────────
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_change()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_user_id UUID;
  v_check_id UUID;
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
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
  v_maybe_messages TEXT[] := ARRAY[
    '{name} went from down to maybe. sus',
    '{name} is now a maybe. the betrayal',
    '{name} switched to maybe. we see you {name}',
    '{name} is "maybe" coming. so basically no',
    '{name} is giving maybe energy rn',
    '{name} downgraded to maybe. oof',
    'not {name} going from down to maybe…',
    '{name} is reconsidering their life choices',
    '{name} hit the maybe button. prayer circle for their commitment',
    '{name} said maybe. we''ll be here when they come back'
  ];
  v_last_one_messages TEXT[] := ARRAY[
    'it''s just you now. squad of one is lowkey sad. invite someone or this dissolves',
    'everyone else bounced. you''re the last one here and the vibes are tragic',
    'solo squad. party of one. find your people before this expires fr',
    'literally everyone left. you''re the main character but like in a horror movie'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.response != 'down' THEN RETURN OLD; END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.response != 'down' OR NEW.response = 'down' THEN RETURN NEW; END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = v_check_id AND s.archived_at IS NULL
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id AND user_id = v_user_id;

  -- If the row was already gone (e.g. leave_squad RPC ran first), skip the message
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT p.display_name INTO v_display_name
  FROM public.profiles p WHERE p.id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));
  ELSE
    v_msg := replace(pick_random(v_maybe_messages), '{name}', coalesce(v_display_name, 'Someone'));
  END IF;

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Leave messages (check response delete — original trigger) ──────────────
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
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
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = OLD.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN OLD; END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id AND user_id = OLD.user_id;

  IF NOT FOUND THEN RETURN OLD; END IF;

  SELECT p.display_name INTO v_display_name
  FROM public.profiles p WHERE p.id = OLD.user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Leave messages (event undown) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_event_undown()
RETURNS TRIGGER AS $$
DECLARE
  v_squad RECORD;
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
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
  IF OLD.is_down = true AND NEW.is_down = false THEN
    SELECT p.display_name INTO v_display_name
    FROM public.profiles p WHERE p.id = OLD.user_id;

    FOR v_squad IN
      SELECT s.id FROM public.squads s WHERE s.event_id = OLD.event_id
    LOOP
      DELETE FROM public.squad_members
      WHERE squad_id = v_squad.id AND user_id = OLD.user_id;

      IF NOT FOUND THEN CONTINUE; END IF;

      v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

      INSERT INTO public.messages (squad_id, sender_id, text, is_system)
      VALUES (v_squad.id, NULL, v_msg, TRUE);

      SELECT COUNT(*) INTO v_remaining
      FROM public.squad_members WHERE squad_id = v_squad.id;

      IF v_remaining = 1 THEN
        INSERT INTO public.messages (squad_id, sender_id, text, is_system)
        VALUES (v_squad.id, NULL, pick_random(v_last_one_messages), TRUE);
      ELSIF v_remaining = 0 THEN
        DELETE FROM public.squads WHERE id = v_squad.id;
      END IF;
    END LOOP;

    DELETE FROM public.crew_pool
    WHERE user_id = OLD.user_id AND event_id = OLD.event_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Leave squad RPC (manual leave from UI) ──────────────────────────────────
-- Handles the delete + system message + remaining-member check atomically.
-- Needed because after deleting their own squad_members row, the user can't
-- insert a system message (RLS blocks it).
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
