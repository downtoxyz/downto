'use server';

import { createClient } from '../../../lib/supabase/server';

// Get count of unread notifications for current user
export async function getUnreadCount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
