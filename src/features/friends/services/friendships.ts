import { createClient } from '@/lib/supabase/server';
import { Friend } from '../types';

// Get list of friends for current user
export async function getFriends(): Promise<Friend[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .select(
      `
      id,
      requester:profiles!requester_id(*),
      addressee:profiles!addressee_id(*)
    `
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) throw error;

  // Return the other person in each friendship along with friendship ID
  return (data ?? [])
    .map((f) => ({
      profile: f.requester?.id === user.id ? f.addressee : f.requester,
      friendshipId: f.id,
    }))
    .filter((r) => r.profile) as Friend[];
}
