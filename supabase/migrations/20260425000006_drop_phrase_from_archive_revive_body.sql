-- Strip the decorative random phrase from check_archived / check_revived
-- notification bodies. Body now shows just the check text — same as
-- check_text_updated. The phrase felt cute in isolation but added noise once
-- the title started naming the actor + verb ("Kat revived the check"); the
-- recipient cared about *which* check, not a flavor adjective.
--
-- DeletedCheckScreen keeps its own eulogy/dismissal lists in the client —
-- this only touches the notification rows.

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
  v_recipient UUID;
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
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_archived',
      v_author_name || ' deleted the check',
      LEFT(COALESCE(v_text, 'a check'), 120),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;


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
  v_recipient UUID;
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

  -- Always replace prior check_archived notifications with the latest state.
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
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_revived',
      v_author_name || ' revived the check',
      LEFT(COALESCE(v_text, 'a check'), 120),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;
