import { createClient } from '@/lib/supabase/client';

export async function sendMessage(squadId: string, text: string, mentions: string[] = []) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({ squad_id: squadId, sender_id: user.id, text, mentions })
    .select('*, sender:profiles(*)')
    .single();

  if (error) throw error;
  return data;
}

export async function leaveSquad(squadId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('leave_squad', {
    p_squad_id: squadId,
  });
  if (error) throw error;
}

export async function markSquadNotificationsRead(squadId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('related_squad_id', squadId)
    .eq('is_read', false);
}

export async function getSquadMessages(squadId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function subscribeToMessages(
  squadId: string,
  callback: (message: any) => void
) {
  const supabase = createClient();
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
        const msg = payload.new as any;
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
