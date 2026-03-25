-- Friends-of-friends suggestions with mutual friend context.
-- SECURITY DEFINER bypasses friendships RLS (can't read other users' friends).
CREATE OR REPLACE FUNCTION public.get_friends_of_friends()
RETURNS TABLE(
  suggested_user_id UUID,
  mutual_friend_id UUID,
  mutual_friend_name TEXT
) AS $$
  WITH my_friends AS (
    -- All accepted friends of the current user
    SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END AS friend_id
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = auth.uid() OR addressee_id = auth.uid())
  ),
  fof AS (
    -- Friends of my friends (excluding me and my direct friends)
    SELECT
      CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END AS fof_id,
      mf.friend_id AS via_friend_id
    FROM public.friendships f
    JOIN my_friends mf ON (f.requester_id = mf.friend_id OR f.addressee_id = mf.friend_id)
    WHERE f.status = 'accepted'
      AND CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END != auth.uid()
  ),
  -- Exclude anyone I already have a friendship with (any status)
  existing AS (
    SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END AS user_id
    FROM public.friendships
    WHERE requester_id = auth.uid() OR addressee_id = auth.uid()
  )
  SELECT DISTINCT ON (fof.fof_id)
    fof.fof_id AS suggested_user_id,
    fof.via_friend_id AS mutual_friend_id,
    p.display_name AS mutual_friend_name
  FROM fof
  JOIN public.profiles p ON p.id = fof.via_friend_id
  WHERE fof.fof_id NOT IN (SELECT user_id FROM existing)
    AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = fof.fof_id AND pr.is_test = true)
  ORDER BY fof.fof_id, random()
  LIMIT 20;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
