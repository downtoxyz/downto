-- RPC to get a shared check with author and responses (bypasses RLS)
-- Used after auto-responding to a shared check link during onboarding
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
  response_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ic.id,
    ic.text,
    ic.author_id,
    p.display_name AS author_name,
    p.avatar_letter AS author_avatar,
    ic.event_date,
    ic.event_time,
    ic.location,
    ic.expires_at,
    ic.created_at,
    (SELECT COUNT(*) FROM public.check_responses cr WHERE cr.check_id = ic.id) AS response_count
  FROM public.interest_checks ic
  JOIN public.profiles p ON p.id = ic.author_id
  WHERE ic.id = p_check_id
    AND ic.shared_at IS NOT NULL
    AND ic.archived_at IS NULL;
$$;
