import { supabase } from '../supabase';

import type { CheckComment } from '../types';

// Comments only render the commenter's display_name + avatar_letter, so
// trim the embedded profile join to those columns instead of `(*)`.
const COMMENT_USER_COLS = 'id, display_name, avatar_letter';

export async function getCheckCommentCounts(checkIds: string[]): Promise<Record<string, number>> {
  if (checkIds.length === 0) return {};

  const { data, error } = await supabase
    .from('check_comments')
    .select('check_id')
    .in('check_id', checkIds);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? [])) {
    counts[row.check_id] = (counts[row.check_id] ?? 0) + 1;
  }
  return counts;
}

export async function getCheckComments(checkId: string): Promise<CheckComment[]> {
  const { data, error } = await supabase
    .from('check_comments')
    .select(`*, user:profiles!user_id(${COMMENT_USER_COLS})`)
    .eq('check_id', checkId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function postCheckComment(checkId: string, text: string, mentions: string[] = []): Promise<CheckComment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('check_comments')
    .insert({ check_id: checkId, user_id: user.id, text, mentions })
    .select(`*, user:profiles!user_id(${COMMENT_USER_COLS})`)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCheckComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('check_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

export function subscribeToCheckComments(
  checkId: string,
  callback: (comment: CheckComment) => void
) {
  const channel = supabase
    .channel(`check_comments:${checkId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'check_comments',
        filter: `check_id=eq.${checkId}`,
      },
      async (payload) => {
        const comment = payload.new as CheckComment;
        if (comment.user_id && !comment.user) {
          // Realtime payloads don't include the join, so we hydrate the
          // commenter profile here. Only display_name + avatar_letter are
          // rendered, so don't pull `(*)`.
          const { data: user } = await supabase
            .from('profiles')
            .select(COMMENT_USER_COLS)
            .eq('id', comment.user_id)
            .single();
          if (user) comment.user = user as CheckComment['user'];
        }
        callback(comment);
      }
    )
    .subscribe();
  return { unsubscribe: () => { supabase.removeChannel(channel); } };
}
