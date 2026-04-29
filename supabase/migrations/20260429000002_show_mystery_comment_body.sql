-- Mystery comments: show the body, hide just the identities.
--
-- 20260428000003 redacted the entire comment body to "(comment hidden until
-- reveal)" for mystery checks. Spec correction from product: only the
-- *identities* need hiding (commenter name + any @mentions in the text).
-- The comment content itself is fine to show — the whole point of mystery
-- mode is the room conversing without knowing who's who, not silent dead
-- chat.
--
-- Two changes inside notify_check_comment's mystery branch:
--   1. v_body now uses LEFT(NEW.text, 80) just like the non-mystery branch.
--   2. @mention tokens get rewritten to "@???" via regexp_replace so they
--      don't smuggle out display names through the body. Mirrors the
--      client-side stripAtMentions() helper for the in-app render.
--
-- title still says "a mystery guest commented" / "...replied"; related_user_id
-- is still NULL on mystery rows. Squad message redaction (notify_squad_message)
-- is left untouched — different surface, separate call.

CREATE OR REPLACE FUNCTION public.notify_check_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_commenter_name TEXT;
  v_body TEXT;
  v_root_author UUID;
  v_thread_label TEXT;
  v_recipient UUID;
  v_is_mystery BOOLEAN := FALSE;
BEGIN
  -- Only check threads can be mystery; events have no mystery flag.
  IF NEW.check_id IS NOT NULL THEN
    v_is_mystery := public.is_check_in_mystery_period(NEW.check_id);
  END IF;

  IF v_is_mystery THEN
    v_commenter_name := 'a mystery guest';
    -- Show the actual comment text. Strip @mentions because those are
    -- identities (and would defeat the redaction by surfacing real
    -- display names directly in the push preview).
    v_body := regexp_replace(LEFT(NEW.text, 80), '@\S+', '@???', 'g');
  ELSE
    SELECT display_name INTO v_commenter_name
    FROM public.profiles WHERE id = NEW.user_id;
    v_commenter_name := COALESCE(v_commenter_name, 'Someone');
    v_body := LEFT(NEW.text, 80);
  END IF;

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
        CASE WHEN v_is_mystery THEN NULL ELSE NEW.user_id END,
        NEW.check_id
      );
    END LOOP;
  ELSIF NEW.event_id IS NOT NULL THEN
    -- Events: unchanged, no mystery flag on events.
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
        v_commenter_name || ' commented',
        v_body,
        NEW.user_id,
        NEW.event_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
