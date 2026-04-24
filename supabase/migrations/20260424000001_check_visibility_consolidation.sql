-- Consolidate interest-check visibility + temporal logic into a single SQL
-- predicate (check_is_active) used by RLS and the cron archiver. Before this,
-- the same rule was re-implemented in the client `.or()` chain, the RLS
-- policy, and the cron — and drifted (most recently: UTC-vs-local skew hid
-- checks dated for the author's local "today" once UTC rolled midnight).
--
-- After this migration the client doesn't need temporal filters at all —
-- RLS returns exactly the rows the viewer should see.


-- 1. Per-check timezone so "today" is unambiguous. Backfill existing rows
--    to 'America/New_York' — current user base is NYC; if we open up to
--    other regions we'll want to carry a tz on profiles and use that.
ALTER TABLE public.interest_checks
  ADD COLUMN IF NOT EXISTS event_tz TEXT;

UPDATE public.interest_checks
  SET event_tz = 'America/New_York'
  WHERE event_tz IS NULL;


-- 2. check_is_active(ic) — the ONE temporal predicate.
--
--    Semantic (codifying today's ad-hoc .or() logic):
--      • archived_at IS NOT NULL → not active
--      • event_date wins when set: active iff event_date >= today-in-its-tz
--      • otherwise expires_at rules (NULL = forever, handled by the
--        dateless-stale cron after 14 days).
--
--    STABLE, not IMMUTABLE — references now(). Postgres accepts STABLE
--    inside RLS USING clauses.
CREATE OR REPLACE FUNCTION public.check_is_active(ic public.interest_checks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    ic.archived_at IS NULL
    AND CASE
      WHEN ic.event_date IS NOT NULL THEN
        ic.event_date >= (now() AT TIME ZONE COALESCE(ic.event_tz, 'UTC'))::date
      ELSE
        ic.expires_at IS NULL OR ic.expires_at > now()
    END;
$$;


-- 3. RLS SELECT policy: activeness + friend/FoF/co-author in one place.
DROP POLICY IF EXISTS "Interest checks visible to friends and fof" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends and fof" ON public.interest_checks
  FOR SELECT USING (
    public.check_is_active(interest_checks.*)
    AND (
      author_id = (SELECT auth.uid())
      OR public.is_friend_or_fof((SELECT auth.uid()), author_id)
      OR public.is_friend_of_coauthor((SELECT auth.uid()), id)
    )
  );


-- 4. Cron archiver uses the same predicate — no CURRENT_DATE-in-UTC skew.
CREATE OR REPLACE FUNCTION public.archive_past_date_checks()
RETURNS INT AS $$
DECLARE affected INT;
BEGIN
  UPDATE public.interest_checks ic
    SET archived_at = now()
    WHERE archived_at IS NULL
      AND NOT public.check_is_active(ic);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
