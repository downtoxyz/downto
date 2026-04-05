-- Add theme_enabled flag to profiles (default false)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_enabled BOOLEAN NOT NULL DEFAULT false;
