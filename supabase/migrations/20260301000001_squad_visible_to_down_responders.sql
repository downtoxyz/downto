-- Allow users who responded "down" to a check to see the linked squad.
-- Without this, non-members can't see the squad exists, so the
-- "Join Squad →" button never appears in the feed.

-- Helper: check if user responded "down" to a given check (bypasses RLS)
CREATE OR REPLACE FUNCTION public.has_down_response(p_check_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.check_responses
    WHERE check_id = p_check_id AND user_id = p_user_id AND response = 'down'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Expand squads SELECT policy to include down responders
DROP POLICY IF EXISTS "Squads visible to members" ON public.squads;
CREATE POLICY "Squads visible to members" ON public.squads
  FOR SELECT USING (
    created_by = (SELECT auth.uid())
    OR public.is_squad_member(id, (SELECT auth.uid()))
    OR (check_id IS NOT NULL AND public.has_down_response(check_id, (SELECT auth.uid())))
  );
