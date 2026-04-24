-- Seed the staging DB with enough relational data to demo every major feed
-- surface in Vercel Preview deployments: feed, saved events, squads.
--
-- Idempotent — every INSERT is guarded by ON CONFLICT or a NOT EXISTS check,
-- so you can re-run after `supabase db push` without blowing up.
--
-- Run against staging:
--   psql "$STAGING_DB_URL" -f supabase/seed-staging.sql
--
-- Prerequisites: profiles, events, interest_checks, and friendships already
-- populated (staging currently has 19 profiles / 2 events / 5 checks, plenty).


-- =============================================================================
-- 1. Saved events — mark a few profiles "down" on the existing events so the
--    calendar / saved view isn't empty.
-- =============================================================================
INSERT INTO public.saved_events (user_id, event_id, is_down, saved_at)
SELECT p.id, e.id, TRUE, now() - (INTERVAL '1 day' * random() * 5)
FROM (SELECT id FROM public.profiles ORDER BY created_at LIMIT 5) p
CROSS JOIN public.events e
ON CONFLICT (user_id, event_id) DO NOTHING;


-- =============================================================================
-- 2. Squads — create one squad per active interest check that doesn't already
--    have one, using the check's author as creator. Add the author + up to
--    two "down" responders as members.
-- =============================================================================
DO $$
DECLARE
  v_check RECORD;
  v_squad_id UUID;
  v_responder UUID;
BEGIN
  FOR v_check IN
    SELECT ic.id, ic.text, ic.author_id
    FROM public.interest_checks ic
    WHERE ic.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.squads s WHERE s.check_id = ic.id)
    LIMIT 2
  LOOP
    -- Create the squad
    INSERT INTO public.squads (name, check_id, created_by)
    VALUES (LEFT(v_check.text, 40), v_check.id, v_check.author_id)
    RETURNING id INTO v_squad_id;

    -- Author is always a member
    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_squad_id, v_check.author_id)
    ON CONFLICT DO NOTHING;

    -- Add up to 2 down responders (who aren't the author)
    FOR v_responder IN
      SELECT cr.user_id
      FROM public.check_responses cr
      WHERE cr.check_id = v_check.id
        AND cr.response = 'down'
        AND cr.user_id <> v_check.author_id
      LIMIT 2
    LOOP
      INSERT INTO public.squad_members (squad_id, user_id)
      VALUES (v_squad_id, v_responder)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;


-- =============================================================================
-- 3. Squad chat — drop one opener message into each squad so the chat view
--    renders something when a preview user taps in.
-- =============================================================================
INSERT INTO public.messages (squad_id, sender_id, text, created_at)
SELECT s.id, s.created_by, 'who''s in? 👋', now() - interval '10 minutes'
FROM public.squads s
WHERE NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.squad_id = s.id);


-- =============================================================================
-- Post-run sanity: row counts you should see now.
-- =============================================================================
-- SELECT 'profiles' AS t, count(*) FROM public.profiles
--   UNION ALL SELECT 'events',         count(*) FROM public.events
--   UNION ALL SELECT 'interest_checks',count(*) FROM public.interest_checks
--   UNION ALL SELECT 'saved_events',   count(*) FROM public.saved_events
--   UNION ALL SELECT 'squads',         count(*) FROM public.squads
--   UNION ALL SELECT 'squad_members',  count(*) FROM public.squad_members
--   UNION ALL SELECT 'messages',       count(*) FROM public.messages;
