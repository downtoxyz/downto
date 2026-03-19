-- Deduplicate friend request notifications: delete previous unread ones
-- from the same requester before creating a new one
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
  requester_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT display_name INTO requester_name
    FROM public.profiles WHERE id = NEW.requester_id;

    -- Remove any previous unread friend_request from this requester to this addressee
    DELETE FROM public.notifications
    WHERE user_id = NEW.addressee_id
      AND type = 'friend_request'
      AND related_user_id = NEW.requester_id
      AND is_read = false;

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id)
    VALUES (
      NEW.addressee_id,
      'friend_request',
      'New friend request',
      requester_name || ' wants to connect',
      NEW.requester_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
