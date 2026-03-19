-- Add mentions column to check_comments
ALTER TABLE public.check_comments ADD COLUMN mentions UUID[] DEFAULT '{}';

-- Add comment_mention notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention'
  ));

-- Update trigger to also notify mentioned users
CREATE OR REPLACE FUNCTION public.notify_check_comment()
RETURNS TRIGGER AS $$
DECLARE
  commenter_name TEXT;
  check_author_id UUID;
  check_text TEXT;
  mention_id UUID;
BEGIN
  SELECT ic.author_id, ic.text INTO check_author_id, check_text
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  SELECT display_name INTO commenter_name
  FROM public.profiles WHERE id = NEW.user_id;

  -- Notify check author (unless they are the commenter)
  IF check_author_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      check_author_id,
      'check_comment',
      commenter_name || ' commented',
      LEFT(NEW.text, 80),
      NEW.user_id,
      NEW.check_id
    );
  END IF;

  -- Notify mentioned users (skip author if already notified, skip commenter)
  IF NEW.mentions IS NOT NULL THEN
    FOREACH mention_id IN ARRAY NEW.mentions LOOP
      IF mention_id != NEW.user_id AND mention_id != check_author_id THEN
        INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
        VALUES (
          mention_id,
          'comment_mention',
          commenter_name || ' mentioned you',
          LEFT(NEW.text, 80),
          NEW.user_id,
          NEW.check_id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
