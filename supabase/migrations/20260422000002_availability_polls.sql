-- When2Meet-style availability grid poll.
-- Third poll_type on squad_polls, plus a per-(user, day_offset, slot_index)
-- availability table. Storing day+slot ints (not timestamps) sidesteps tz
-- ambiguity — the grid is a conceptual one anchored at grid_range_start.

ALTER TABLE public.squad_polls
  DROP CONSTRAINT IF EXISTS squad_polls_poll_type_check;
ALTER TABLE public.squad_polls
  ADD CONSTRAINT squad_polls_poll_type_check
  CHECK (poll_type IN ('text', 'dates', 'availability'));

ALTER TABLE public.squad_polls
  ADD COLUMN IF NOT EXISTS grid_range_start DATE,
  ADD COLUMN IF NOT EXISTS grid_range_end   DATE,
  ADD COLUMN IF NOT EXISTS grid_hour_start  SMALLINT,
  ADD COLUMN IF NOT EXISTS grid_hour_end    SMALLINT,
  ADD COLUMN IF NOT EXISTS grid_slot_minutes SMALLINT;

-- Availability votes are simply (poll, user, day_offset, slot_index) presence rows.
-- Toggling a cell = insert or delete the row.
CREATE TABLE IF NOT EXISTS public.squad_poll_availability (
  poll_id    UUID NOT NULL REFERENCES public.squad_polls(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_offset SMALLINT NOT NULL,
  slot_index SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id, day_offset, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_squad_poll_availability_poll
  ON public.squad_poll_availability(poll_id);

ALTER TABLE public.squad_poll_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squad members can view availability"
  ON public.squad_poll_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.squad_polls p
      WHERE p.id = poll_id
        AND public.is_squad_member(p.squad_id, auth.uid())
    )
  );

CREATE POLICY "Service insert availability"
  ON public.squad_poll_availability FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service delete availability"
  ON public.squad_poll_availability FOR DELETE
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_poll_availability;
