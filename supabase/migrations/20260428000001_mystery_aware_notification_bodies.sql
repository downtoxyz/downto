-- v0.2 of mystery checks: notification bodies don't reveal sender names
-- pre-reveal. The push notification preview in iOS/Android shows the body
-- text in plain language, so a notif like "Sara responded down to your
-- check" defeats the entire mystery if your check is in mystery mode.
--
-- This migration wraps the affected notify_* triggers with a mystery-aware
-- branch. When the check is currently in its mystery period, body strings
-- replace the sender's display name with "someone" (the simplest noun that
-- works in both "someone responded" and "someone commented").
--
-- The helper is_check_in_mystery_period(check_id) does the gating. Returns
-- true iff the check exists, is mystery=true, and event_date is either NULL
-- or still in the future (CURRENT_DATE comparison; uses server tz which is
-- close-enough to UTC, the small fence-post error here is acceptable for
-- notif body redaction).


-- =============================================================================
-- 1. Helper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_check_in_mystery_period(p_check_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.interest_checks ic
    WHERE ic.id = p_check_id
      AND ic.mystery = TRUE
      AND (ic.event_date IS NULL OR ic.event_date > CURRENT_DATE)
  );
$$;


-- =============================================================================
-- 2. notify_friend_check — fires when a check is posted, alerts friends.
--    For mystery checks: drop the author's name from the title.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_friend_check()
RETURNS TRIGGER AS $$
DECLARE
  author_name TEXT;
  friend_id UUID;
  v_is_mystery BOOLEAN := COALESCE(NEW.mystery, FALSE);
BEGIN
  IF NOT v_is_mystery THEN
    SELECT display_name INTO author_name
    FROM public.profiles WHERE id = NEW.author_id;
  END IF;

  FOR friend_id IN
    SELECT CASE
      WHEN requester_id = NEW.author_id THEN addressee_id
      ELSE requester_id
    END
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = NEW.author_id OR addressee_id = NEW.author_id)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      friend_id,
      'friend_check',
      CASE
        WHEN v_is_mystery THEN 'a mystery hang ✦'
        ELSE COALESCE(author_name, 'someone')
      END,
      LEFT(NEW.text, 80),
      -- Don't expose author_id in the notif row when mystery. The notif row
      -- itself is server-stored, so even if the client respects the redaction
      -- in render, we don't want a determined viewer pulling related_user_id.
      CASE WHEN v_is_mystery THEN NULL ELSE NEW.author_id END,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 3. notify_check_response — fires when someone says down. For mystery:
--    don't reveal the responder.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_check_response()
RETURNS TRIGGER AS $$
DECLARE
  responder_name TEXT;
  v_check_author_id UUID;
  v_check_text TEXT;
  v_is_mystery BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.response = NEW.response THEN
    RETURN NEW;
  END IF;

  SELECT ic.author_id, ic.text, COALESCE(ic.mystery, FALSE)
    INTO v_check_author_id, v_check_text, v_is_mystery
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- Author responding to own check: never notify (existing behavior).
  IF v_check_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Mystery + pre-reveal? Use a redacted form.
  IF v_is_mystery AND public.is_check_in_mystery_period(NEW.check_id) THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_check_author_id,
      'check_response',
      'someone is in ✦',
      'a mystery guest responded to "' || LEFT(v_check_text, 40) || '"',
      NULL,  -- redact responder identity
      NEW.check_id
    );
    RETURN NEW;
  END IF;

  -- Default: existing non-mystery behavior.
  SELECT display_name INTO responder_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    v_check_author_id,
    'check_response',
    'New response to your check',
    COALESCE(responder_name, 'someone') || ' is ' || NEW.response || ' for "' || LEFT(v_check_text, 40) || '"',
    NEW.user_id,
    NEW.check_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 4. notify_check_comment — fires when someone comments on a check (or event).
--    For mystery checks: redact the commenter's name + drop the comment body
--    (writing style still leaks identity, but the push preview shouldn't).
-- =============================================================================
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
    v_body := '(comment hidden until reveal)';
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


-- =============================================================================
-- 5. notify_squad_message — fires on every chat message. For mystery squads
--    (i.e. the squad's underlying check is mystery + pre-reveal): redact
--    sender name + chat body. Sender already routes through kaomoji on the
--    client; don't undo that work via the OS push preview.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_squad_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  squad_name TEXT;
  member_id UUID;
  v_squad_check_id UUID;
  v_is_mystery BOOLEAN := FALSE;
BEGIN
  -- System messages don't notify (existing behavior — sender_id IS NULL).
  IF NEW.sender_id IS NULL OR NEW.is_system THEN
    RETURN NEW;
  END IF;

  SELECT s.name, s.check_id INTO squad_name, v_squad_check_id
  FROM public.squads s WHERE s.id = NEW.squad_id;

  IF v_squad_check_id IS NOT NULL THEN
    v_is_mystery := public.is_check_in_mystery_period(v_squad_check_id);
  END IF;

  IF v_is_mystery THEN
    sender_name := 'a mystery guest';
  ELSE
    SELECT display_name INTO sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
    sender_name := COALESCE(sender_name, 'someone');
  END IF;

  FOR member_id IN
    SELECT user_id FROM public.squad_members
    WHERE squad_id = NEW.squad_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      member_id,
      'squad_message',
      squad_name,
      CASE
        WHEN v_is_mystery THEN sender_name || ' said something'
        ELSE sender_name || ': ' || COALESCE(LEFT(NEW.text, 80), '')
      END,
      CASE WHEN v_is_mystery THEN NULL ELSE NEW.sender_id END,
      NEW.squad_id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
