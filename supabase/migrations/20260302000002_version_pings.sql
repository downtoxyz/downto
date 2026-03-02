-- Version pings: track which build each user is running
CREATE TABLE IF NOT EXISTS public.version_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  build_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_version_pings_user ON public.version_pings(user_id);
CREATE INDEX idx_version_pings_build ON public.version_pings(build_id);

ALTER TABLE public.version_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own pings"
  ON public.version_pings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own pings"
  ON public.version_pings FOR SELECT
  USING (auth.uid() = user_id);
