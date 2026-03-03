-- Add role column to squad_members: 'member' (active) or 'waitlist'
ALTER TABLE public.squad_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- RPC: join a check-linked squad if room, or join as waitlisted.
-- Returns JSON: { "status": "joined" | "waitlisted" }

CREATE OR REPLACE FUNCTION public.join_squad_if_room(p_squad_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_id UUID;
  v_max_size INT;
  v_current_count INT;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get linked check for this squad
  SELECT s.check_id INTO v_check_id
  FROM squads s WHERE s.id = p_squad_id;

  -- If no linked check, just insert (non-check squads have no cap)
  IF v_check_id IS NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (p_squad_id, v_user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'joined');
  END IF;

  -- Get max size from the interest check
  SELECT ic.max_squad_size INTO v_max_size
  FROM interest_checks ic WHERE ic.id = v_check_id;

  -- Count current active members (not waitlisted)
  SELECT COUNT(*) INTO v_current_count
  FROM squad_members
  WHERE squad_id = p_squad_id AND role = 'member';

  -- If room: join as member
  IF v_current_count < v_max_size THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (p_squad_id, v_user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'joined');
  END IF;

  -- Full: join as waitlisted
  INSERT INTO squad_members (squad_id, user_id, role)
  VALUES (p_squad_id, v_user_id, 'waitlist')
  ON CONFLICT (squad_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'waitlisted');
END;
$$;

-- Helper: true only for active (non-waitlisted) members
CREATE OR REPLACE FUNCTION public.is_active_squad_member(p_squad_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_members
    WHERE squad_id = p_squad_id AND user_id = p_user_id AND role = 'member'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update message INSERT policy: only active members can send
DROP POLICY IF EXISTS "Squad members can send messages" ON public.messages;
CREATE POLICY "Squad members can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_active_squad_member(squad_id, auth.uid())
  );
