import { supabase } from '../supabase';

import type { Profile, Friendship } from '../types';

export async function getFriendshipWith(userId: string): Promise<{ id: string; status: string; isRequester: boolean } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, status: data.status, isRequester: data.requester_id === user.id };
}

export async function getFriends(): Promise<{ profile: Profile; friendshipId: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // useFriends.hydrateFriends consumes id/display_name/username/
  // avatar_letter/availability/ig_handle. Was `(*)` per side — wasted
  // bandwidth on every friends-list refresh.
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester:profiles!requester_id(id, display_name, username, avatar_letter, availability, ig_handle),
      addressee:profiles!addressee_id(id, display_name, username, avatar_letter, availability, ig_handle)
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) throw error;

  // Return the other person in each friendship along with friendship ID
  return ((data ?? []) as unknown as { id: string; requester: Profile | null; addressee: Profile | null }[]).map((f) => ({
    profile: (f.requester?.id === user.id ? f.addressee : f.requester) as Profile,
    friendshipId: f.id,
  })).filter(r => r.profile);
}

export async function getPendingRequests(): Promise<(Friendship & { requester: Profile })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!requester_id(id, display_name, username, avatar_letter, availability, ig_handle)')
    .eq('addressee_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
  return data ?? [];
}

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Single query for both directions — was three sequential round-trips
  // (incoming-pending probe → outgoing probe → insert). Postgres still
  // hits the same indexes, but we save 1–2 round-trips per "send request"
  // tap.
  const { data: existing } = await supabase
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${user.id}),` +
      `and(requester_id.eq.${user.id},addressee_id.eq.${userId})`
    );

  // Inbound pending request from this user → upgrade to accepted (mutual).
  const incoming = existing?.find(
    (f) => f.requester_id === userId && f.addressee_id === user.id && f.status === 'pending'
  );
  if (incoming) {
    const { data: accepted, error: acceptError } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', incoming.id)
      .select()
      .single();
    if (acceptError) throw acceptError;
    return accepted;
  }

  // Outbound row already exists (pending or accepted) → idempotent return.
  const outgoing = existing?.find(
    (f) => f.requester_id === user.id && f.addressee_id === userId &&
      (f.status === 'pending' || f.status === 'accepted')
  );
  if (outgoing) return outgoing;

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: userId })
    .select()
    .single();

  if (error) {
    // Race with a concurrent sendFriendRequest (double-tap) or a pre-existing
    // row we didn't match above (e.g. blocked). Treat as idempotent.
    if ((error as { code?: string }).code === '23505') {
      const { data: raceRow } = await supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', user.id)
        .eq('addressee_id', userId)
        .maybeSingle();
      if (raceRow) return raceRow;
    }
    throw error;
  }
  return data;
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);

  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

// ============================================================================
// FRIEND LINKS
// ============================================================================

export async function createFriendLink(): Promise<string> {
  const { data, error } = await supabase.rpc('create_friend_link');
  if (error) throw error;
  return data as string;
}

export async function redeemFriendLink(token: string): Promise<{ success?: boolean; error?: string; creator_name?: string; already_friends?: boolean }> {
  const { data, error } = await supabase.rpc('redeem_friend_link', { p_token: token });
  if (error) throw error;
  return data as { success?: boolean; error?: string; creator_name?: string; already_friends?: boolean };
}

export function subscribeToFriendships(
  userId: string,
  callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', friendship: Friendship) => void
) {
  const channel = supabase
    .channel(`friendships:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friendships',
        filter: `or(addressee_id=eq.${userId},requester_id=eq.${userId})`,
      },
      (payload) => callback(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', (payload.new ?? payload.old) as Friendship)
    )
    .subscribe();

  return { unsubscribe: () => { channel.unsubscribe(); } };
}

export async function getOutgoingPendingRequests(): Promise<{ profile: Profile; friendshipId: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select('id, addressee:profiles!addressee_id(*)')
    .eq('requester_id', user.id)
    .eq('status', 'pending');

  if (error) return [];
  return ((data ?? []) as unknown as { id: string; addressee: Profile }[])
    .filter((r) => r.addressee)
    .map((r) => ({ profile: r.addressee, friendshipId: r.id }));
}

export async function getOutgoingPendingIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select('addressee_id')
    .eq('requester_id', user.id)
    .eq('status', 'pending');

  if (error) return [];
  return (data ?? []).map((r) => r.addressee_id);
}

export async function getSuggestedUsers(): Promise<(Profile & { mutualFriendName?: string })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Try friends-of-friends first
  const { data: fofData } = await supabase.rpc('get_friends_of_friends');
  if (fofData && fofData.length > 0) {
    // Fetch profiles for the suggested users
    const fofIds = fofData.map((r: { suggested_user_id: string }) => r.suggested_user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', fofIds);

    if (profiles && profiles.length > 0) {
      const nameMap = new Map(fofData.map((r: { suggested_user_id: string; mutual_friend_name: string }) => [r.suggested_user_id, r.mutual_friend_name]));
      return profiles.map((p) => ({ ...p, mutualFriendName: nameMap.get(p.id) ?? undefined }));
    }
  }

  // Fallback: random non-friend users (for users with no friends yet)
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const excludeIds = new Set<string>([user.id]);
  for (const f of friendships ?? []) {
    excludeIds.add(f.requester_id);
    excludeIds.add(f.addressee_id);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('id', 'in', `(${Array.from(excludeIds).join(',')})`)
    .neq('is_test', true)
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// SEARCH
// ============================================================================

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const sanitized = query.replace(/[%_]/g, '');
  if (!sanitized) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`)
    .neq('id', user.id)
    .neq('is_test', true)
    .limit(20);

  if (error) throw error;
  return data ?? [];
}
