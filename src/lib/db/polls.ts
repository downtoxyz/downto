import { supabase } from '../supabase';
import { API_BASE } from './api-base';

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

export async function createPoll(
  squadId: string,
  question: string,
  options: string[] | Array<{ date: string; time: string | null }>,
  multiSelect = true,
  pollType: 'text' | 'dates' = 'text',
) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/create-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ squadId, question, options, multiSelect, pollType }),
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

export async function reopenPoll(pollId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/api/squads/reopen-poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pollId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to reopen poll');
  }
  return res.json();
}

export async function proposeDateFromPoll(pollId: string, date: string, time: string | null) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/api/squads/propose-from-poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pollId, date, time }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to propose date');
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

export async function getPollAvailability(pollId: string) {
  const { data, error } = await supabase
    .from('squad_poll_availability')
    .select('user_id, day_offset, slot_index, user:profiles(display_name)')
    .eq('poll_id', pollId);

  if (error) throw error;
  return (data ?? []).map((c: Record<string, unknown>) => ({
    userId: c.user_id as string,
    dayOffset: c.day_offset as number,
    slotIndex: c.slot_index as number,
    displayName: (c.user as { display_name?: string } | null)?.display_name ?? 'Unknown',
  }));
}

export function subscribeToPollAvailability(
  pollId: string,
  callback: () => void,
) {
  return supabase
    .channel(`poll_availability:${pollId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'squad_poll_availability',
        filter: `poll_id=eq.${pollId}`,
      },
      () => callback(),
    )
    .subscribe();
}

export async function toggleAvailabilityCell(pollId: string, dayOffset: number, slotIndex: number) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/vote-availability`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pollId, dayOffset, slotIndex }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to toggle availability');
  }

  return res.json();
}

export async function clearMyAvailability(pollId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/clear-availability`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pollId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to clear availability');
  }

  return res.json();
}

export type WhenSlot = {
  date: string;
  startMin: number | null;
  endMin: number | null;
  label: string | null;
};

export async function createWhenPoll(
  squadId: string,
  slots: WhenSlot[],
  collectionStyle: 'preference' | 'availability',
) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/create-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      squadId,
      pollType: 'when',
      slots,
      collectionStyle,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create when poll');
  }

  return res.json();
}

export async function clearMyWhenVotes(pollId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/squads/clear-my-votes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pollId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to clear votes');
  }

  return res.json();
}
