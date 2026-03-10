-- 1. Replace promote_waitlisted_member with race-safe version
--    FOR UPDATE SKIP LOCKED prevents concurrent callers from picking the same row.
--    The role = 'waitlist' guard on UPDATE ensures only one caller actually promotes.

CREATE OR REPLACE FUNCTION public.promote_waitlisted_member(p_squad_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
  v_squad_name TEXT;
  v_check_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  -- Get linked check for capacity info
  SELECT s.check_id INTO v_check_id
  FROM squads s WHERE s.id = p_squad_id;

  -- If no linked check, no waitlist concept — skip
  IF v_check_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if there's actually room now
  SELECT ic.max_squad_size INTO v_max_size
  FROM interest_checks ic WHERE ic.id = v_check_id;

  SELECT COUNT(*) INTO v_current_count
  FROM squad_members
  WHERE squad_id = p_squad_id AND role = 'member';

  IF v_current_count >= v_max_size THEN
    RETURN NULL;
  END IF;

  -- Find first waitlisted member (earliest joined_at)
  -- FOR UPDATE SKIP LOCKED prevents concurrent callers from picking the same row
  SELECT sm.user_id INTO v_user_id
  FROM squad_members sm
  WHERE sm.squad_id = p_squad_id AND sm.role = 'waitlist'
  ORDER BY sm.joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Promote to member (role = 'waitlist' guard ensures idempotency)
  UPDATE squad_members
  SET role = 'member'
  WHERE squad_id = p_squad_id AND user_id = v_user_id AND role = 'waitlist';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO v_name FROM profiles WHERE id = v_user_id;
  SELECT name INTO v_squad_name FROM squads WHERE id = p_squad_id;

  -- System message
  INSERT INTO messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL,
          coalesce(v_name, 'Someone') || ' was promoted from the waitlist',
          TRUE);

  -- Notification
  INSERT INTO notifications (user_id, type, title, body, related_squad_id)
  VALUES (v_user_id, 'squad_invite',
          coalesce(v_squad_name, 'Squad'),
          'A spot opened up — you''re in!',
          p_squad_id);

  RETURN v_user_id;
END;
$$;

-- 2. Remove duplicate "promoted from the waitlist" system messages.
--    Keep the earliest message per (squad_id, text) combination.
DELETE FROM messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY squad_id, text ORDER BY created_at ASC) AS rn
    FROM messages
    WHERE is_system = TRUE
      AND text LIKE '% was promoted from the waitlist'
  ) dupes
  WHERE rn > 1
);

-- 3. Remove duplicate "spot opened up" notifications.
--    Keep the earliest notification per (user_id, related_squad_id, body) combination.
DELETE FROM notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id, related_squad_id, body ORDER BY created_at ASC) AS rn
    FROM notifications
    WHERE type = 'squad_invite'
      AND body = 'A spot opened up — you''re in!'
  ) dupes
  WHERE rn > 1
);
