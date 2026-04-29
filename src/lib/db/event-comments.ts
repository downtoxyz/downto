import { supabase } from '../supabase';

import type { CheckComment } from '../types';

// Comments only render the commenter's display_name + avatar_letter, so
// trim the embedded profile join to those columns instead of `(*)`.
const COMMENT_USER_COLS = 'id, display_name, avatar_letter';

export async function getEventComments(eventId: string): Promise<CheckComment[]> {
  const { data, error } = await supabase
    .from('check_comments')
    .select(`*, user:profiles!user_id(${COMMENT_USER_COLS})`)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** One round-trip for many event ids — replaces N parallel getEventComments
 *  calls when the feed is rendering a batch of event cards. Returns a map
 *  keyed by event_id so each card can pluck its own slice. */
export async function getEventCommentsBatch(
  eventIds: string[]
): Promise<Record<string, CheckComment[]>> {
  if (eventIds.length === 0) return {};
  const { data, error } = await supabase
    .from('check_comments')
    .select(`*, user:profiles!user_id(${COMMENT_USER_COLS})`)
    .in('event_id', eventIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const byEvent: Record<string, CheckComment[]> = {};
  for (const id of eventIds) byEvent[id] = [];
  for (const c of (data ?? [])) {
    if (c.event_id) (byEvent[c.event_id] ??= []).push(c);
  }
  return byEvent;
}

export async function postEventComment(eventId: string, text: string): Promise<CheckComment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_comments')
    .insert({ event_id: eventId, user_id: user.id, text })
    .select(`*, user:profiles!user_id(${COMMENT_USER_COLS})`)
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
