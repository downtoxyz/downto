-- ============================================================================
-- Check Comments: Public comments on interest checks
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.check_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 280),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_check_comments_check_created ON public.check_comments(check_id, created_at ASC);

-- 2. RLS
ALTER TABLE public.check_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments visible to check viewers" ON public.check_comments;
CREATE POLICY "Comments visible to check viewers"
  ON public.check_comments FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_comments.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can comment on visible checks" ON public.check_comments;
CREATE POLICY "Users can comment on visible checks"
  ON public.check_comments FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_comments.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.check_comments;
CREATE POLICY "Users can delete own comments"
  ON public.check_comments FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 3. Add check_comment notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment'
  ));

-- 4. Notification trigger: notify check author on new comment
CREATE OR REPLACE FUNCTION public.notify_check_comment()
RETURNS TRIGGER AS $$
DECLARE
  commenter_name TEXT;
  check_author_id UUID;
  check_text TEXT;
BEGIN
  SELECT ic.author_id, ic.text INTO check_author_id, check_text
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- Don't notify if commenting on own check
  IF check_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO commenter_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    check_author_id,
    'check_comment',
    commenter_name || ' commented',
    LEFT(NEW.text, 80),
    NEW.user_id,
    NEW.check_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_comment ON public.check_comments;
CREATE TRIGGER on_check_comment
  AFTER INSERT ON public.check_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_comment();

-- 5. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.check_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
