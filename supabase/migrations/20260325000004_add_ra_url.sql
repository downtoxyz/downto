-- Add Resident Advisor URL column for event dedup
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ra_url TEXT;
CREATE INDEX IF NOT EXISTS idx_events_ra_url ON public.events(ra_url) WHERE ra_url IS NOT NULL;
