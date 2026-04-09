-- Fix: users who responded to a check should see ALL responses on that check,
-- not just their own. Previously orlandochen's response was hidden from krn
-- because they weren't friends/FoF of the check author.

DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR
    -- Viewer has also responded to this check (they're a participant)
    EXISTS (
      SELECT 1 FROM public.check_responses cr2
      WHERE cr2.check_id = check_responses.check_id
      AND cr2.user_id = (SELECT auth.uid())
    ) OR
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
