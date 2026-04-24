-- Dates polls: structured date/time options in squad_polls
-- Existing polls stay 'text'. For 'dates' polls, the options JSONB is an
-- array of { date: 'YYYY-MM-DD', time: string | null } objects.

ALTER TABLE public.squad_polls
  ADD COLUMN IF NOT EXISTS poll_type TEXT NOT NULL DEFAULT 'text'
    CHECK (poll_type IN ('text', 'dates'));
