import { supabase } from '../supabase';
import { API_BASE } from './api-base';

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

export async function logVersionPing(buildId: string, theme?: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("version_pings")
    .insert({ user_id: user.id, build_id: buildId, theme: theme ?? null });
}

/**
 * Hard-delete the current user's account + all their content.
 *
 * Routes through /api/account/delete (service-role) because the auth.users
 * row can only be removed via the admin API, not from the browser. After
 * the call resolves, sign the user out — the session token is now stale.
 */
export async function deleteMyAccount(): Promise<void> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/account/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Account deletion failed (${res.status})`);
  }
}
