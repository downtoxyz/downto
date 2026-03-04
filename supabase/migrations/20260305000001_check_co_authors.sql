-- ============================================================================
-- Check Co-Authors: Tag friends as co-authors on interest checks
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.check_co_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(check_id, user_id)
);

CREATE INDEX idx_check_co_authors_check ON public.check_co_authors(check_id);
CREATE INDEX idx_check_co_authors_user ON public.check_co_authors(user_id);

-- 2. SECURITY DEFINER helper (follows is_squad_member / is_friend_or_fof pattern)
CREATE OR REPLACE FUNCTION public.is_check_author_or_coauthor(p_check_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.interest_checks WHERE id = p_check_id AND author_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.check_co_authors
    WHERE check_id = p_check_id AND user_id = p_user_id AND status = 'accepted'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. RLS on check_co_authors
ALTER TABLE public.check_co_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Co-authors visible to check viewers"
  ON public.check_co_authors FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR invited_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_co_authors.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

CREATE POLICY "Authors and co-authors can tag"
  ON public.check_co_authors FOR INSERT
  WITH CHECK (
    invited_by = (SELECT auth.uid())
    AND public.is_check_author_or_coauthor(check_id, (SELECT auth.uid()))
  );

CREATE POLICY "Tagged users can respond"
  ON public.check_co_authors FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Authors and inviters can remove co-authors"
  ON public.check_co_authors FOR DELETE
  USING (
    invited_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_co_authors.check_id
      AND ic.author_id = (SELECT auth.uid())
    )
  );

-- 4. Update interest_checks RLS for co-author edit/delete
DROP POLICY IF EXISTS "Users can update own interest checks" ON public.interest_checks;
CREATE POLICY "Authors and co-authors can update interest checks"
  ON public.interest_checks FOR UPDATE
  USING (public.is_check_author_or_coauthor(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete own interest checks" ON public.interest_checks;
CREATE POLICY "Authors and co-authors can delete interest checks"
  ON public.interest_checks FOR DELETE
  USING (public.is_check_author_or_coauthor(id, (SELECT auth.uid())));

-- 5. Add check_tag notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag'
  ));

-- 6. Trigger: notify tagged user
CREATE OR REPLACE FUNCTION public.notify_check_tag()
RETURNS TRIGGER AS $$
DECLARE
  inviter_name TEXT;
  check_text TEXT;
BEGIN
  SELECT display_name INTO inviter_name
    FROM public.profiles WHERE id = NEW.invited_by;

  SELECT text INTO check_text
    FROM public.interest_checks WHERE id = NEW.check_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    NEW.user_id,
    'check_tag',
    inviter_name || ' tagged you',
    LEFT(check_text, 80),
    NEW.invited_by,
    NEW.check_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_check_tag
  AFTER INSERT ON public.check_co_authors
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_tag();

-- 7. Trigger: auto-respond "down" on accept
CREATE OR REPLACE FUNCTION public.auto_down_on_coauthor_accept()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.check_responses (check_id, user_id, response)
    VALUES (NEW.check_id, NEW.user_id, 'down')
    ON CONFLICT (check_id, user_id) DO UPDATE SET response = 'down';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_coauthor_accept
  AFTER UPDATE ON public.check_co_authors
  FOR EACH ROW EXECUTE FUNCTION public.auto_down_on_coauthor_accept();

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_co_authors;
