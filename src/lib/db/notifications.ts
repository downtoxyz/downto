import { supabase } from '../supabase';

import type { Notification } from '../types';

export async function getNotifications(): Promise<Notification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Skipping the related_user profile join entirely — verified that no
  // consumer reads notification.related_user (only the related_user_id
  // column itself, e.g. NotificationsPanel checks `friends.some(f =>
  // f.id === n.related_user_id)`). Was pulling a full Profile per
  // notification × 50 notifications per fetch.
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
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
