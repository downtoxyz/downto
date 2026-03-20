-- Add referred_by_check_id to profiles for PWA referral persistence
ALTER TABLE profiles
  ADD COLUMN referred_by_check_id UUID REFERENCES interest_checks(id) ON DELETE SET NULL;
