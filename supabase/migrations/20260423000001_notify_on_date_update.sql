-- Notify interested users when an interest check or event has its date/time edited.
-- Fires on UPDATE of interest_checks (event_date/event_time) and events (date/time_display).

-- 1. Extend the notifications.type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated'
  ));

-- 2. Check: when date or time changes, notify every responder (down/maybe) except author
CREATE OR REPLACE FUNCTION public.notify_check_date_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_author_name TEXT;
  v_check_text TEXT;
  v_body TEXT;
  v_recipient UUID;
BEGIN
  -- Only fire when date or time actually changed
  IF NEW.event_date IS NOT DISTINCT FROM OLD.event_date
     AND NEW.event_time IS NOT DISTINCT FROM OLD.event_time THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = NEW.author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');
  v_check_text := LEFT(COALESCE(NEW.text, 'an interest check'), 80);

  -- Build a short summary of the new date/time
  v_body := v_check_text ||
    CASE
      WHEN NEW.event_date IS NOT NULL AND NEW.event_time IS NOT NULL
        THEN ' · ' || TO_CHAR(NEW.event_date, 'Mon DD') || ' ' || NEW.event_time
      WHEN NEW.event_date IS NOT NULL
        THEN ' · ' || TO_CHAR(NEW.event_date, 'Mon DD')
      WHEN NEW.event_time IS NOT NULL
        THEN ' · ' || NEW.event_time
      ELSE ''
    END;

  FOR v_recipient IN
    SELECT DISTINCT cr.user_id
    FROM public.check_responses cr
    WHERE cr.check_id = NEW.id
      AND cr.response IN ('down', 'maybe')
      AND cr.user_id <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_recipient,
      'check_date_updated',
      v_author_name || ' updated the date',
      v_body,
      NEW.author_id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_date_updated ON public.interest_checks;
CREATE TRIGGER on_check_date_updated
  AFTER UPDATE ON public.interest_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_date_updated();

-- 3. Event: when date or time_display changes, notify every downee except the creator
CREATE OR REPLACE FUNCTION public.notify_event_date_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_name TEXT;
  v_event_title TEXT;
  v_body TEXT;
  v_recipient UUID;
BEGIN
  IF NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.date_display IS NOT DISTINCT FROM OLD.date_display
     AND NEW.time_display IS NOT DISTINCT FROM OLD.time_display THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_creator_name
  FROM public.profiles WHERE id = NEW.created_by;
  v_creator_name := COALESCE(v_creator_name, 'Someone');
  v_event_title := LEFT(COALESCE(NEW.title, 'an event'), 80);

  v_body := v_event_title ||
    CASE
      WHEN NEW.date_display IS NOT NULL AND NEW.time_display IS NOT NULL
        THEN ' · ' || NEW.date_display || ' ' || NEW.time_display
      WHEN NEW.date_display IS NOT NULL
        THEN ' · ' || NEW.date_display
      WHEN NEW.date IS NOT NULL AND NEW.time_display IS NOT NULL
        THEN ' · ' || TO_CHAR(NEW.date, 'Mon DD') || ' ' || NEW.time_display
      WHEN NEW.date IS NOT NULL
        THEN ' · ' || TO_CHAR(NEW.date, 'Mon DD')
      WHEN NEW.time_display IS NOT NULL
        THEN ' · ' || NEW.time_display
      ELSE ''
    END;

  FOR v_recipient IN
    SELECT DISTINCT se.user_id
    FROM public.saved_events se
    WHERE se.event_id = NEW.id
      AND se.is_down = TRUE
      AND se.user_id <> COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::UUID)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (
      v_recipient,
      'event_date_updated',
      v_creator_name || ' updated the date',
      v_body,
      NEW.created_by,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_date_updated ON public.events;
CREATE TRIGGER on_event_date_updated
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_date_updated();
