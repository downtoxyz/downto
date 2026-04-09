-- Fix: the previous migration caused RLS recursion because the check_responses
-- SELECT policy queried check_responses itself. Use a SECURITY DEFINER function
-- to bypass RLS for the "is this user a responder" check.

CREATE OR REPLACE FUNCTION public.is_check_responder(p_check_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.check_responses
    WHERE check_id = p_check_id AND user_id = p_user_id
  );
$$;

DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR
    public.is_check_responder(check_id, (SELECT auth.uid())) OR
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
