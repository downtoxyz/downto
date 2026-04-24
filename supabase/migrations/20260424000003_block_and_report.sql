-- Block + report — App Store 1.2 minimum for user-generated content.
--
-- Block model: directional row (blocker → blocked), but behavior is mutual
--   both sides stop seeing each other's checks, responses, squad messages.
--   Profiles stay readable so existing joins don't break; the UI filters
--   blocked users out of friend lists / search in a follow-up PR.
--
-- Report model: append-only audit table. No user-facing read path; you query
-- it manually (or from an admin dashboard later). Reporter can file multiple
-- reports against the same target.


-- ============================================================================
-- 1. blocked_users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- A user can see and manage their OWN blocks. They cannot see who has blocked
-- them (prevents stalker-style enumeration).
DROP POLICY IF EXISTS "Own blocks readable" ON public.blocked_users;
CREATE POLICY "Own blocks readable" ON public.blocked_users
  FOR SELECT USING (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Own blocks writable" ON public.blocked_users;
CREATE POLICY "Own blocks writable" ON public.blocked_users
  FOR INSERT WITH CHECK (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Own blocks deletable" ON public.blocked_users;
CREATE POLICY "Own blocks deletable" ON public.blocked_users
  FOR DELETE USING (blocker_id = (SELECT auth.uid()));


-- ============================================================================
-- 2. reported_content
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reported_content (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type    TEXT NOT NULL CHECK (target_type IN ('profile','check','squad_message','event_comment','check_comment')),
  target_id      UUID NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('harassment','spam','impersonation','inappropriate','threats','other')),
  details        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ,
  action_taken   TEXT
);

CREATE INDEX IF NOT EXISTS idx_reported_content_reporter ON public.reported_content(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reported_content_target ON public.reported_content(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reported_content_unreviewed ON public.reported_content(created_at DESC) WHERE reviewed_at IS NULL;

ALTER TABLE public.reported_content ENABLE ROW LEVEL SECURITY;

-- Reporter can insert their own report and read back their own reports.
-- No update/delete by users — the record is an audit trail.
DROP POLICY IF EXISTS "Reporters can file" ON public.reported_content;
CREATE POLICY "Reporters can file" ON public.reported_content
  FOR INSERT WITH CHECK (reporter_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Reporters can read own" ON public.reported_content;
CREATE POLICY "Reporters can read own" ON public.reported_content
  FOR SELECT USING (reporter_id = (SELECT auth.uid()));


-- ============================================================================
-- 3. is_blocked(a, b) helper — symmetric: true if either direction is blocked
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_blocked(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_a AND blocked_id = p_b)
       OR (blocker_id = p_b AND blocked_id = p_a)
  );
$$;


-- ============================================================================
-- 4. RLS updates — add NOT is_blocked to content SELECT policies
-- ============================================================================

-- interest_checks: piggyback on the consolidation policy shape from 20260424000001
DROP POLICY IF EXISTS "Interest checks visible to friends and fof" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends and fof" ON public.interest_checks
  FOR SELECT USING (
    public.check_is_active(interest_checks.*)
    AND NOT public.is_blocked((SELECT auth.uid()), author_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.is_friend_or_fof((SELECT auth.uid()), author_id)
      OR public.is_friend_of_coauthor((SELECT auth.uid()), id)
    )
  );

-- check_responses: hide responses from blocked responders (even on visible checks)
DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    NOT public.is_blocked((SELECT auth.uid()), user_id)
    AND (
      user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.interest_checks ic
        WHERE ic.id = check_responses.check_id
        AND (
          ic.author_id = (SELECT auth.uid())
          OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
          OR public.is_friend_of_coauthor((SELECT auth.uid()), ic.id)
        )
      )
    )
  );

-- messages: hide messages from blocked senders in shared squads
DROP POLICY IF EXISTS "Messages visible to squad members" ON public.messages;
CREATE POLICY "Messages visible to squad members" ON public.messages
  FOR SELECT USING (
    public.is_squad_member(squad_id, (SELECT auth.uid()))
    AND NOT public.is_blocked((SELECT auth.uid()), sender_id)
  );

-- friendships INSERT: prevent creating a friend request to/from a blocked user
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;
CREATE POLICY "Users can send friend requests" ON public.friendships
  FOR INSERT WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND NOT public.is_blocked(requester_id, addressee_id)
  );
