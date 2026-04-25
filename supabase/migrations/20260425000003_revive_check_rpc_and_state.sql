-- Companion to 20260425000002 (archive RPC). Adds:
--   1. check_revived as a notifications.type value.
--   2. revive_interest_check(p_check_id) — SECURITY DEFINER mirror of the
--      archive RPC, with an undo-aware notification path.
--   3. get_check_state(p_check_id) — a probe the client uses on a
--      notification tap. Returns {active, is_mine} so the panel can decide
--      between feed-nav, no-revive screen, or revive-screen.
--
-- Why SECURITY DEFINER on get_check_state too: archived rows are hidden by
-- the SELECT policy from 20260424000001 (check_is_active), even from their
-- author. The author needs to be able to discover that a tapped notification
-- still maps to one of *their* checks so we can offer the revive UI. The
-- function only returns two booleans — no sensitive payload.
--
-- Undo de-dup logic in revive_interest_check:
--   The Delete button shows a 4.5s "undo?" toast. If the user undoes inside
--   that window (or shortly after), we want recipients to see *no*
--   notification — the cancel never really happened from their POV. So we
--   gate on archived_at: if it's < 5 minutes old, treat the revive as undo
--   and DELETE the prior check_archived notifications instead of inserting
--   check_revived. 5 min is generous safety margin past the 4.5s toast.


-- 1. Extend notifications.type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated',
    'check_text_updated',
    'check_archived', 'check_revived'
  ));


-- 2. revive_interest_check(p_check_id)
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

  -- Idempotent: re-reviving an already-active row is a silent no-op.
  UPDATE public.interest_checks
    SET archived_at = NULL
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

GRANT EXECUTE ON FUNCTION public.revive_interest_check(UUID) TO authenticated;


-- 3. get_check_state(p_check_id) — probe used by NotificationsPanel.
CREATE OR REPLACE FUNCTION public.get_check_state(p_check_id UUID)
RETURNS TABLE(active BOOLEAN, is_mine BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ic.archived_at IS NULL, false) AS active,
    COALESCE(
      ic.author_id = (SELECT auth.uid())
      OR public.is_check_coauthor(ic.id, (SELECT auth.uid())),
      false
    ) AS is_mine
  FROM (SELECT 1) AS dummy
  LEFT JOIN public.interest_checks ic ON ic.id = p_check_id
$$;

GRANT EXECUTE ON FUNCTION public.get_check_state(UUID) TO authenticated;
