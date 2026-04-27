import { supabase } from '../supabase';
import { API_BASE } from './api-base';

import type {
  Profile,
  InterestCheck,
  CheckResponse,
  CheckCoAuthor,
} from '../types';

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
  // Embedded profiles trimmed to the three columns transformCheck reads
  // (id, display_name, avatar_letter). Was `(*)` per author + per responder
  // + per co-author — ~15 profile columns × N rows × 30 checks of waste on
  // every feed load. Same pattern as #466.
  const { data, error } = await supabase
    .from('interest_checks')
    .select(`
      *,
      author:profiles!author_id(id, display_name, avatar_letter),
      responses:check_responses(*, user:profiles!user_id(id, display_name, avatar_letter)),
      squads(id, archived_at, members:squad_members(id, user_id, role)),
      co_authors:check_co_authors(*, user:profiles!user_id(id, display_name, avatar_letter))
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

/** Returns whether a check is currently active and whether the caller owns it
 *  (author or accepted co-author). Goes through a SECURITY DEFINER RPC so the
 *  caller can discover ownership of their own archived rows — the SELECT
 *  policy hides those even from their author. */
export async function getCheckState(checkId: string): Promise<{ active: boolean; isMine: boolean }> {
  const { data, error } = await supabase
    .rpc('get_check_state', { p_check_id: checkId })
    .single<{ active: boolean; is_mine: boolean }>();
  if (error) throw error;
  return { active: !!data?.active, isMine: !!data?.is_mine };
}

/** Archive a check via SECURITY DEFINER RPC. The RPC also fires
 *  `check_archived` notifications to "down" responders in the same tx.
 *  Re-archiving an already-archived row is a silent no-op server-side. */
export async function archiveInterestCheck(checkId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_interest_check', {
    p_check_id: checkId,
  });
  if (error) throw error;
}

/** Revive an archived check via SECURITY DEFINER RPC. If the archive happened
 *  within the last ~5 min (toast-undo window), the RPC silently deletes the
 *  prior `check_archived` notifications instead of fanning out new ones —
 *  recipients see no notification at all for a quick undo. Older revives
 *  send `check_revived` notifications to "down" responders. */
export async function reviveInterestCheck(checkId: string): Promise<void> {
  const { error } = await supabase.rpc('revive_interest_check', {
    p_check_id: checkId,
  });
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
