import * as Sentry from '@sentry/nextjs';
import { supabase } from './supabase';
import { toLocalISODate } from './utils';

/** Prefix for fetch('/api/...') calls. Empty in web, full URL in Capacitor. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

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
  CheckCoAuthor,
  CheckComment,
  SquadJoinRequest,
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

export async function getCalendarToken(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('calendar_token')
    .eq('id', user.id)
    .single();

  if (error || !data?.calendar_token) return null;
  return data.calendar_token;
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

export async function logVersionPing(buildId: string, theme?: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("version_pings")
    .insert({ user_id: user.id, build_id: buildId, theme: theme ?? null });
}

// ============================================================================
// EVENTS
// ============================================================================

export async function getPublicEvents(date?: Date): Promise<Event[]> {
  const today = toLocalISODate(new Date());
  let query = supabase
    .from('events')
    .select('*, creator:profiles!created_by(display_name, avatar_letter)')
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
  // Single RPC: combines friendships lookup + events join + creator profile in one round-trip.
  // Returns a JSON array of events with `creator: { display_name, avatar_letter }` embedded.
  const { data, error } = await supabase.rpc('get_friends_events');
  if (error) throw error;
  return (data ?? []) as Event[];
}

export async function createEvent(event: Omit<Event, 'id' | 'created_at' | 'creator'>): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  Sentry.addBreadcrumb({
    category: 'db',
    message: 'createEvent',
    level: 'info',
    data: { title: event.title, visibility: (event as { visibility?: string }).visibility, hasIg: !!event.ig_url, hasDice: !!event.dice_url, hasLetterboxd: !!event.letterboxd_url, hasRa: !!(event as { ra_url?: string }).ra_url },
  });

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
  updates: Partial<Pick<Event, 'title' | 'venue' | 'date' | 'date_display' | 'time_display' | 'vibes' | 'image_url' | 'movie_metadata' | 'letterboxd_url' | 'note'>>
): Promise<Event> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  Sentry.addBreadcrumb({
    category: 'db',
    message: 'updateEvent',
    level: 'info',
    data: { eventId, fields: Object.keys(updates) },
  });

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

export async function findEventByRaUrl(raUrl: string): Promise<import('./types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('ra_url', raUrl)
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
    .select('*, event:events(*, creator:profiles!created_by(display_name, avatar_letter))')
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

type EventUserEntry = { userId: string; name: string; avatar: string; mutual: boolean };

async function fetchEventUsersBatch(
  table: 'saved_events' | 'crew_pool',
  eventIds: string[],
): Promise<Record<string, EventUserEntry[]>> {
  if (eventIds.length === 0) return {};

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  let query = supabase
    .from(table)
    .select('event_id, user:profiles(*)')
    .in('event_id', eventIds);

  if (table === 'saved_events') {
    query = query.eq('is_down', true);
  }

  const { data, error } = await query;
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

  const result: Record<string, EventUserEntry[]> = {};
  for (const row of (data ?? []) as unknown as { event_id: string; user: Profile }[]) {
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

export async function getPeopleDownBatch(
  eventIds: string[]
): Promise<Record<string, EventUserEntry[]>> {
  return fetchEventUsersBatch('saved_events', eventIds);
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
  const { data: incoming } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', userId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

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

  // Check if we already sent an outgoing request — return it as-is (idempotent)
  const { data: outgoing } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', user.id)
    .eq('addressee_id', userId)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();

  if (outgoing) return outgoing;

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
// INTEREST CHECKS
// ============================================================================

export async function getSharedCheck(checkId: string) {
  const { data, error } = await supabase.rpc('get_shared_check', { p_check_id: checkId });
  if (error || !data || data.length === 0) return null;
  const check = data[0] as {
    id: string; text: string; author_id: string;
    author_name: string; author_avatar: string;
    event_date: string | null; event_time: string | null;
    location: string | null; expires_at: string | null;
    created_at: string; response_count: number;
  };

  // Check if current user has responded and is in a squad for this check
  const { data: { user } } = await supabase.auth.getUser();
  let myResponse: string | null = null;
  let squadId: string | null = null;
  let squadMemberCount = 0;
  let inSquad = false;

  if (user) {
    const { data: resp } = await supabase
      .from('check_responses')
      .select('response')
      .eq('check_id', checkId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (resp) myResponse = resp.response;

    const { data: squad } = await supabase
      .from('squads')
      .select('id, members:squad_members(id, user_id, role)')
      .eq('check_id', checkId)
      .is('archived_at', null)
      .maybeSingle();
    if (squad) {
      squadId = squad.id;
      const members = squad.members as { id: string; user_id: string; role: string }[];
      squadMemberCount = members?.filter((m) => m.role !== 'waitlist')?.length ?? 0;
      const myMembership = members?.find((m) => m.user_id === user.id);
      inSquad = !!myMembership && myMembership.role !== 'waitlist';
    }
  }

  return { ...check, myResponse, squadId, squadMemberCount, inSquad };
}

export async function respondToSharedCheck(checkId: string): Promise<boolean> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return false;
  const res = await fetch(`${API_BASE}/api/checks/respond-shared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ checkId, response: 'down' }),
  });
  return res.ok;
}

export async function getCheckAuthorProfile(checkId: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('get_shared_check_author', { p_check_id: checkId });
  if (error || !data || data.length === 0) return null;
  return data[0] as Profile;
}

export async function setReferralCheckId(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Only set if not already set
  await supabase
    .from('profiles')
    .update({ referred_by_check_id: checkId })
    .eq('id', user.id)
    .is('referred_by_check_id', null);
}

export async function getReferralCheckId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('referred_by_check_id')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return data.referred_by_check_id ?? null;
}

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

export async function getActiveChecks(): Promise<(InterestCheck & { author: Profile; responses: (CheckResponse & { user: Profile })[]; squads: { id: string; archived_at: string | null; members: { id: string }[] }[]; co_authors: (CheckCoAuthor & { user: Profile })[] })[]> {
  // NOTE: this client-side temporal filter is intended to be removed once
  // migration 20260424000001 lands in prod (it moves this logic into
  // check_is_active() + the RLS SELECT policy). Until then the client must
  // filter — otherwise expired/archived checks leak into the feed. Keeping
  // it after the migration is redundant but harmless.
  const now = new Date();
  const nowIso = now.toISOString();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('interest_checks')
    .select(`
      *,
      author:profiles!author_id(*),
      responses:check_responses(*, user:profiles!user_id(*)),
      squads(id, archived_at, members:squad_members(id, user_id, role)),
      co_authors:check_co_authors(*, user:profiles!user_id(*))
    `)
    .or(`expires_at.gt.${nowIso},expires_at.is.null,event_date.gte.${todayLocal}`)
    .or(`event_date.gte.${todayLocal},event_date.is.null`)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createInterestCheck(
  text: string,
  expiresInHours: number | null = 24,
  eventDate: string | null = null,
  maxSquadSize: number | null = null,
  movieData?: { letterboxdUrl: string; title: string; year?: string; director?: string; thumbnail?: string; vibes?: string[] },
  eventTime: string | null = null,
  dateFlexible: boolean = true,
  timeFlexible: boolean = true,
  location: string | null = null,
): Promise<InterestCheck> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let expiresAt: string | null = null;
  if (expiresInHours != null) {
    const d = new Date();
    d.setHours(d.getHours() + expiresInHours);
    expiresAt = d.toISOString();
  }

  // Capture the author's local timezone so check_is_active() in SQL can
  // resolve "today" the same way the author did when picking event_date.
  const eventTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const insertData: Record<string, unknown> = {
    author_id: user.id,
    text,
    expires_at: expiresAt,
    event_date: eventDate,
    event_time: eventTime,
    event_tz: eventTz,
    date_flexible: dateFlexible,
    time_flexible: timeFlexible,
    max_squad_size: maxSquadSize,
    location,
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
  const { error } = await supabase
    .from('interest_checks')
    .delete()
    .eq('id', checkId);
  // RLS policy allows author and accepted co-authors

  if (error) throw error;
}

export async function archiveInterestCheck(checkId: string): Promise<void> {
  const { error } = await supabase
    .from('interest_checks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', checkId);

  if (error) throw error;
}

export async function unarchiveInterestCheck(checkId: string): Promise<void> {
  const { error } = await supabase
    .from('interest_checks')
    .update({ archived_at: null })
    .eq('id', checkId);

  if (error) throw error;
}

export async function getArchivedChecks(): Promise<{ id: string; text: string; archived_at: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('interest_checks')
    .select('id, text, archived_at')
    .eq('author_id', user.id)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateInterestCheck(
  checkId: string,
  updates: { text?: string; max_squad_size?: number; event_date?: string | null; event_time?: string | null; date_flexible?: boolean; time_flexible?: boolean; location?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('interest_checks')
    .update(updates)
    .eq('id', checkId);
  // RLS policy allows author and accepted co-authors

  if (error) throw error;
}

export async function markCheckShared(checkId: string): Promise<void> {
  const { error } = await supabase
    .from('interest_checks')
    .update({ shared_at: new Date().toISOString() })
    .eq('id', checkId)
    .is('shared_at', null);

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
  response: 'down'
): Promise<CheckResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Guard: don't allow responses to expired checks
  const { data: check } = await supabase
    .from('interest_checks')
    .select('expires_at')
    .eq('id', checkId)
    .single();

  if (check?.expires_at && new Date(check.expires_at) < new Date()) {
    throw new Error('Check has expired');
  }

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
  const channel = supabase
    .channel('checks:all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'interest_checks' },
      () => callback()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_responses' },
      () => callback()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_co_authors' },
      () => callback()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_comments' },
      () => callback()
    )
    .subscribe();

  return { unsubscribe: () => { channel.unsubscribe(); } };
}

// ============================================================================
// LEFT CHECKS
// ============================================================================

export async function getLeftChecks() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('left_checks')
    .select(`
      check_id,
      left_at,
      check:interest_checks!check_id (
        id,
        text,
        author_id,
        event_date,
        event_time,
        expires_at,
        author:profiles!author_id ( display_name, avatar_letter )
      )
    `)
    .eq('user_id', user.id);

  if (error) throw error;
  return (data ?? []) as unknown as {
    check_id: string;
    left_at: string;
    check: {
      id: string;
      text: string;
      author_id: string;
      event_date: string | null;
      event_time: string | null;
      expires_at: string | null;
      author: { display_name: string; avatar_letter: string };
    };
  }[];
}

export async function removeLeftCheck(checkId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('left_checks')
    .delete()
    .eq('user_id', user.id)
    .eq('check_id', checkId);
}

// ============================================================================
// CHECK CO-AUTHORS
// ============================================================================

export async function tagCoAuthors(checkId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('check_co_authors')
    .upsert(
      userIds.map(uid => ({ check_id: checkId, user_id: uid, invited_by: user.id, status: 'pending' })),
      { onConflict: 'check_id,user_id', ignoreDuplicates: false }
    );

  if (error) throw error;
}

export async function respondToCoAuthorTag(checkId: string, accept: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('check_co_authors')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('check_id', checkId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function removeCoAuthor(checkId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('check_co_authors')
    .delete()
    .eq('check_id', checkId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ============================================================================
// CHECK COMMENTS
// ============================================================================

export async function getCheckCommentCounts(checkIds: string[]): Promise<Record<string, number>> {
  if (checkIds.length === 0) return {};

  const { data, error } = await supabase
    .from('check_comments')
    .select('check_id')
    .in('check_id', checkIds);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? [])) {
    counts[row.check_id] = (counts[row.check_id] ?? 0) + 1;
  }
  return counts;
}

export async function getCheckComments(checkId: string): Promise<CheckComment[]> {
  const { data, error } = await supabase
    .from('check_comments')
    .select('*, user:profiles!user_id(*)')
    .eq('check_id', checkId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}


// ── Event Comments ──────────────────────────────────────────────────────

export async function getEventComments(eventId: string): Promise<CheckComment[]> {
  const { data, error } = await supabase
    .from('check_comments')
    .select('*, user:profiles!user_id(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function postEventComment(eventId: string, text: string): Promise<CheckComment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_comments')
    .insert({ event_id: eventId, user_id: user.id, text })
    .select('*, user:profiles!user_id(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function getEventCommentCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  const { data, error } = await supabase
    .from('check_comments')
    .select('event_id')
    .in('event_id', eventIds);

  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? [])) {
    if (row.event_id) counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }
  return counts;
}

export function subscribeToEventComments(eventId: string, onComment: (comment: CheckComment) => void) {
  return supabase
    .channel(`event_comments:${eventId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'check_comments',
      filter: `event_id=eq.${eventId}`,
    }, (payload) => onComment(payload.new as CheckComment))
    .subscribe();
}

export async function postCheckComment(checkId: string, text: string, mentions: string[] = []): Promise<CheckComment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_comments')
    .insert({ check_id: checkId, user_id: user.id, text, mentions })
    .select('*, user:profiles!user_id(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCheckComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('check_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

export function subscribeToCheckComments(
  checkId: string,
  callback: (comment: CheckComment) => void
) {
  const channel = supabase
    .channel(`check_comments:${checkId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'check_comments',
        filter: `check_id=eq.${checkId}`,
      },
      async (payload) => {
        const comment = payload.new as CheckComment;
        if (comment.user_id && !comment.user) {
          const { data: user } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', comment.user_id)
            .single();
          if (user) comment.user = user;
        }
        callback(comment);
      }
    )
    .subscribe();
  return { unsubscribe: () => { supabase.removeChannel(channel); } };
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
      check:interest_checks(author_id, event_time, event_date, location, text, date_flexible, time_flexible, max_squad_size, responses:check_responses(user_id, response, user:profiles!user_id(display_name, avatar_letter))),
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
  // Prefer active squad, but return archived if that's all there is
  const { data, error } = await supabase
    .from('squads')
    .select('*')
    .eq('check_id', checkId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Reactivate an archived squad — clears archived_at/warned_at and resets expiry from its check's event_date. */
