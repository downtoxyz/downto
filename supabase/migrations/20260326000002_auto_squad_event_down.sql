-- Auto-create or auto-join squad when a friend marks down on an event.
-- Fires after the notification trigger so notifications go out first.

-- Formation messages with {names} and {title} placeholders
CREATE OR REPLACE FUNCTION public.pick_squad_formation_message(p_names TEXT, p_title TEXT)
RETURNS TEXT AS $$
DECLARE
  messages TEXT[] := ARRAY[
    p_names || ' are locked in for "' || p_title || '"',
    p_names || ' just made "' || p_title || '" official',
    p_names || ' said yes to "' || p_title || '" and there''s no going back',
    '"' || p_title || '" squad activated — ' || p_names || ' are in',
    p_names || ' are about to make "' || p_title || '" a core memory',
    'it''s giving "' || p_title || '" and ' || p_names || ' are giving committed',
    p_names || ' locked in. "' || p_title || '" will never be the same',
    '"' || p_title || '" didn''t ask for ' || p_names || ' but it''s getting them anyway'
  ];
BEGIN
  RETURN messages[1 + floor(random() * array_length(messages, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Main auto-squad function
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
    -- Squad exists: add user if not already a member
    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      INSERT INTO public.squad_members (squad_id, user_id)
      VALUES (v_existing_squad_id, NEW.user_id);

      -- System message: "{name} joined the squad"
      INSERT INTO public.messages (squad_id, sender_id, text, is_system)
      VALUES (v_existing_squad_id, NULL, v_user_name || ' joined the squad', TRUE);

      -- Notify the new member
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

    -- Add both members
    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    -- Combined formation message with both names
    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);

    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);

    -- Notify both members
    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES
      (v_event_creator, 'squad_invite', v_event_title || ' squad', v_user_name || ' is down — squad formed!', v_new_squad_id),
      (NEW.user_id, 'squad_invite', v_event_title || ' squad', 'You and ' || v_creator_name || ' are squadded up', v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers (fire after notify_event_down)
DROP TRIGGER IF EXISTS on_event_down_auto_squad ON public.saved_events;
CREATE TRIGGER on_event_down_auto_squad
  AFTER UPDATE ON public.saved_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_squad_on_event_down();

DROP TRIGGER IF EXISTS on_event_down_auto_squad_insert ON public.saved_events;
CREATE TRIGGER on_event_down_auto_squad_insert
  AFTER INSERT ON public.saved_events
  FOR EACH ROW
  WHEN (NEW.is_down = true)
  EXECUTE FUNCTION public.auto_squad_on_event_down();
