-- Notify event creator and friends when someone marks "down" on an event.
-- Also adds 'event_down' notification type.

-- 1. Add event_down to notification types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down'
  ));

-- 2. Trigger function: notify when someone marks down on an event
CREATE OR REPLACE FUNCTION public.notify_event_down()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
  v_event_title TEXT;
  v_event_creator UUID;
  v_friend_id UUID;
BEGIN
  -- Only fire when is_down changes to true
  IF NOT NEW.is_down OR (OLD IS NOT NULL AND OLD.is_down) THEN
    RETURN NEW;
  END IF;

  -- Get the user's display name and event info
  SELECT display_name INTO v_user_name
  FROM public.profiles WHERE id = NEW.user_id;

  SELECT title, created_by INTO v_event_title, v_event_creator
  FROM public.events WHERE id = NEW.event_id;

  v_user_name := COALESCE(v_user_name, 'Someone');
  v_event_title := COALESCE(v_event_title, 'an event');

  -- Notify the event creator if they're a different person and a friend
  IF v_event_creator IS NOT NULL
    AND v_event_creator != NEW.user_id
    AND EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND ((requester_id = NEW.user_id AND addressee_id = v_event_creator)
          OR (requester_id = v_event_creator AND addressee_id = NEW.user_id))
    )
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (
      v_event_creator,
      'event_down',
      v_user_name || ' is down',
      LEFT(v_event_title, 80),
      NEW.user_id,
      NEW.event_id
    );
  END IF;

  -- Notify other friends who are already down for this event
  FOR v_friend_id IN
    SELECT se.user_id
    FROM public.saved_events se
    WHERE se.event_id = NEW.event_id
      AND se.is_down = true
      AND se.user_id != NEW.user_id
      AND se.user_id != COALESCE(v_event_creator, '00000000-0000-0000-0000-000000000000')
      AND EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
          AND ((requester_id = NEW.user_id AND addressee_id = se.user_id)
            OR (requester_id = se.user_id AND addressee_id = NEW.user_id))
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (
      v_friend_id,
      'event_down',
      v_user_name || ' is also down',
      LEFT(v_event_title, 80),
      NEW.user_id,
      NEW.event_id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger on saved_events UPDATE (is_down toggled)
DROP TRIGGER IF EXISTS on_event_down ON public.saved_events;
CREATE TRIGGER on_event_down
  AFTER UPDATE ON public.saved_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_down();

-- Also fire on INSERT with is_down=true (e.g. saveEvent + toggleDown in one step)
DROP TRIGGER IF EXISTS on_event_down_insert ON public.saved_events;
CREATE TRIGGER on_event_down_insert
  AFTER INSERT ON public.saved_events
  FOR EACH ROW
  WHEN (NEW.is_down = true)
  EXECUTE FUNCTION public.notify_event_down();
