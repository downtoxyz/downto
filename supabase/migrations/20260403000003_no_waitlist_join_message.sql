-- Skip "joined" system messages and notifications when someone is added to a
-- squad waitlist (role = 'waitlist').  Only fire for full members (role = 'member').
-- The separate promote_waitlisted_member() RPC already posts its own message
-- when a waitlisted user gets promoted, so no gap in coverage.

-- ─── 1. System message trigger: skip waitlist inserts ─────────────────────────
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
  -- Skip waitlisted members — they haven't truly joined yet
  IF NEW.role = 'waitlist' THEN
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


-- ─── 2. Notification trigger: skip waitlist inserts ───────────────────────────
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
  -- Skip waitlisted members — they haven't truly joined yet
  IF NEW.role = 'waitlist' THEN
    RETURN NEW;
  END IF;

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
