-- Add missing DELETE policy for check_responses
-- Without this, removeCheckResponse() silently fails due to RLS blocking the delete.

DROP POLICY IF EXISTS "Users can delete own responses" ON public.check_responses;
CREATE POLICY "Users can delete own responses" ON public.check_responses
  FOR DELETE USING (user_id = auth.uid());
