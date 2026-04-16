-- Prevent squad creators from being removed from squad_members.
-- Previously the auto-leave triggers (un-down, date confirm "no", etc.) could
-- remove the squad creator, leaving the squad visible to members but invisible
-- to its own owner. That broke push/notification routing ("goes nowhere")
-- because getSquads filters by squad_members membership.

CREATE OR REPLACE FUNCTION public.prevent_squad_creator_removal()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  SELECT created_by INTO v_creator_id
  FROM public.squads WHERE id = OLD.squad_id;

  IF v_creator_id IS NOT NULL AND v_creator_id = OLD.user_id THEN
    -- Silently keep the creator in the squad
    RETURN NULL;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_delete_protect_creator ON public.squad_members;
CREATE TRIGGER on_squad_member_delete_protect_creator
  BEFORE DELETE ON public.squad_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_squad_creator_removal();
