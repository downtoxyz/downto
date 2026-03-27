-- Waitlist for when signup cap is reached.
-- Stores email + timestamp so admin can manually invite later.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS needed — only accessed via service client in API route.
