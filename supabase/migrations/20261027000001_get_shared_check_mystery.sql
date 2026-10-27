-- get_shared_check: return `mystery`, and stop leaking the author of an unrevealed mystery check.
-- The RPC is SECURITY DEFINER and callable by anon (the public /check/[id] page + the iOS pre-login banner), so it must apply
-- the mystery rule itself: a mystery check reveals its author ON the event date (event_date > CURRENT_DATE → hidden; no date → hidden).
-- Mirrors src/features/checks/lib/mystery.ts isUnrevealed() for a viewer who is not the author.
DROP FUNCTION IF EXISTS public.get_shared_check(UUID);

CREATE OR REPLACE FUNCTION public.get_shared_check(p_check_id UUID)
RETURNS TABLE (
  id UUID,
  text TEXT,
  author_id UUID,
  author_name TEXT,
  author_avatar CHAR(1),
  event_date DATE,
  event_time TEXT,
  location TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  response_count BIGINT,
  mystery BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    ic.id,
    ic.text,
    ic.author_id,
    CASE WHEN ic.mystery AND (ic.event_date IS NULL OR ic.event_date > CURRENT_DATE) THEN NULL ELSE p.display_name END AS author_name,
    CASE WHEN ic.mystery AND (ic.event_date IS NULL OR ic.event_date > CURRENT_DATE) THEN NULL ELSE p.avatar_letter END AS author_avatar,
    ic.event_date,
    ic.event_time,
    ic.location,
    ic.expires_at,
    ic.created_at,
    (SELECT COUNT(*) FROM public.check_responses cr WHERE cr.check_id = ic.id) AS response_count,
    ic.mystery
  FROM public.interest_checks ic
  JOIN public.profiles p ON p.id = ic.author_id
  WHERE ic.id = p_check_id
    AND ic.shared_at IS NOT NULL
    AND ic.archived_at IS NULL;
$$;