export async function reactivateSquad(squadId: string): Promise<Squad> {
  const { data, error } = await supabase.rpc('reactivate_squad', { p_squad_id: squadId });
  if (error) throw error;
  return data as Squad;
}

export async function joinSquad(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('squad_members')
    .insert({ squad_id: squadId, user_id: user.id });

  if (error) throw error;
}

/** Join a check-linked squad if there's room, or join waitlist if full. */
export async function joinSquadIfRoom(squadId: string): Promise<'joined' | 'waitlisted'> {
  const { data, error } = await supabase.rpc('join_squad_if_room', { p_squad_id: squadId });
  if (error) throw error;
  return (data as { status: string }).status as 'joined' | 'waitlisted';
}

export async function leaveSquad(squadId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_squad', { p_squad_id: squadId });
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

export async function sendMessage(
  squadId: string,
  text: string,
  mentions: string[] = [],
  image?: { path: string; width: number; height: number }
): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    squad_id: squadId,
    sender_id: user.id,
    text,
    mentions,
  };
  if (image) {
    row.image_path = image.path;
    row.image_width = image.width;
    row.image_height = image.height;
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(row)
    .select('*, sender:profiles(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function uploadChatImage(squadId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${squadId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('squad-chat-images')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function getChatImageSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from('squad-chat-images')
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
  }
  return out;
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

export async function getSquadMessages(squadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: true });

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
    .not('type', 'in', '("squad_message","squad_mention")')
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
    .not('type', 'in', '("squad_message","squad_mention")');

  if (error) throw error;
  return count ?? 0;
}

