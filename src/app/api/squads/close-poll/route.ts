import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId } = await req.json();
  if (!pollId) {
    return NextResponse.json({ error: 'pollId required' }, { status: 400 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Fetch poll
  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .select('id, squad_id, status, created_by')
    .eq('id', pollId)
    .single();

  if (pollError || !poll) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }

  if (poll.status !== 'active') {
    return NextResponse.json({ error: 'Poll is already closed' }, { status: 400 });
  }

  if (poll.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the poll creator can close it' }, { status: 403 });
  }

  // Close poll
  const { error: updateError } = await adminClient
    .from('squad_polls')
    .update({ status: 'closed' })
    .eq('id', pollId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  // System message
  await adminClient
    .from('messages')
    .insert({
      squad_id: poll.squad_id,
      sender_id: null,
      text: `${displayName} closed the poll`,
      is_system: true,
    });

  return NextResponse.json({ ok: true });
}
