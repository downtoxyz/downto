import { supabase } from './supabase';
import { toLocalISODate } from './utils';
import type {
  Profile,
  Event,
  SavedEvent,
  Friendship,
  InterestCheck,
  CheckResponse,
  Squad,
  Message,
  Notification,
  CrewPoolEntry,
} from './types';

// ============================================================================
// PROFILES
// ============================================================================

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  return data;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

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

export async function logVersionPing(buildId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("version_pings")
    .insert({ user_id: user.id, build_id: buildId });
}

// ============================================================================
// EVENTS
// ============================================================================

export async function getPublicEvents(date?: Date): Promise<Event[]> {
  const today = toLocalISODate(new Date());
  let query = supabase
    .from('events')
    .select('*')
    .eq('is_public', true)
    .order('date', { ascending: true });

  if (date) {
    query = query.eq('date', toLocalISODate(date));
  } else {
    query = query.gte('date', today);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getFriendsEvents(): Promise<Event[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get accepted friend IDs
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (!friendships || friendships.length === 0) return [];

  const friendIds = friendships.map(f =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  );

  const today = toLocalISODate(new Date());
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('created_by', friendIds)
    .gte('date', today)
    .order('date', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('events')
    .insert({ ...event, created_by: user.id })
    .select()
    .single();

  if (error) {
    throw new Error(`createEvent failed: ${error.message} (${error.code})`);
  }
  return data;
}

export async function updateEvent(
  eventId: string,
  updates: Partial<Pick<Event, 'title' | 'venue' | 'date' | 'date_display' | 'time_display' | 'vibes' | 'image_url' | 'movie_metadata' | 'letterboxd_url'>>
): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function findEventByIgUrl(igUrl: string): Promise<import('./types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('ig_url', igUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function findEventByDiceUrl(diceUrl: string): Promise<import('./types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('dice_url', diceUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function findEventByLetterboxdUrl(letterboxdUrl: string): Promise<import('./types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('letterboxd_url', letterboxdUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

// ============================================================================
// SAVED EVENTS
// ============================================================================

export async function getSavedEvents(): Promise<(SavedEvent & { event: Event })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('saved_events')
    .select('*, event:events(*)')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function saveEvent(eventId: string): Promise<SavedEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('saved_events')
    .insert({ user_id: user.id, event_id: eventId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unsaveEvent(eventId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('saved_events')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function toggleDown(eventId: string, isDown: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('saved_events')
    .update({ is_down: isDown })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function getPeopleDown(eventId: string): Promise<(SavedEvent & { user: Profile })[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('*, user:profiles(*)')
    .eq('event_id', eventId)
    .eq('is_down', true);

  if (error) throw error;
  return data ?? [];
}

export async function getPeopleDownBatch(
  eventIds: string[]
): Promise<Record<string, { name: string; avatar: string; mutual: boolean; userId: string }[]>> {
  if (eventIds.length === 0) return {};

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  const { data, error } = await supabase
    .from('saved_events')
    .select('event_id, user:profiles(*)')
    .in('event_id', eventIds)
    .eq('is_down', true);

  if (error) throw error;

  // Get friend IDs for mutual detection
  let friendIds: Set<string> = new Set();
  if (currentUserId) {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

    if (friendships) {
      friendIds = new Set(
        friendships.map(f =>
          f.requester_id === currentUserId ? f.addressee_id : f.requester_id
        )
      );
    }
  }

  const result: Record<string, { name: string; avatar: string; mutual: boolean; userId: string }[]> = {};
  for (const row of (data ?? []) as unknown as { event_id: string; user: Profile }[]) {
    const eventId = row.event_id;
    if (!result[eventId]) result[eventId] = [];
    const profile = row.user;
    if (profile && profile.id !== currentUserId) {
      result[eventId].push({
        name: profile.display_name,
        avatar: profile.avatar_letter,
        mutual: friendIds.has(profile.id),
        userId: profile.id,
      });
    }
  }
  return result;
}

// ============================================================================
// FRIENDSHIPS
// ============================================================================

export async function getFriends(): Promise<{ profile: Profile; friendshipId: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester:profiles!requester_id(*),
      addressee:profiles!addressee_id(*)
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
    .select('*, requester:profiles!requester_id(*)')
    .eq('addressee_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
  return data ?? [];
}

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check if the other user already sent us a pending request — if so, accept it
  const { data: existing } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', userId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    const { data: accepted, error: acceptError } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', existing.id)
      .select()
      .single();
    if (acceptError) throw acceptError;
    return accepted;
  }

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: userId })
    .select()
    .single();

  if (error) throw error;
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

export function subscribeToFriendships(
  userId: string,
  callback: (event: 'INSERT' | 'UPDATE' | 'DELETE', friendship: Friendship) => void
) {
  // Subscribe to changes where we're the addressee (incoming requests, deletions)
  const ch1 = supabase
    .channel(`friendships:addressee:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friendships',
        filter: `addressee_id=eq.${userId}`,
      },
      (payload) => callback(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', (payload.new ?? payload.old) as Friendship)
    )
    .subscribe();

  // Subscribe to changes where we're the requester (our request got accepted/deleted)
  const ch2 = supabase
    .channel(`friendships:requester:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friendships',
        filter: `requester_id=eq.${userId}`,
      },
      (payload) => callback(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', (payload.new ?? payload.old) as Friendship)
    )
    .subscribe();

  return { unsubscribe: () => { ch1.unsubscribe(); ch2.unsubscribe(); } };
}

export async function getSuggestedUsers(): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get all users the current user has any friendship with (pending or accepted)
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
// INTEREST CHECKS
// ============================================================================

export async function getHiddenCheckIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('hidden_checks')
    .select('check_id')
    .eq('user_id', user.id);

  if (error) throw error;
  return (data ?? []).map((r) => r.check_id);
}

export async function hideCheck(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('hidden_checks')
    .insert({ user_id: user.id, check_id: checkId });

  if (error) {
    // Ignore duplicate (already hidden)
    if (error.code === '23505') return;
    throw error;
  }
}

export async function unhideCheck(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('hidden_checks')
    .delete()
    .eq('user_id', user.id)
    .eq('check_id', checkId);

  if (error) throw error;
}

export async function getFofAnnotations(): Promise<{ check_id: string; via_friend_name: string }[]> {
  const { data, error } = await supabase.rpc('get_fof_check_annotations');
  if (error) throw error;
  return data ?? [];
}

export async function getActiveChecks(): Promise<(InterestCheck & { author: Profile; responses: (CheckResponse & { user: Profile })[]; squads: { id: string; archived_at: string | null; members: { id: string }[] }[] })[]> {
  const { data, error } = await supabase
    .from('interest_checks')
    .select(`
      *,
      author:profiles!author_id(*),
      responses:check_responses(*, user:profiles!user_id(*)),
      squads(id, archived_at, members:squad_members(id))
    `)
    .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
    .or(`event_date.gte.${new Date().toISOString().slice(0, 10)},event_date.is.null`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createInterestCheck(
  text: string,
  expiresInHours: number | null = 24,
  eventDate: string | null = null,
  maxSquadSize: number = 5,
  movieData?: { letterboxdUrl: string; title: string; year?: string; director?: string; thumbnail?: string; vibes?: string[] },
  eventTime: string | null = null,
): Promise<InterestCheck> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let expiresAt: string | null = null;
  if (expiresInHours != null) {
    const d = new Date();
    d.setHours(d.getHours() + expiresInHours);
    expiresAt = d.toISOString();
  }

  const insertData: Record<string, unknown> = {
    author_id: user.id,
    text,
    expires_at: expiresAt,
    event_date: eventDate,
    event_time: eventTime,
    max_squad_size: maxSquadSize,
  };

  if (movieData) {
    insertData.letterboxd_url = movieData.letterboxdUrl;
    insertData.movie_metadata = {
      title: movieData.title,
      year: movieData.year,
      director: movieData.director,
      thumbnail: movieData.thumbnail,
      vibes: movieData.vibes,
    };
  }

  const { data, error } = await supabase
    .from('interest_checks')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInterestCheck(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('interest_checks')
    .delete()
    .eq('id', checkId)
    .eq('author_id', user.id);

  if (error) throw error;
}

export async function updateInterestCheck(
  checkId: string,
  updates: { text?: string; max_squad_size?: number }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('interest_checks')
    .update(updates)
    .eq('id', checkId)
    .eq('author_id', user.id);

  if (error) throw error;
}

export async function removeCheckResponse(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('check_responses')
    .delete()
    .eq('check_id', checkId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function respondToCheck(
  checkId: string,
  response: 'down' | 'maybe' | 'nah'
): Promise<CheckResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_responses')
    .upsert({
      check_id: checkId,
      user_id: user.id,
      response,
    }, { onConflict: 'check_id,user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function subscribeToChecks(
  callback: () => void
) {
  const ch1 = supabase
    .channel('interest_checks:all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'interest_checks' },
      () => callback()
    )
    .subscribe();

  const ch2 = supabase
    .channel('check_responses:all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_responses' },
      () => callback()
    )
    .subscribe();

  return { unsubscribe: () => { ch1.unsubscribe(); ch2.unsubscribe(); } };
}

// ============================================================================
// SQUADS
// ============================================================================

export async function getSquads(): Promise<Squad[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // First get squads the user is a member of
  const { data: memberOf, error: memberError } = await supabase
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', user.id);

  if (memberError) throw memberError;
  if (!memberOf || memberOf.length === 0) return [];

  const squadIds = memberOf.map(m => m.squad_id);

  // Then fetch those squads with their data (exclude expired)
  const { data, error } = await supabase
    .from('squads')
    .select(`
      *,
      event:events(*),
      check:interest_checks(author_id),
      members:squad_members(*, user:profiles!user_id(*)),
      messages(*, sender:profiles!sender_id(*))
    `)
    .in('id', squadIds)
    .is('archived_at', null)
    .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: true, referencedTable: 'messages' });

  if (error) throw error;
  return data ?? [];
}

export async function getSquadByCheckId(checkId: string): Promise<Squad | null> {
  const { data, error } = await supabase
    .from('squads')
    .select('*')
    .eq('check_id', checkId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function joinSquad(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('squad_members')
    .insert({ squad_id: squadId, user_id: user.id });

  if (error) throw error;
}

export async function leaveSquad(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function createSquad(
  name: string,
  memberIds: string[],
  eventId?: string,
  checkId?: string
): Promise<Squad> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create squad
  const { data: squad, error: squadError } = await supabase
    .from('squads')
    .insert({
      name,
      event_id: eventId,
      check_id: checkId,
      created_by: user.id,
    })
    .select()
    .single();

  if (squadError) throw squadError;

  // Add members (including creator)
  const allMemberIds = [...new Set([user.id, ...memberIds])];
  const { error: membersError } = await supabase
    .from('squad_members')
    .insert(
      allMemberIds.map((userId) => ({
        squad_id: squad.id,
        user_id: userId,
      }))
    );

  if (membersError) throw membersError;

  return squad;
}

// ============================================================================
// MESSAGES (with realtime)
// ============================================================================

export async function sendMessage(squadId: string, text: string): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: user.id,
      text,
    })
    .select('*, sender:profiles(*)')
    .single();

  if (error) throw error;
  return data;
}

export function subscribeToMessages(
  squadId: string,
  callback: (message: Message) => void
) {
  return supabase
    .channel(`squad:${squadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `squad_id=eq.${squadId}`,
      },
      async (payload) => {
        const msg = payload.new as Message;
        // Realtime payloads don't include joined data, so fetch sender profile
        if (msg.sender_id && !msg.sender) {
          const { data: sender } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', msg.sender_id)
            .single();
          if (sender) msg.sender = sender;
        }
        callback(msg);
      }
    )
    .subscribe();
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

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function getNotifications(): Promise<Notification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('notifications')
    .select('*, related_user:profiles!related_user_id(*)')
    .eq('user_id', user.id)
    .neq('type', 'squad_message')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .neq('type', 'squad_message');

  if (error) throw error;
  return count ?? 0;
}

export async function getUnreadSquadIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('related_squad_id')
    .eq('user_id', user.id)
    .eq('is_read', false)
    .eq('type', 'squad_message')
    .not('related_squad_id', 'is', null);

  if (error) return [];
  const ids = new Set(data.map((n) => n.related_squad_id as string));
  return [...ids];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function markSquadNotificationsRead(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('related_squad_id', squadId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) throw error;
}

export function subscribeToNotifications(
  userId: string,
  callback: (notification: Notification) => void
) {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => callback(payload.new as Notification)
    )
    .subscribe();
}

// ============================================================================
// SQUAD LOGISTICS
// ============================================================================

export async function updateSquadName(squadId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('squads')
    .update({ name })
    .eq('id', squadId);

  if (error) throw error;
}

export async function updateSquadLogistics(
  squadId: string,
  updates: { meeting_spot?: string; arrival_time?: string; transport_notes?: string }
): Promise<void> {
  const { error } = await supabase
    .from('squads')
    .update(updates)
    .eq('id', squadId);

  if (error) throw error;
}

export async function extendSquad(squadId: string, days: number = 7): Promise<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/squads/extend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ squadId, days }),
  });

  if (!res.ok) throw new Error('Failed to extend squad');
  const { expiresAt } = await res.json();
  return expiresAt;
}

// ============================================================================
// DATE CONFIRMS
// ============================================================================

export async function getDateConfirms(squadId: string): Promise<{
  userId: string;
  response: 'yes' | 'no' | null;
  respondedAt: string | null;
}[]> {
  const { data, error } = await supabase
    .from('squad_date_confirms')
    .select('user_id, response, responded_at')
    .eq('squad_id', squadId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    response: row.response as 'yes' | 'no' | null,
    respondedAt: row.responded_at,
  }));
}

export async function respondToDateConfirm(
  squadId: string,
  response: 'yes' | 'no'
): Promise<{ removed?: boolean }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/squads/confirm-date', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ squadId, response }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to respond to date confirm');
  }

  return res.json();
}

// ============================================================================
// CREW POOL
// ============================================================================

export async function joinCrewPool(eventId: string): Promise<CrewPoolEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('crew_pool')
    .insert({ event_id: eventId, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function leaveCrewPool(eventId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('crew_pool')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function getCrewPool(eventId: string): Promise<(CrewPoolEntry & { user: Profile })[]> {
  const { data, error } = await supabase
    .from('crew_pool')
    .select('*, user:profiles(*)')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function removeFromCrewPool(eventId: string, userIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('crew_pool')
    .delete()
    .eq('event_id', eventId)
    .in('user_id', userIds);

  if (error) throw error;
}

export async function getCrewPoolBatch(
  eventIds: string[]
): Promise<Record<string, { userId: string; name: string; avatar: string; mutual: boolean }[]>> {
  if (eventIds.length === 0) return {};

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  const { data, error } = await supabase
    .from('crew_pool')
    .select('event_id, user_id, user:profiles(*)')
    .in('event_id', eventIds);

  if (error) throw error;

  // Get friend IDs for mutual detection
  let friendIds: Set<string> = new Set();
  if (currentUserId) {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

    if (friendships) {
      friendIds = new Set(
        friendships.map(f =>
          f.requester_id === currentUserId ? f.addressee_id : f.requester_id
        )
      );
    }
  }

  const result: Record<string, { userId: string; name: string; avatar: string; mutual: boolean }[]> = {};
  for (const row of (data ?? []) as unknown as { event_id: string; user_id: string; user: Profile }[]) {
    const eventId = row.event_id;
    if (!result[eventId]) result[eventId] = [];
    const profile = row.user;
    if (profile && profile.id !== currentUserId) {
      result[eventId].push({
        userId: profile.id,
        name: profile.display_name,
        avatar: profile.avatar_letter,
        mutual: friendIds.has(profile.id),
      });
    }
  }
  return result;
}

export async function getUserPoolEventIds(
  eventIds: string[]
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from('crew_pool')
    .select('event_id')
    .in('event_id', eventIds)
    .eq('user_id', user.id);

  if (error) throw error;
  return new Set((data ?? []).map(r => r.event_id));
}

export async function getEventSocialSignal(eventId: string): Promise<{ totalDown: number; friendsDown: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  const { data, error } = await supabase
    .from('saved_events')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('is_down', true);

  if (error) throw error;

  const allDown = (data ?? []).filter(d => d.user_id !== currentUserId);
  const totalDown = allDown.length;

  if (!currentUserId || totalDown === 0) return { totalDown, friendsDown: 0 };

  // Get friend IDs
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

  const friendIds = new Set(
    (friendships ?? []).map(f =>
      f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    )
  );

  const friendsDown = allDown.filter(d => friendIds.has(d.user_id)).length;
  return { totalDown, friendsDown };
}
