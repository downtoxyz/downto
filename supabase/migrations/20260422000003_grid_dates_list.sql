-- Swap availability polls from contiguous start/end to an explicit list of dates.
-- This lets users pick non-contiguous dates (e.g. "this Sat and next Sat") while
-- still keeping day_offset-based cells — day_offset is now an index into the
-- dates array rather than a day delta.

ALTER TABLE public.squad_polls
  ADD COLUMN IF NOT EXISTS grid_dates JSONB;

-- Backfill existing availability polls: expand range into sequential dates.
UPDATE public.squad_polls
SET grid_dates = (
  SELECT jsonb_agg(to_char(d::date, 'YYYY-MM-DD') ORDER BY d)
  FROM generate_series(grid_range_start, grid_range_end, interval '1 day') AS d
)
WHERE poll_type = 'availability'
  AND grid_range_start IS NOT NULL
  AND grid_range_end IS NOT NULL
  AND grid_dates IS NULL;

-- Drop the obsolete range columns.
ALTER TABLE public.squad_polls
  DROP COLUMN IF EXISTS grid_range_start,
  DROP COLUMN IF EXISTS grid_range_end;
