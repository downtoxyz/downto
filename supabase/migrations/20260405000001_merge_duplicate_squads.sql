-- Merge duplicate squads for "Friendship bbq skewers" check (e90aea7d).
-- Squad 1 (d130a6d8) was the original with real conversation, prematurely archived.
-- Squad 2 (4f9d0c99) was created after archival, has only system messages.
-- Fix: move Squad 2 messages into Squad 1, unarchive Squad 1, delete Squad 2.

BEGIN;

-- 1. Move any non-system messages from Squad 2 into Squad 1
UPDATE public.messages
SET squad_id = 'd130a6d8-e129-44d5-8be1-8b817dbcbc61'
WHERE squad_id = '4f9d0c99-613e-4349-89b2-2ff3ea87137f'
  AND is_system = FALSE;

-- 2. Delete remaining (system) messages from Squad 2
DELETE FROM public.messages
WHERE squad_id = '4f9d0c99-613e-4349-89b2-2ff3ea87137f';

-- 3. Add any Squad 2 members that aren't already in Squad 1
INSERT INTO public.squad_members (squad_id, user_id)
SELECT 'd130a6d8-e129-44d5-8be1-8b817dbcbc61', sm.user_id
FROM public.squad_members sm
WHERE sm.squad_id = '4f9d0c99-613e-4349-89b2-2ff3ea87137f'
  AND sm.user_id NOT IN (
    SELECT user_id FROM public.squad_members
    WHERE squad_id = 'd130a6d8-e129-44d5-8be1-8b817dbcbc61'
  );

-- 4. Delete Squad 2 members then Squad 2 itself
DELETE FROM public.squad_members
WHERE squad_id = '4f9d0c99-613e-4349-89b2-2ff3ea87137f';

DELETE FROM public.squads
WHERE id = '4f9d0c99-613e-4349-89b2-2ff3ea87137f';

-- 5. Unarchive Squad 1 and fix its expiry to use the check's event_date
UPDATE public.squads
SET archived_at = NULL,
    warned_at = NULL,
    expires_at = (
      SELECT (ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours'
      FROM public.interest_checks ic
      WHERE ic.id = squads.check_id
    )
WHERE id = 'd130a6d8-e129-44d5-8be1-8b817dbcbc61';

COMMIT;
