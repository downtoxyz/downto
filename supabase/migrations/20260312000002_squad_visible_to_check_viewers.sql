-- Fix #9: New friend can't see/join squad from pre-existing interest check.
-- If you can see the check (friend/FoF of author), you can see its squad.
-- Without this, the "Join Squad →" button never renders because RLS blocks
-- the squad data before the user has a chance to interact.

-- Helper: check if user can view a check's linked squad via friend/FoF
-- relationship with the check author. SECURITY DEFINER to bypass RLS on
-- interest_checks (same pattern as is_squad_member, has_down_response).
CREATE OR REPLACE FUNCTION public.can_view_check_squad(p_check_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.interest_checks ic
    WHERE ic.id = p_check_id
    AND public.is_friend_or_fof(p_user_id, ic.author_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Expand squads SELECT policy to include check viewers
DROP POLICY IF EXISTS "Squads visible to members" ON public.squads;
CREATE POLICY "Squads visible to members" ON public.squads
  FOR SELECT USING (
    created_by = (SELECT auth.uid())
    OR public.is_squad_member(id, (SELECT auth.uid()))
    OR (check_id IS NOT NULL AND public.has_down_response(check_id, (SELECT auth.uid())))
    OR (check_id IS NOT NULL AND public.can_view_check_squad(check_id, (SELECT auth.uid())))
  );
