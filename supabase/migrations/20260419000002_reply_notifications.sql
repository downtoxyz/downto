-- Expand comment notifications to cover events and thread replies.
-- Before: notify_check_comment() only notified the check author on new
-- check comments, and event comments triggered no notification at all
-- (and in fact silently errored since the trigger assumed check_id set).
-- After: on any comment, notify the thread's root author (check author
-- or event creator) AND every previous commenter — all except the person
-- who just posted.

-- 1. Add 'event_comment' type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated',
    'event_comment'
  ));

-- 2. Rewrite: fan out to author/creator + previous commenters
CREATE OR REPLACE FUNCTION public.notify_check_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_commenter_name TEXT;
  v_body TEXT;
  v_root_author UUID;
  v_thread_label TEXT;  -- "check" or "event" for the title
  v_recipient UUID;
BEGIN
  SELECT display_name INTO v_commenter_name
  FROM public.profiles WHERE id = NEW.user_id;
  v_commenter_name := COALESCE(v_commenter_name, 'Someone');
  v_body := LEFT(NEW.text, 80);

  -- Route by thread type
  IF NEW.check_id IS NOT NULL THEN
    SELECT author_id INTO v_root_author
    FROM public.interest_checks WHERE id = NEW.check_id;
    v_thread_label := 'check';

    FOR v_recipient IN
      SELECT DISTINCT user_id FROM (
        SELECT v_root_author AS user_id WHERE v_root_author IS NOT NULL
        UNION
        SELECT DISTINCT cc.user_id FROM public.check_comments cc
        WHERE cc.check_id = NEW.check_id
      ) t
      WHERE user_id IS NOT NULL AND user_id <> NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
      VALUES (
        v_recipient,
        'check_comment',
        CASE WHEN v_recipient = v_root_author
          THEN v_commenter_name || ' commented'
          ELSE v_commenter_name || ' replied'
        END,
        v_body,
        NEW.user_id,
        NEW.check_id
      );
    END LOOP;

  ELSIF NEW.event_id IS NOT NULL THEN
    SELECT created_by INTO v_root_author
    FROM public.events WHERE id = NEW.event_id;
    v_thread_label := 'event';

    FOR v_recipient IN
      SELECT DISTINCT user_id FROM (
        SELECT v_root_author AS user_id WHERE v_root_author IS NOT NULL
        UNION
        SELECT DISTINCT cc.user_id FROM public.check_comments cc
        WHERE cc.event_id = NEW.event_id
      ) t
      WHERE user_id IS NOT NULL AND user_id <> NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
      VALUES (
        v_recipient,
        'event_comment',
        CASE WHEN v_recipient = v_root_author
          THEN v_commenter_name || ' commented'
          ELSE v_commenter_name || ' replied'
        END,
        v_body,
        NEW.user_id,
        NEW.event_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger already exists from 20260311000002; keep it in place
DROP TRIGGER IF EXISTS on_check_comment ON public.check_comments;
CREATE TRIGGER on_check_comment
  AFTER INSERT ON public.check_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_comment();
