import { supabase } from '../supabase';

import type { Message } from '../types';

export async function sendMessage(
  squadId: string,
  text: string,
  mentions: string[] = [],
  image?: { path: string; width: number; height: number }
): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    squad_id: squadId,
    sender_id: user.id,
    text,
    mentions,
  };
  if (image) {
    row.image_path = image.path;
    row.image_width = image.width;
    row.image_height = image.height;
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(row)
    .select('*, sender:profiles(display_name)')
    .single();

  if (error) throw error;
  return data;
}

export async function uploadChatImage(squadId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${squadId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('squad-chat-images')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function getChatImageSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from('squad-chat-images')
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
  }
  return out;
}

export function subscribeToMessages(
  squadId: string,
  callback: (message: Message) => void
) {
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
        const msg = payload.new as Message;
        // Realtime payloads don't include joined data. Hydrate just the
        // sender's display_name (the only field msgs render — see
        // SquadChat.tsx). Was `select('*')` which pulled a full Profile
        // per realtime arrival.
        if (msg.sender_id && !msg.sender) {
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', msg.sender_id)
            .single();
          if (sender) msg.sender = sender as Message['sender'];
        }
        callback(msg);
      }
    )
    .subscribe();
}

export async function getSquadMessages(squadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(display_name)')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
