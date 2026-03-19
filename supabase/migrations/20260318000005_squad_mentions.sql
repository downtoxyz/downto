-- Add mentions column to messages for @mention tracking
ALTER TABLE public.messages ADD COLUMN mentions UUID[] DEFAULT '{}';

-- Add squad_mention notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention'
  ));

-- Update the squad message notification trigger to handle mentions
CREATE OR REPLACE FUNCTION public.notify_squad_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  squad_name TEXT;
  member_id UUID;
  mention_ids UUID[];
BEGIN
  -- Skip system messages
  IF NEW.sender_id IS NULL OR NEW.is_system = true THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  SELECT name INTO squad_name
  FROM public.squads WHERE id = NEW.squad_id;

  mention_ids := COALESCE(NEW.mentions, '{}');

  FOR member_id IN
    SELECT user_id FROM public.squad_members
    WHERE squad_id = NEW.squad_id AND user_id != NEW.sender_id
  LOOP
    IF member_id = ANY(mention_ids) THEN
      -- Mentioned user gets a distinct notification
      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
      VALUES (
        member_id,
        'squad_mention',
        squad_name,
        sender_name || ' mentioned you: ' || LEFT(NEW.text, 80),
        NEW.sender_id,
        NEW.squad_id
      );
    ELSE
      -- Regular squad message notification
      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
      VALUES (
        member_id,
        'squad_message',
        squad_name,
        sender_name || ': ' || LEFT(NEW.text, 80),
        NEW.sender_id,
        NEW.squad_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
