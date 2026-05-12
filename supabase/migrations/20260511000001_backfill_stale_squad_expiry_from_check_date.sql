-- Two fixes for the squad-expiry-from-check-date flow:
--
-- 1. Backfill squads whose linked check.event_date was edited BEFORE the
--    20260505000001 trigger existed. Their expires_at is still anchored to
--    the original date, so the cron eventually archives them even though the
--    check itself moved to a future date. (See: "5k bakery roulette" — date
--    moved to May 31 on May 4, trigger added May 5, squad archived May 12
--    against the stale May-12 expiry.)
--
-- 2. Update recalc_squad_expiry_on_check_date_change() to also clear
--    warned_at when expires_at moves forward. Otherwise the 1h "expires
--    soon" warning is suppressed forever after a date extension, since
--    warned_at IS NULL is a precondition for the cron to re-warn.
--
-- The new expires_at uses the same formula as set_squad_expiry() and the
-- existing trigger: (event_date + 1 day) + 24h grace.

CREATE OR REPLACE FUNCTION public.recalc_squad_expiry_on_check_date_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT DISTINCT FROM OLD.event_date THEN
    RETURN NEW;
  END IF;

  UPDATE public.squads
  SET expires_at = CASE
    WHEN NEW.event_date IS NOT NULL
      THEN (NEW.event_date + INTERVAL '1 day') + INTERVAL '24 hours'
    ELSE NOW() + INTERVAL '24 hours'
  END,
  warned_at = NULL
  WHERE check_id = NEW.id
    AND archived_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: align expires_at with check.event_date for any check-linked squad
-- where the two are out of sync. Resurrects squads that were wrongly archived
-- (archived_at set, but the check's event_date is still in the future).
UPDATE public.squads s
SET
  expires_at = (ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours',
  archived_at = NULL,
  warned_at = NULL
FROM public.interest_checks ic
WHERE s.check_id = ic.id
  AND ic.event_date IS NOT NULL
  AND (ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours' > NOW()
  AND s.expires_at IS DISTINCT FROM (ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours';
