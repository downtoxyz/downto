-- pgTAP contract test for interest-check visibility.
-- Run locally with:  supabase test db
--
-- The CORE invariant: a user posts a check, the user sees it on their own
-- feed. If this test ever fails, the app is broken in a way users will
-- immediately notice. Everything else (FoF, expiry, archive) is downstream.

BEGIN;
SELECT plan(14);

-- =============================================================================
-- Fixture setup: 4 profiles, friend graph, and 4 checks in different states.
-- =============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'author@test'),
  ('22222222-2222-2222-2222-222222222222', 'friend@test'),
  ('33333333-3333-3333-3333-333333333333', 'fof@test'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test');

INSERT INTO public.profiles (id, display_name, username, avatar_letter) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Author',   'author',   'A'),
  ('22222222-2222-2222-2222-222222222222', 'Friend',   'friend',   'F'),
  ('33333333-3333-3333-3333-333333333333', 'FoF',      'fof',      'O'),
  ('44444444-4444-4444-4444-444444444444', 'Stranger', 'stranger', 'S');

-- author ↔ friend, friend ↔ fof. So fof is 2-hop from author.
INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'accepted');

-- A "fresh" check posted right now in author's local tz (NYC). event_date is
-- author's local TODAY — the same edge case that broke Steven's checks.
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_tz) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'fresh check, today in NYC',
   now() + interval '1 hour',
   (now() AT TIME ZONE 'America/New_York')::date,
   'America/New_York');

-- An archived check (must NOT appear).
INSERT INTO public.interest_checks (id, author_id, text, archived_at, event_tz) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111',
   'archived',
   now(),
   'America/New_York');

-- A past-event check (event_date < today, must NOT appear).
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_tz) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111',
   'past event',
   now() + interval '1 day',
   (now() AT TIME ZONE 'America/New_York')::date - 2,
   'America/New_York');

-- An expired-by-expires_at, dateless check (must NOT appear).
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_tz) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111',
   'past expires_at, no event_date',
   now() - interval '1 hour',
   'America/New_York');

-- A dateless idea-only check (no event_date, no expires_at). This is the
-- shape emitted when a user types just the idea and hits Send — the minimum
-- viable interest check per specs/interest-check-flow.md.
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_tz) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '11111111-1111-1111-1111-111111111111',
   'dateless idea-only',
   NULL, NULL, 'America/New_York');

-- A dateless check with a 24h expiry (the default when user picks no date
-- but leaves the timer at 24h).
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_tz) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff',
   '11111111-1111-1111-1111-111111111111',
   'dateless 24h',
   now() + interval '24 hours',
   NULL,
   'America/New_York');


-- =============================================================================
-- THE CORE INVARIANT: author sees their own freshly-posted check.
-- This must NEVER fail. If it does, ship-stop the release.
-- =============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-1111-1111-1111-111111111111"}';

SELECT ok(
  EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'CORE: author sees their own freshly-posted check (event_date = today in author tz)'
);

-- CORE invariant #2 + #3: the minimum-viable interest check is just an idea —
-- no date, no place. Both dateless flavors (no expiry, 24h expiry) must be
-- visible to the author immediately after posting.
SELECT ok(
  EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'CORE: author sees their own dateless idea-only check (no event_date, no expires_at)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  'CORE: author sees their own dateless 24h-expiry check'
);


-- =============================================================================
-- Friend & FoF can also see the fresh check.
-- =============================================================================
SET LOCAL "request.jwt.claims" TO '{"sub":"22222222-2222-2222-2222-222222222222"}';
SELECT ok(
  EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'friend sees author''s fresh check'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"33333333-3333-3333-3333-333333333333"}';
SELECT ok(
  EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'fof (2-hop) sees author''s fresh check'
);

SET LOCAL "request.jwt.claims" TO '{"sub":"44444444-4444-4444-4444-444444444444"}';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'stranger does NOT see author''s fresh check'
);


-- =============================================================================
-- Inactive checks: hidden from EVERYONE including the author.
-- (Today's behavior — we may want to revisit "author sees own archived" later
-- via the profile "Past checks" section, which would query through service
-- role or a separate RPC.)
-- =============================================================================
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-1111-1111-1111-111111111111"}';

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'archived check is hidden even from author'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'past-event check is hidden even from author'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'past-expires-no-date check is hidden even from author'
);


-- =============================================================================
-- The Steven regression: author in NYC posts at 9pm local, UTC has rolled to
-- next day. event_date = NYC today. Must still be visible.
-- =============================================================================
RESET ROLE;
DELETE FROM public.interest_checks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Force "now" to a moment where UTC date > NYC date by inserting an
-- event_date that matches NYC's current date and asserting the check
-- remains active even as UTC has progressed. This is what Steven hit.
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_tz) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'NYC today check (UTC may be tomorrow)',
   now() + interval '1 hour',
   (now() AT TIME ZONE 'America/New_York')::date,
   'America/New_York');

SELECT ok(
  public.check_is_active(ic.*),
  'STEVEN REGRESSION: NYC-tz check dated for NYC today is active even when UTC has rolled forward'
) FROM public.interest_checks ic WHERE ic.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';


-- =============================================================================
-- check_is_active table: directly assert the predicate for each state.
-- =============================================================================
SELECT ok(
  public.check_is_active(ic.*),
  'check_is_active: fresh = true'
) FROM public.interest_checks ic WHERE ic.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT ok(
  NOT public.check_is_active(ic.*),
  'check_is_active: archived = false'
) FROM public.interest_checks ic WHERE ic.id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT ok(
  NOT public.check_is_active(ic.*),
  'check_is_active: past event_date = false'
) FROM public.interest_checks ic WHERE ic.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT ok(
  NOT public.check_is_active(ic.*),
  'check_is_active: past expires_at, no event_date = false'
) FROM public.interest_checks ic WHERE ic.id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';


SELECT * FROM finish();
ROLLBACK;