export async function getUnreadSquadIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc('get_unread_squad_ids', { p_user_id: user.id });
  if (error) return [];
  return (data ?? []).map((r: { squad_id: string }) => r.squad_id);
}

export async function markSquadRead(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('squad_read_cursors')
    .upsert(
      { user_id: user.id, squad_id: squadId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,squad_id' }
    );
  if (error) throw error;
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

  // Skip pending friend_request notifications — they stay unread until actioned
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .neq('type', 'friend_request');

  if (error) throw error;
}

export async function markFriendRequestNotificationsRead(friendUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('type', 'friend_request')
    .eq('related_user_id', friendUserId)
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

  // Sync meeting_spot → linked interest_check.location / event.venue
  // so the location stays consistent wherever the user edits it.
  if (updates.meeting_spot !== undefined) {
    const { data: squad } = await supabase
      .from('squads')
      .select('check_id, event_id')
      .eq('id', squadId)
      .single();

    const spot = updates.meeting_spot || null;
    if (squad?.check_id) {
      await supabase
        .from('interest_checks')
        .update({ location: spot })
        .eq('id', squad.check_id);
    }
    if (squad?.event_id) {
      await supabase
        .from('events')
        .update({ venue: spot })
        .eq('id', squad.event_id);
    }
  }
}

export async function extendSquad(squadId: string, days: number = 7): Promise<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/extend`, {
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

  const res = await fetch(`${API_BASE}/api/squads/confirm-date`, {
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
// SQUAD POLLS
// ============================================================================

export async function getSquadPolls(squadId: string) {
  const { data, error } = await supabase
    .from('squad_polls')
    .select('*')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPollVotes(pollId: string) {
  const { data, error } = await supabase
    .from('squad_poll_votes')
    .select('*, user:profiles(display_name)')
    .eq('poll_id', pollId);

  if (error) throw error;
  return (data ?? []).map((v: Record<string, unknown>) => ({
    userId: v.user_id as string,
    optionIndex: v.option_index as number,
    displayName: (v.user as { display_name?: string } | null)?.display_name ?? 'Unknown',
  }));
}

export async function createPoll(squadId: string, question: string, options: string[], multiSelect = true) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/create-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ squadId, question, options, multiSelect }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create poll');
  }

  return res.json();
}

export async function votePoll(pollId: string, optionIndex: number) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/vote-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pollId, optionIndex }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to vote');
  }

  return res.json();
}

export async function closePoll(pollId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/close-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pollId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to close poll');
  }

  return res.json();
}

export function subscribeToPollVotes(
  pollId: string,
  callback: (payload: { user_id: string; option_index: number; poll_id: string }) => void
) {
  return supabase
    .channel(`poll_votes:${pollId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'squad_poll_votes',
        filter: `poll_id=eq.${pollId}`,
      },
      (payload) => callback(payload.new as { user_id: string; option_index: number; poll_id: string })
    )
    .subscribe();
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
): Promise<Record<string, EventUserEntry[]>> {
  return fetchEventUsersBatch('crew_pool', eventIds);
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

// ============================================================================
// SQUAD JOIN REQUESTS
// ============================================================================

export async function getEventSquadMembers(eventId: string): Promise<{ user_id: string; squad_id: string; squad_name: string }[]> {
  const { data, error } = await supabase.rpc('get_event_squad_members', { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []) as { user_id: string; squad_id: string; squad_name: string }[];
}

export async function requestToJoinSquad(squadId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('squad_join_requests')
    .insert({ squad_id: squadId, user_id: user.id });

  if (error) throw error;
}

export async function respondToJoinRequest(squadId: string, userId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('squad_join_requests')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('squad_id', squadId)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function getPendingJoinRequests(squadId: string): Promise<SquadJoinRequest[]> {
  const { data, error } = await supabase
    .from('squad_join_requests')
    .select('*, user:profiles!user_id(*)')
    .eq('squad_id', squadId)
    .eq('status', 'pending');

  if (error) throw error;
  return (data ?? []) as SquadJoinRequest[];
}

export async function getMyPendingJoinRequests(eventId: string): Promise<{ squad_id: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('squad_join_requests')
    .select('squad_id, squads!squad_id(event_id)')
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
  // Filter to requests for squads linked to this event
  return ((data ?? []) as unknown as { squad_id: string; squads: { event_id: string | null } }[])
    .filter((r) => r.squads?.event_id === eventId)
    .map((r) => ({ squad_id: r.squad_id }));
}


// =============================================================================
// Block + report (App Store 1.2)
// Schema: migration 20260424000003_block_and_report.sql
// =============================================================================

export type ReportTargetType = 'profile' | 'check' | 'squad_message' | 'event_comment' | 'check_comment';
export type ReportReason = 'harassment' | 'spam' | 'impersonation' | 'inappropriate' | 'threats' | 'other';

export async function blockUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (user.id === targetUserId) throw new Error("Can't block yourself");

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: user.id, blocked_id: targetUserId });
  // Unique constraint conflict = already blocked; treat as success
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetUserId);
  if (error) throw error;
}

export async function isBlocked(targetUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Only checks the direction the viewer controls (their outgoing blocks).
  // RLS prevents reading blocks where they're the blocked party, which is
  // intentional — see migration comment.
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listBlockedUsers(): Promise<(Profile & { blocked_at: string })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocked_users')
    .select('created_at, blocked:profiles!blocked_id(*)')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { created_at: string; blocked: Profile }[])
    .map((r) => ({ ...r.blocked, blocked_at: r.created_at }));
}

export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string | null = null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('reported_content')
    .insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
    });
  if (error) throw error;
}
