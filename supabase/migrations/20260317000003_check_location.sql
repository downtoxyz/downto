-- Add location column to interest_checks
ALTER TABLE public.interest_checks ADD COLUMN IF NOT EXISTS location TEXT;
