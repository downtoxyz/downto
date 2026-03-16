-- Squad polls: lightweight single-select polls in squad chats

-- 1. Polls table
CREATE TABLE public.squad_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,  -- ["Option A", "Option B", ...]
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Votes table
CREATE TABLE public.squad_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.squad_polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- 3. Indexes
CREATE INDEX idx_squad_polls_squad ON public.squad_polls(squad_id);
CREATE INDEX idx_squad_polls_squad_status ON public.squad_polls(squad_id, status);
CREATE INDEX idx_squad_poll_votes_poll ON public.squad_poll_votes(poll_id);

-- 4. RLS on squad_polls
ALTER TABLE public.squad_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squad members can view polls"
  ON public.squad_polls FOR SELECT
  USING (public.is_squad_member(squad_id, auth.uid()));

CREATE POLICY "Service insert polls"
  ON public.squad_polls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update polls"
  ON public.squad_polls FOR UPDATE
  USING (true);

-- 5. RLS on squad_poll_votes
ALTER TABLE public.squad_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squad members can view votes"
  ON public.squad_poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.squad_polls p
      WHERE p.id = poll_id
        AND public.is_squad_member(p.squad_id, auth.uid())
    )
  );

CREATE POLICY "Service insert votes"
  ON public.squad_poll_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update votes"
  ON public.squad_poll_votes FOR UPDATE
  USING (true);

-- 6. Realtime for live vote updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_poll_votes;

-- 7. Add poll_created notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created'
  ));
