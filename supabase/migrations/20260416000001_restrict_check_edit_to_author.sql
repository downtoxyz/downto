-- Revert: restrict interest_checks UPDATE to author (and accepted co-authors).
-- The previous policy allowed any friend/FoF viewer to edit, which let
-- unrelated users change check titles.

DROP POLICY IF EXISTS "Viewers can update interest checks" ON public.interest_checks;
DROP POLICY IF EXISTS "Users can update own interest checks" ON public.interest_checks;

CREATE POLICY "Author and co-authors can update interest checks" ON public.interest_checks
  FOR UPDATE USING (
    author_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.check_co_authors
      WHERE check_id = interest_checks.id
        AND user_id = (SELECT auth.uid())
        AND status = 'accepted'
    )
  );
