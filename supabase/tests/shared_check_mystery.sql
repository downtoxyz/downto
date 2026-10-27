-- pgTAP: get_shared_check must not leak a mystery check's author before the event date (20261027000001).
-- The RPC is SECURITY DEFINER and anon-callable (public /check/[id] page, iOS pre-login banner).
-- Run locally with:  supabase test db
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES ('aa111111-1111-1111-1111-111111111111', 'mystery-author@test');
-- handle_new_user() already created the profile row from the auth.users insert; avatar_letter is GENERATED from display_name.
UPDATE public.profiles SET display_name = 'Author', username = 'mysteryauthor' WHERE id = 'aa111111-1111-1111-1111-111111111111';

INSERT INTO public.interest_checks (id, author_id, text, mystery, event_date, location, shared_at) VALUES
  ('bb111111-1111-1111-1111-111111111111', 'aa111111-1111-1111-1111-111111111111', 'future mystery',   true,  CURRENT_DATE + 3, 'somewhere', now()),
  ('bb222222-2222-2222-2222-222222222222', 'aa111111-1111-1111-1111-111111111111', 'today mystery',    true,  CURRENT_DATE,     'somewhere', now()),
  ('bb444444-4444-4444-4444-444444444444', 'aa111111-1111-1111-1111-111111111111', 'plain check',      false, CURRENT_DATE + 3, NULL,        now());

SET LOCAL ROLE anon;

SELECT is((SELECT author_name FROM public.get_shared_check('bb111111-1111-1111-1111-111111111111')), NULL, 'future mystery: author hidden from anon');
SELECT is((SELECT author_avatar FROM public.get_shared_check('bb111111-1111-1111-1111-111111111111')), NULL, 'future mystery: avatar hidden from anon');
SELECT is((SELECT mystery FROM public.get_shared_check('bb111111-1111-1111-1111-111111111111')), true, 'mystery flag is returned');
SELECT is((SELECT author_name FROM public.get_shared_check('bb222222-2222-2222-2222-222222222222')), 'Author', 'on the event date the author is revealed');
-- (a dateless mystery check cannot exist: interest_checks_mystery_requires_date_location)
SELECT is((SELECT author_name FROM public.get_shared_check('bb444444-4444-4444-4444-444444444444')), 'Author', 'non-mystery check shows its author');

SELECT * FROM finish();
ROLLBACK;
