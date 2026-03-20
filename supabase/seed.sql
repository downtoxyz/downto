-- ============================================================================
-- TEST SEED DATA
-- ============================================================================
-- Creates test users via Supabase auth, profiles, friendships, events,
-- interest checks, a squad with messages — everything the E2E tests need.
--
-- This runs after all migrations via `supabase db reset` or `supabase start`.
-- ============================================================================

-- ─── Test users (created via auth.users + auth.identities) ───────────────────
-- GoTrue requires both tables to look up users for magic links.

-- User 1: kat@test.com
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_confirm_status)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'kat@test.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"username": "kat", "display_name": "Kat"}'::jsonb,
  now(), now(), '', '', '', '', 0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "kat@test.com"}'::jsonb,
  'email',
  'a1111111-1111-1111-1111-111111111111',
  now(), now(), now()
) ON CONFLICT DO NOTHING;

-- User 2: sara@test.com
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_confirm_status)
VALUES (
  'b2222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'sara@test.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"username": "sara", "display_name": "Sara"}'::jsonb,
  now(), now(), '', '', '', '', 0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "sara@test.com"}'::jsonb,
  'email',
  'b2222222-2222-2222-2222-222222222222',
  now(), now(), now()
) ON CONFLICT DO NOTHING;

-- Mark profiles as onboarded (profiles created by handle_new_user trigger)
UPDATE public.profiles SET onboarded = true WHERE id IN (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222'
);

-- Users 3-18: extra test users for response volume testing
DO $$
DECLARE
  names TEXT[] := ARRAY['Devon','Nickon','Marco','Jess','Alex','Mia','Leo','Zoe','Finn','Sage','Kai','Luna','River','Nova','Blake','Quinn'];
  i INT;
  uid UUID;
  uname TEXT;
BEGIN
  FOR i IN 1..16 LOOP
    uid := ('cc' || lpad(i::text, 6, '0') || '-0000-0000-0000-000000000000')::uuid;
    uname := lower(names[i]);
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_confirm_status)
    VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', uname || '@test.com', crypt('testpass123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('username', uname, 'display_name', names[i]), now(), now(), '', '', '', '', 0)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (uid, uid, jsonb_build_object('sub', uid::text, 'email', uname || '@test.com'), 'email', uid::text, now(), now(), now())
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET onboarded = true WHERE id = uid;
    -- Make friends with Kat
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES ('a1111111-1111-1111-1111-111111111111', uid, 'accepted')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ─── Friendship (accepted) ───────────────────────────────────────────────────

INSERT INTO public.friendships (id, requester_id, addressee_id, status)
VALUES (
  'f1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'accepted'
) ON CONFLICT DO NOTHING;

-- ─── Public event (today) ────────────────────────────────────────────────────

INSERT INTO public.events (id, title, venue, date, date_display, time_display, vibes, is_public, created_by)
VALUES (
  'e1111111-1111-1111-1111-111111111111',
  'Test Night Out',
  'The Warehouse',
  CURRENT_DATE,
  'Tonight',
  '10 PM',
  ARRAY['house', 'techno'],
  true,
  'a1111111-1111-1111-1111-111111111111'
) ON CONFLICT (id) DO NOTHING;

-- A future event (tomorrow) — should NOT appear in tonight feed
INSERT INTO public.events (id, title, venue, date, date_display, time_display, vibes, is_public, created_by)
VALUES (
  'e2222222-2222-2222-2222-222222222222',
  'Tomorrow Hangout',
  'Rooftop Bar',
  CURRENT_DATE + 1,
  'Tomorrow',
  '8 PM',
  ARRAY['chill'],
  true,
  'b2222222-2222-2222-2222-222222222222'
) ON CONFLICT (id) DO NOTHING;

-- ─── Interest check (from Sara, visible to Kat via friendship) ───────────────

INSERT INTO public.interest_checks (id, author_id, text, expires_at)
VALUES (
  'c1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'anyone down for drinks tonight?',
  now() + interval '24 hours'
) ON CONFLICT (id) DO NOTHING;

-- ─── More interest checks (for testing comments) ──────────────────────────────

-- Kat's check
INSERT INTO public.interest_checks (id, author_id, text, expires_at)
VALUES (
  'c2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'LNY parade this weekend — who wants to go?',
  now() + interval '48 hours'
) ON CONFLICT (id) DO NOTHING;

-- Sara's check with no expiry
INSERT INTO public.interest_checks (id, author_id, text, expires_at)
VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'looking for a group to try that new ramen spot in the east village',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- ─── Responses: 17 down on Sara's drinks check ──────────────────────────────

INSERT INTO public.check_responses (check_id, user_id, response) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000001-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000002-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000003-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000004-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000005-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000006-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000007-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000008-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000009-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000010-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000011-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000012-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000013-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000014-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000015-0000-0000-0000-000000000000', 'down'),
  ('c1111111-1111-1111-1111-111111111111', 'cc000016-0000-0000-0000-000000000000', 'down')
