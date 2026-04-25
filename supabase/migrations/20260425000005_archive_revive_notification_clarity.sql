-- Three small fixes that shake out from manually testing the revive flow:
--
-- 1. The archive/revive notifications used the random phrase as the *title*,
--    so recipients saw "resurrection arc / puzzle pints this week" with no
--    "by Kat" context. Move to the same shape as check_text_updated:
--      title  = "<author> deleted/revived the check"
--      body   = "<random phrase> · <check text>"
--    The phrase is still there as flavor — just demoted to body where it
--    reads as decoration instead of replacing the actual subject.
--
-- 2. notify_check_date_updated and notify_check_text_updated fire on any
--    UPDATE that touches event_date/event_time/text. Reviving (or PR #445's
--    stale-date cleanup inside revive) flips event_date alongside
--    archived_at, which made these triggers send a "kat updated the check
--    time" notification on top of the check_revived. Skip both triggers
--    when archived_at is also flipping in the same UPDATE — the archive/
--    revive RPC owns the notification fan-out for that transition.
--
-- 3. Recipients shouldn't see "Kat deleted the check" + "Kat revived the
--    check" stacked. Always DELETE prior check_archived notifications for
--    the check inside revive_interest_check (extending the existing 5-min
--    undo-de-dup behavior to all revives). Each recipient ends up with one
--    notification reflecting the latest state. Quick-undo case still sends
--    nothing — same as before.


-- 1. archive_interest_check — new title/body shape.
CREATE OR REPLACE FUNCTION public.archive_interest_check(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_author_id UUID;
  v_author_name TEXT;
  v_text TEXT;
  v_phrase TEXT;
  v_recipient UUID;
  v_phrases TEXT[] := ARRAY[
    'rip — they bailed',
    'this one is off the table',
    'cancelled. it happens.',
    'the check disintegrated',
    'plan dissolved',
    'they pulled the plug',
    'check went poof',
    'the check has left the building',
    'scratch that one'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT author_id, text INTO v_author_id, v_text
  FROM public.interest_checks
  WHERE id = p_check_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Check not found';
  END IF;

  IF v_author_id <> v_caller AND NOT public.is_check_coauthor(p_check_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to archive this check';
  END IF;

  UPDATE public.interest_checks
    SET archived_at = now()
    WHERE id = p_check_id AND archived_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO v_author_name FROM public.profiles WHERE id = v_author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');

  FOR v_recipient IN
    SELECT user_id FROM public.check_responses
    WHERE check_id = p_check_id
      AND response = 'down'
      AND user_id <> v_author_id
  LOOP
    v_phrase := v_phrases[1 + floor(random() * array_length(v_phrases, 1))::int];
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_archived',
      v_author_name || ' deleted the check',
      v_phrase || ' · ' || LEFT(COALESCE(v_text, 'a check'), 100),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;


-- 2. revive_interest_check — new title/body shape + always delete prior
--    archive notifs (extending the 5-min undo de-dup to all revives).
--    Stale-date cleanup from PR #445 carried over.
CREATE OR REPLACE FUNCTION public.revive_interest_check(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_author_id UUID;
  v_author_name TEXT;
  v_text TEXT;
  v_old_archived_at TIMESTAMPTZ;
  v_phrase TEXT;
  v_recipient UUID;
  v_phrases TEXT[] := ARRAY[
    'back from the dead',
    'false alarm — the check is alive',
    'the check came back',
    'plan revived',
    'pulled a lazarus',
    'scratch that — its back on',
    'rose from the grave',
    'never mind — its back',
    'resurrection arc'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT author_id, text, archived_at
    INTO v_author_id, v_text, v_old_archived_at
  FROM public.interest_checks
  WHERE id = p_check_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Check not found';
  END IF;

  IF v_author_id <> v_caller AND NOT public.is_check_coauthor(p_check_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to revive this check';
  END IF;

  -- Clear archived_at + stale temporal fields so the row passes
  -- check_is_active() (see 20260425000004 for the why).
  UPDATE public.interest_checks
    SET archived_at = NULL,
        event_date = CASE
          WHEN event_date IS NOT NULL
            AND event_date < (now() AT TIME ZONE COALESCE(event_tz, 'UTC'))::date
          THEN NULL
          ELSE event_date
        END,
        expires_at = CASE
          WHEN expires_at IS NOT NULL AND expires_at < now()
          THEN NULL
          ELSE expires_at
        END
    WHERE id = p_check_id AND archived_at IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Always remove prior check_archived notifications for this check —
  -- recipients should see one notification per latest state, not
  -- "Kat deleted" + "Kat revived" stacked.
  DELETE FROM public.notifications
    WHERE related_check_id = p_check_id
      AND type = 'check_archived';

  -- Quick undo (within 5 min) → no revive notification, just the cleanup
  -- above. Older revives → notify down responders the plan is back on.
  IF v_old_archived_at > now() - interval '5 minutes' THEN
    RETURN;
  END IF;

  SELECT display_name INTO v_author_name FROM public.profiles WHERE id = v_author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');

  FOR v_recipient IN
    SELECT user_id FROM public.check_responses
    WHERE check_id = p_check_id
      AND response = 'down'
      AND user_id <> v_author_id
  LOOP
    v_phrase := v_phrases[1 + floor(random() * array_length(v_phrases, 1))::int];
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_revived',
      v_author_name || ' revived the check',
      v_phrase || ' · ' || LEFT(COALESCE(v_text, 'a check'), 100),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;


-- 3. Suppress notify_check_date_updated when archived_at is also changing.
CREATE OR REPLACE FUNCTION public.notify_check_date_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_author_name TEXT;
  v_check_text TEXT;
  v_body TEXT;
  v_recipient UUID;
BEGIN
  -- The archive/revive RPC owns the notification fan-out when archived_at
  -- flips. Its same-row date cleanup would otherwise look like a manual
  -- date edit and double-fire a check_date_updated.
  IF OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
    RETURN NEW;
  END IF;

  IF NEW.event_date IS NOT DISTINCT FROM OLD.event_date
     AND NEW.event_time IS NOT DISTINCT FROM OLD.event_time THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = NEW.author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');
  v_check_text := LEFT(COALESCE(NEW.text, 'an interest check'), 80);

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
      AND cr.user_id <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_recipient,
      'check_date_updated',
      v_author_name || ' updated the check time',
      v_body,
      NEW.author_id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Same suppression for notify_check_text_updated.
CREATE OR REPLACE FUNCTION public.notify_check_text_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_author_name TEXT;
  v_body TEXT;
  v_recipient UUID;
BEGIN
  IF OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
    RETURN NEW;
  END IF;

  IF NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = NEW.author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');

  v_body := LEFT(COALESCE(NEW.text, 'an interest check'), 120);

  FOR v_recipient IN
    SELECT uid FROM (
      SELECT cr.user_id AS uid
        FROM public.check_responses cr
        WHERE cr.check_id = NEW.id
          AND cr.response = 'down'
      UNION
      SELECT cc.user_id AS uid
        FROM public.check_comments cc
        WHERE cc.check_id = NEW.id
    ) recipients
    WHERE uid <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_recipient,
      'check_text_updated',
      v_author_name || ' updated the check',
      v_body,
      NEW.author_id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
