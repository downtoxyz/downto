'use server';

import { createClient } from '@/lib/supabase/server';
import { Notification, NotificationType } from '../types';

// Get count of unread notifications for current user
export async function getUnreadCount({ userId }: { userId?: string }) {
  if (!userId) return 0;

  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .neq('type', 'squad_message');

  if (error) throw error;
  return count ?? 0;
}

export async function getNotifications({
  userId,
}: {
  userId?: string;
}): Promise<Notification[]> {
  if (!userId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notifications')
    .select('*, related_user:profiles!related_user_id(*)')
    .eq('user_id', userId)
    .neq('type', 'squad_message')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data
    ? data.map((d) => ({ ...d, type: d.type as NotificationType }))
    : [];
}
