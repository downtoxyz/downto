-- Combine the two-query waterfall in getFriendsEvents into a single RPC.
-- Previously: friendships SELECT (~500ms) → events SELECT, sequential.
-- Now: one round-trip that returns friend-authored upcoming events.

CREATE OR REPLACE FUNCTION public.get_friends_events()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE
      WHEN requester_id = (SELECT auth.uid()) THEN addressee_id
      ELSE requester_id
    END AS friend_id
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()))
  )
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'date')), '[]'::jsonb)
  FROM (
    SELECT to_jsonb(e) || jsonb_build_object(
      'creator', jsonb_build_object(
        'display_name', p.display_name,
        'avatar_letter', p.avatar_letter
      )
    ) AS row_data
    FROM public.events e
    LEFT JOIN public.profiles p ON p.id = e.created_by
    WHERE e.created_by IN (SELECT friend_id FROM friend_ids)
      AND e.date >= CURRENT_DATE
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_events() TO authenticated;
