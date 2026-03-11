import { createClient } from '@/lib/supabase/client';

export async function updateCheckResponse({
  userId,
  checkId,
  response,
}: {
  userId: string;
  checkId: string;
  response: 'down' | 'maybe';
}) {
  const supabase = await createClient();

  const { error } = await supabase.from('check_responses').upsert(
    {
      check_id: checkId,
      user_id: userId,
      response,
    },
    { onConflict: 'check_id,user_id' }
  );

  if (error) throw error;
}

export async function removeCheckResponse({
  userId,
  checkId,
}: {
  userId: string;
  checkId: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('check_responses')
    .delete()
    .eq('check_id', checkId)
    .eq('user_id', userId);

  if (error) throw error;
}
