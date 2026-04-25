-- Fix: revive_interest_check leaves a check invisible if its event_date or
-- expires_at has already passed.
--
-- Root cause: the consolidated SELECT policy from 20260424000001 gates on
-- public.check_is_active(), which requires both archived_at IS NULL and
-- (event_date is future OR (event_date is null and expires_at is null/future)).
-- The PR #443 revive RPC only flipped archived_at — so reviving a check whose
-- date had already passed succeeded at the row level but the row stayed
-- hidden, and would also be re-archived by the archive_past_date_checks cron
-- on its next run.
--
-- Fix: when reviving, also clear stale event_date / expires_at. Future-dated
-- fields are preserved so a user reviving a check that was scheduled for, say,
-- next week doesn't lose the date. The author can re-set a date via the edit
-- modal if the cleared fields don't match what they want.

CREATE OR REPLACE FUNCTION public.revive_interest_check(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_author_id UUID;
  v_text TEXT;
  v_old_archived_at TIMESTAMPTZ;
  v_phrase TEXT;
  v_recipient UUID;
  v_phrases TEXT[] := ARRAY[
    'the check got undeleted',
    'back from the dead',
    'false alarm — the check is alive',
    'the check came back',
    'plan revived',
    'the check pulled a lazarus',
    'scratch that — its back on',
    'the check rose from the grave',
    'never mind — the check is back',
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

  -- Idempotent: re-reviving an already-active row is a silent no-op. Also
  -- clear stale temporal fields so the row passes check_is_active() — without
  -- this, reviving a past-dated check leaves it RLS-hidden AND re-archivable
  -- by the archive_past_date_checks cron.
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

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Undo (recently archived) → erase the archive notifications, send nothing.
  -- Real revive (older archive) → notify down responders the plan is back on.
  IF v_old_archived_at > now() - interval '5 minutes' THEN
    DELETE FROM public.notifications
      WHERE related_check_id = p_check_id
        AND type = 'check_archived';
  ELSE
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
        v_phrase,
        LEFT(COALESCE(v_text, 'a check'), 120),
        v_author_id,
        p_check_id
      );
    END LOOP;
  END IF;
END;
$$;
