-- Fix: interest_checks UPDATE was recursing via check_co_authors SELECT RLS.
--
--   UPDATE interest_checks policy does
--     EXISTS (SELECT 1 FROM check_co_authors WHERE ...)
--   which invokes check_co_authors SELECT policy, which does
--     EXISTS (SELECT 1 FROM interest_checks WHERE ...)
--   which invokes interest_checks SELECT policy, which calls
--     is_friend_of_coauthor() — and that function queries check_co_authors
--     again. If SECURITY DEFINER doesn't actually bypass RLS in this
--     deployment (function owner missing BYPASSRLS), the chain loops
--     and Postgres raises error 42P17.
--
-- Short-circuit it by using a dedicated SECURITY DEFINER helper for the
-- "is the viewer an accepted co-author on this check" question, following
-- the pattern used by is_check_responder() in 20260408000002.

CREATE OR REPLACE FUNCTION public.is_check_coauthor(p_check_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.check_co_authors
    WHERE check_id = p_check_id
      AND user_id = p_user_id
      AND status = 'accepted'
  );
$$;

DROP POLICY IF EXISTS "Author and co-authors can update interest checks" ON public.interest_checks;
CREATE POLICY "Author and co-authors can update interest checks" ON public.interest_checks
  FOR UPDATE USING (
    author_id = (SELECT auth.uid())
    OR public.is_check_coauthor(id, (SELECT auth.uid()))
  );
