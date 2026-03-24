-- ==========================================================================
-- 1. Add visibility column to events
-- ==========================================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'friends'));

-- Backfill from is_public
UPDATE public.events SET visibility = CASE WHEN is_public THEN 'public' ELSE 'friends' END;

-- Keep is_public in sync via trigger
CREATE OR REPLACE FUNCTION public.sync_event_is_public()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_public := (NEW.visibility = 'public');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_event_visibility ON public.events;
CREATE TRIGGER sync_event_visibility
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_is_public();

-- ==========================================================================
-- 2. Update events SELECT RLS to use is_friend_or_fof for 'friends' visibility
-- ==========================================================================
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
CREATE POLICY "Events visible based on visibility" ON public.events
  FOR SELECT USING (
    created_by = (SELECT auth.uid())
    OR visibility = 'public'
    OR (visibility = 'friends' AND public.is_friend_or_fof((SELECT auth.uid()), created_by))
  );

-- ==========================================================================
-- 3. Add related_event_id to notifications
-- ==========================================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

-- ==========================================================================
-- 4. Add friend_event notification type
-- ==========================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event'
  ));

-- ==========================================================================
-- 5. Notify direct friends when someone posts a public event
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.notify_friend_event()
RETURNS TRIGGER AS $$
DECLARE
  author_name TEXT;
  friend_id UUID;
BEGIN
  -- Only notify for public events
  IF NEW.visibility != 'public' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO author_name
  FROM public.profiles WHERE id = NEW.created_by;

  FOR friend_id IN
    SELECT CASE
      WHEN requester_id = NEW.created_by THEN addressee_id
      ELSE requester_id
    END
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = NEW.created_by OR addressee_id = NEW.created_by)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (
      friend_id,
      'friend_event',
      author_name || ' posted an event',
      LEFT(NEW.title, 80),
      NEW.created_by,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_event ON public.events;
CREATE TRIGGER on_friend_event
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_friend_event();
