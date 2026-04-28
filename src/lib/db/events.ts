import * as Sentry from '@sentry/nextjs';
import { supabase } from '../supabase';
import { toLocalISODate } from '../dateParse';

import type {
  Profile,
  Event,
  SavedEvent,
  CrewPoolEntry,
} from '../types';

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

export async function findEventByIgUrl(igUrl: string): Promise<import('../types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('ig_url', igUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function findEventByDiceUrl(diceUrl: string): Promise<import('../types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('dice_url', diceUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function findEventByLetterboxdUrl(letterboxdUrl: string): Promise<import('../types').Event | null> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('letterboxd_url', letterboxdUrl)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function findEventByRaUrl(raUrl: string): Promise<import('../types').Event | null> {
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

  // Only the three rendered fields — was `user:profiles(*)`, which pulled
  // ~15 profile columns per "down" user × N events on every social-signal
  // hydration.
  let query = supabase
    .from(table)
    .select('event_id, user:profiles(id, display_name, avatar_letter)')
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

  // Run the two scans in parallel — was sequential (down-list, then
  // friendships only once we knew there was anyone to check). Cutting the
  // wait roughly in half on the common path; the trade-off is one wasted
  // friendships query in the no-one-is-down case, which is cheap.
  const downQuery = supabase
    .from('saved_events')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('is_down', true);

  const friendsQuery = currentUserId
    ? supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
    : Promise.resolve({ data: null });

  const [{ data, error }, { data: friendships }] = await Promise.all([
    downQuery,
    friendsQuery,
  ]);

  if (error) throw error;

  const allDown = (data ?? []).filter((d) => d.user_id !== currentUserId);
  const totalDown = allDown.length;

  if (!currentUserId || totalDown === 0) return { totalDown, friendsDown: 0 };

  const friendIds = new Set(
    (friendships ?? []).map((f) =>
      f.requester_id === currentUserId ? f.addressee_id : f.requester_id,
    ),
  );

  const friendsDown = allDown.filter((d) => friendIds.has(d.user_id)).length;
  return { totalDown, friendsDown };
}
