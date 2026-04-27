import { supabase } from '../supabase';
import { API_BASE } from './api-base';

import type { Squad, SquadJoinRequest } from '../types';

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

  // Then fetch those squads with their data (exclude expired).
  //
  // Two perf trims here on the hot squad-list path:
  //   1. Cap nested messages at the most recent 50. Was unlimited — a
  //      busy squad pulled hundreds of messages on every list load.
  //      No pagination yet, so older messages aren't visible until that
  //      lands; acceptable trade-off given typical squad chat lengths.
  //   2. Trim the embedded sender profile to just display_name (only field
  //      actually rendered). Was `sender:profiles(*)` — ~15 columns × N
  //      messages × M squads of waste.
  //
  // Messages are fetched DESC + limit so we get the newest 50, then
  // reversed in JS so consumers (SquadChat / GroupsView) keep their
  // existing oldest→newest expectation.
  const { data, error } = await supabase
    .from('squads')
    .select(`
      *,
      event:events(*),
      check:interest_checks(author_id, event_time, event_date, location, text, date_flexible, time_flexible, max_squad_size, responses:check_responses(user_id, response, user:profiles!user_id(display_name, avatar_letter))),
      members:squad_members(*, user:profiles!user_id(*)),
      messages(*, sender:profiles!sender_id(display_name))
    `)
    .in('id', squadIds)
    .is('archived_at', null)
    .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: false, referencedTable: 'messages' })
    .limit(50, { referencedTable: 'messages' });

  if (error) throw error;
  if (data) {
    for (const squad of data) {
      if (Array.isArray(squad.messages)) squad.messages.reverse();
    }
  }
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
