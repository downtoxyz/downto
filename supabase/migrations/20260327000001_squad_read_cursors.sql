-- Replace notification-row-based squad unread tracking with read cursors.
-- One row per user per squad instead of one notification row per message per member.

-- 1. New table
CREATE TABLE IF NOT EXISTS public.squad_read_cursors (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, squad_id)
);

CREATE INDEX idx_squad_read_cursors_squad ON public.squad_read_cursors(squad_id);

-- 2. RLS
ALTER TABLE public.squad_read_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cursors" ON public.squad_read_cursors
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own cursors" ON public.squad_read_cursors
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own cursors" ON public.squad_read_cursors
  FOR UPDATE USING (user_id = auth.uid());

-- 3. Seed cursors for existing squad members (so they don't see old messages as unread)
INSERT INTO public.squad_read_cursors (user_id, squad_id, last_read_at)
SELECT sm.user_id, sm.squad_id, NOW()
FROM public.squad_members sm
WHERE sm.role != 'waitlist'
ON CONFLICT DO NOTHING;

-- 4. Auto-create cursor when user joins a squad
CREATE OR REPLACE FUNCTION public.init_squad_read_cursor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'waitlist' THEN
    INSERT INTO public.squad_read_cursors (user_id, squad_id, last_read_at)
    VALUES (NEW.user_id, NEW.squad_id, NOW())
    ON CONFLICT (user_id, squad_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_init_cursor ON public.squad_members;
CREATE TRIGGER on_squad_member_init_cursor
  AFTER INSERT ON public.squad_members
  FOR EACH ROW EXECUTE FUNCTION public.init_squad_read_cursor();

-- 5. RPC: get squad IDs with unread messages for a user
CREATE OR REPLACE FUNCTION public.get_unread_squad_ids(p_user_id UUID)
RETURNS TABLE(squad_id UUID) AS $$
  SELECT DISTINCT m.squad_id
  FROM public.messages m
  JOIN public.squad_read_cursors src ON src.squad_id = m.squad_id AND src.user_id = p_user_id
  WHERE m.created_at > src.last_read_at
    AND m.sender_id IS DISTINCT FROM p_user_id
    AND m.is_system = false;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
