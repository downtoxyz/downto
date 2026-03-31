-- Auto-archive stale interest checks that have no event_date.
-- These can linger in feeds forever since neither expires_at nor event_date
-- triggers removal. Safety net: archive any dateless check older than 14 days.

-- Reusable function (can be called via pg_cron or manually)
CREATE OR REPLACE FUNCTION public.archive_stale_dateless_checks()
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.interest_checks
  SET archived_at = NOW()
  WHERE archived_at IS NULL
    AND event_date IS NULL
    AND expires_at IS NULL
    AND created_at < NOW() - INTERVAL '14 days';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also archive past-date checks (ongoing, not just one-shot like the earlier migration)
CREATE OR REPLACE FUNCTION public.archive_past_date_checks()
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.interest_checks
  SET archived_at = NOW()
  WHERE archived_at IS NULL
    AND event_date IS NOT NULL
    AND event_date < CURRENT_DATE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One-shot cleanup: archive any existing stale dateless checks right now
SELECT public.archive_stale_dateless_checks();
SELECT public.archive_past_date_checks();

-- Schedule both to run daily at 6am UTC via pg_cron (if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'archive-stale-dateless-checks',
      '0 6 * * *',
      'SELECT public.archive_stale_dateless_checks()'
    );
    PERFORM cron.schedule(
      'archive-past-date-checks',
      '0 6 * * *',
      'SELECT public.archive_past_date_checks()'
    );
  END IF;
END $$;
