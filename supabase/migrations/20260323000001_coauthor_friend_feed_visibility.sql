-- Co-author friends see checks as "friend" checks
--
-- When user A @mentions user B in a check and B accepts, B's friends should
-- see that check as a friend-level check (no "via X" annotation).
--
-- 1. New helper: is_friend_of_coauthor(viewer, check_id)
-- 2. Update interest_checks SELECT policy
-- 3. Update check_responses SELECT policy
-- 4. Update check_co_authors SELECT policy
-- 5. Update get_fof_check_annotations() to exclude co-author-friend checks

-- =============================================================================
-- 1. Helper: is viewer a direct friend of any accepted co-author on the check?
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_friend_of_coauthor(p_viewer UUID, p_check_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.check_co_authors ca
    JOIN public.friendships f
      ON f.status = 'accepted'
      AND (
        (f.requester_id = p_viewer AND f.addressee_id = ca.user_id) OR
        (f.addressee_id = p_viewer AND f.requester_id = ca.user_id)
      )
    WHERE ca.check_id = p_check_id
      AND ca.status = 'accepted'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- 2. Update interest_checks SELECT policy
-- =============================================================================
DROP POLICY IF EXISTS "Interest checks visible to friends and fof" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends and fof" ON public.interest_checks
  FOR SELECT USING (
    author_id = (SELECT auth.uid())
    OR public.is_friend_or_fof((SELECT auth.uid()), author_id)
    OR public.is_friend_of_coauthor((SELECT auth.uid()), id)
  );

-- =============================================================================
-- 3. Update check_responses SELECT policy
-- =============================================================================
DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_responses.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
        OR public.is_friend_of_coauthor((SELECT auth.uid()), ic.id)
      )
    )
  );

-- =============================================================================
-- 4. Update check_co_authors SELECT policy
-- =============================================================================
DROP POLICY IF EXISTS "Co-authors visible to check viewers" ON public.check_co_authors;
CREATE POLICY "Co-authors visible to check viewers"
  ON public.check_co_authors FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR invited_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_co_authors.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
        OR public.is_friend_of_coauthor((SELECT auth.uid()), ic.id)
      )
    )
  );

-- =============================================================================
-- 5. Update get_fof_check_annotations() to exclude co-author-friend checks
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_fof_check_annotations()
RETURNS TABLE(check_id UUID, via_friend_name TEXT) AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT DISTINCT ON (ic.id)
    ic.id AS check_id,
    mutual.display_name AS via_friend_name
  FROM public.interest_checks ic
  CROSS JOIN me
  -- Only active checks
  JOIN LATERAL (SELECT 1 WHERE ic.expires_at IS NULL OR ic.expires_at > now()) alive ON true
  -- Not your own check
  JOIN LATERAL (SELECT 1 WHERE ic.author_id <> me.uid) notmine ON true
  -- No direct friendship with author
  JOIN LATERAL (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM public.friendships df
      WHERE df.status = 'accepted'
      AND (
        (df.requester_id = me.uid AND df.addressee_id = ic.author_id) OR
        (df.addressee_id = me.uid AND df.requester_id = ic.author_id)
      )
    )
  ) notdirect ON true
  -- Not a friend of any accepted co-author (those appear as friend-level checks)
  JOIN LATERAL (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM public.check_co_authors ca
      JOIN public.friendships cf
        ON cf.status = 'accepted'
        AND (
          (cf.requester_id = me.uid AND cf.addressee_id = ca.user_id) OR
          (cf.addressee_id = me.uid AND cf.requester_id = ca.user_id)
        )
      WHERE ca.check_id = ic.id
        AND ca.status = 'accepted'
    )
  ) not_coauthor_friend ON true
  -- Find mutual friend: viewer↔mutual, mutual↔author
  JOIN public.friendships f1 ON f1.status = 'accepted'
    AND (f1.requester_id = me.uid OR f1.addressee_id = me.uid)
  JOIN public.friendships f2 ON f2.status = 'accepted'
    AND (f2.requester_id = ic.author_id OR f2.addressee_id = ic.author_id)
    AND (
      CASE WHEN f1.requester_id = me.uid THEN f1.addressee_id ELSE f1.requester_id END
      =
      CASE WHEN f2.requester_id = ic.author_id THEN f2.addressee_id ELSE f2.requester_id END
    )
  JOIN public.profiles mutual ON mutual.id = (
    CASE WHEN f1.requester_id = me.uid THEN f1.addressee_id ELSE f1.requester_id END
  )
  ORDER BY ic.id, mutual.display_name
$$ LANGUAGE sql SECURITY DEFINER STABLE;
