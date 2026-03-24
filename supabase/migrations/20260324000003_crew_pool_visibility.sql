-- Update crew_pool SELECT policy to inherit visibility from the parent event.
-- Public events: anyone can see pool members.
-- Friends-only events: only friends & FoF of the event creator can see pool members.

DROP POLICY IF EXISTS "Anyone can view crew pool" ON public.crew_pool;

CREATE POLICY "Crew pool visible based on event visibility" ON public.crew_pool
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = crew_pool.event_id
      AND (
        e.visibility = 'public'
        OR e.created_by = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), e.created_by)
      )
    )
  );