ON CONFLICT DO NOTHING;

-- ─── Sample comments ──────────────────────────────────────────────────────────

-- Comments on Sara's drinks check
INSERT INTO public.check_comments (check_id, user_id, text, created_at) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'where were you thinking?', now() - interval '2 hours'),
  ('c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'maybe that new bar on orchard st', now() - interval '1 hour 50 minutes'),
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'oh wait the one with the rooftop?? im so down', now() - interval '1 hour 45 minutes')
ON CONFLICT DO NOTHING;

-- Comment on Kat's parade check
INSERT INTO public.check_comments (check_id, user_id, text, created_at) VALUES
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'which one? the one on saturday was way better last year', now() - interval '30 minutes')
ON CONFLICT DO NOTHING;

-- ─── Puzzle Pints check (locked in, with squad) ────────────────────────────

INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, date_flexible, time_flexible)
VALUES (
  'c4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  'puzzle pints this week?',
  (CURRENT_DATE + 2)::date::timestamp + interval '23 hours 59 minutes',
  CURRENT_DATE + 2,
  '6pm',
  false,
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.check_responses (check_id, user_id, response) VALUES
  ('c4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'down'),
  ('c4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'down'),
  ('c4444444-4444-4444-4444-444444444444', 'cc000001-0000-0000-0000-000000000000', 'down')
ON CONFLICT DO NOTHING;

-- ─── Squad with messages ─────────────────────────────────────────────────────

INSERT INTO public.squads (id, name, check_id, created_by)
VALUES (
  'd1111111-1111-1111-1111-111111111111',
  'Drinks Crew',
  'c1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.squad_members (squad_id, user_id) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('d1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (squad_id, sender_id, text, created_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'hey! where should we meet?', now() - interval '10 minutes'),
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'how about the lobby at 9?', now() - interval '5 minutes')
ON CONFLICT DO NOTHING;

-- ─── Puzzle Pints squad (locked date) ──────────────────────────────────────

INSERT INTO public.squads (id, name, check_id, created_by, locked_date, date_status, expires_at)
VALUES (
  'd2222222-2222-2222-2222-222222222222',
  'Puzzle Pints Crew',
  'c4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  CURRENT_DATE + 2,
  'locked',
  (CURRENT_DATE + 3)::date::timestamp + interval '23 hours 59 minutes'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.squad_members (squad_id, user_id) VALUES
  ('d2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('d2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222'),
  ('d2222222-2222-2222-2222-222222222222', 'cc000001-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (squad_id, sender_id, text, is_system, created_at) VALUES
  ('d2222222-2222-2222-2222-222222222222', NULL, 'Kat locked in ' || to_char(CURRENT_DATE + 2, 'Dy, Mon DD') || ' at 6pm', true, now() - interval '2 minutes')
ON CONFLICT DO NOTHING;

-- ─── Date/time/location matrix checks (all 7 non-empty combos) ──────────────

-- 1. date only
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000001-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'picnic in the park this saturday?',
  now() + interval '24 hours',
  CURRENT_DATE + 5,
  NULL,
  NULL
) ON CONFLICT (id) DO NOTHING;

-- 2. time only
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000002-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'late night food run tonight',
  now() + interval '12 hours',
  NULL,
  '11pm',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- 3. location only
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000003-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'who wants to check out that new spot',
  now() + interval '24 hours',
  NULL,
  NULL,
  'East Village'
) ON CONFLICT (id) DO NOTHING;

-- 4. date + time
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000004-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'karaoke night let''s goooo',
  now() + interval '48 hours',
  CURRENT_DATE + 3,
  '8pm',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- 5. date + location
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000005-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'farmers market tmrw morning?',
  now() + interval '24 hours',
  CURRENT_DATE + 1,
  NULL,
  'Union Square'
) ON CONFLICT (id) DO NOTHING;

-- 6. time + location
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000006-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'ramen tonight anyone?',
  now() + interval '12 hours',
  NULL,
  '7pm',
  'Bushwick'
) ON CONFLICT (id) DO NOTHING;

-- 7. date + time + location
INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location)
VALUES (
  'c5000007-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'cooking dinner need taste testers',
  now() + interval '48 hours',
  CURRENT_DATE + 2,
  '6:30pm',
  'my place'
) ON CONFLICT (id) DO NOTHING;

-- ─── Shared check (for testing /check/[id] preview + CTA flow) ─────────────

INSERT INTO public.interest_checks (id, author_id, text, expires_at, event_date, event_time, location, shared_at)
VALUES (
  'c6666666-6666-6666-6666-666666666666',
  'b2222222-2222-2222-2222-222222222222',
  'rooftop hangs this weekend — who''s in?',
  now() + interval '72 hours',
  CURRENT_DATE + 2,
  '5pm',
  'Brooklyn',
  now()
) ON CONFLICT (id) DO NOTHING;
