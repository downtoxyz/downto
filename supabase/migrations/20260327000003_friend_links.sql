-- One-time instant friendship URLs.
-- Security: UUID v4 token (unguessable), one-time use, 24h expiry, max 5 active per user.

CREATE TABLE IF NOT EXISTS public.friend_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  redeemed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_friend_links_token ON public.friend_links(token);
CREATE INDEX idx_friend_links_creator ON public.friend_links(creator_id);

-- RLS
ALTER TABLE public.friend_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own links" ON public.friend_links
  FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "Users can create own links" ON public.friend_links
  FOR INSERT WITH CHECK (creator_id = auth.uid());

-- RPC: create a friend link (enforces max 5 active per user)
CREATE OR REPLACE FUNCTION public.create_friend_link()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_count INT;
  v_token UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Count active (unredeemed, unexpired) links
  SELECT COUNT(*) INTO v_active_count
  FROM public.friend_links
  WHERE creator_id = v_user_id
    AND redeemed_by IS NULL
    AND expires_at > NOW();

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'Too many active friend links (max 5)';
  END IF;

  INSERT INTO public.friend_links (creator_id)
  VALUES (v_user_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: redeem a friend link (one-time use, creates mutual friendship)
CREATE OR REPLACE FUNCTION public.redeem_friend_link(p_token UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link RECORD;
  v_creator_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the link
  SELECT * INTO v_link
  FROM public.friend_links
  WHERE token = p_token
  FOR UPDATE; -- lock to prevent double-redemption

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'Link not found');
  END IF;

  IF v_link.redeemed_by IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Link already used');
  END IF;

  IF v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'Link expired');
  END IF;

  IF v_link.creator_id = v_user_id THEN
    RETURN jsonb_build_object('error', 'Cannot use your own link');
  END IF;

  -- Check if already friends
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = v_user_id AND addressee_id = v_link.creator_id)
        OR (requester_id = v_link.creator_id AND addressee_id = v_user_id))
  ) THEN
    RETURN jsonb_build_object('error', 'Already friends', 'already_friends', true);
  END IF;

  -- Mark link as redeemed
  UPDATE public.friend_links
  SET redeemed_by = v_user_id, redeemed_at = NOW()
  WHERE id = v_link.id;

  -- Create or accept friendship
  -- If there's a pending request in either direction, accept it
  UPDATE public.friendships
  SET status = 'accepted', updated_at = NOW()
  WHERE status = 'pending'
    AND ((requester_id = v_user_id AND addressee_id = v_link.creator_id)
      OR (requester_id = v_link.creator_id AND addressee_id = v_user_id));

  -- If no existing friendship, create one as accepted
  IF NOT FOUND THEN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_link.creator_id, v_user_id, 'accepted')
    ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'accepted', updated_at = NOW();
  END IF;

  -- Get creator name for the response
  SELECT display_name INTO v_creator_name
  FROM public.profiles WHERE id = v_link.creator_id;

  RETURN jsonb_build_object(
    'success', true,
    'creator_id', v_link.creator_id,
    'creator_name', COALESCE(v_creator_name, 'Someone')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
