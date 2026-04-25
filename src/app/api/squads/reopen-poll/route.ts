import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

// Flip a closed poll back to active so members can keep voting. Only the
// poll creator can re-open, mirroring close-poll's authz. Doesn't touch any
// date that may have been auto-proposed when the poll closed — the squad
// can clear/repropose manually if they want a clean slate.
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

  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .select('id, squad_id, status, created_by')
    .eq('id', pollId)
    .single();
  if (pollError || !poll) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }
  if (poll.status !== 'closed') {
    return NextResponse.json({ error: 'Poll is not closed' }, { status: 400 });
  }
  if (poll.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the poll creator can reopen it' }, { status: 403 });
  }

  const { error: updateError } = await adminClient
    .from('squad_polls')
    .update({ status: 'active' })
    .eq('id', pollId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  await adminClient
    .from('messages')
    .insert({
      squad_id: poll.squad_id,
      sender_id: null,
      text: `${displayName} reopened the poll`,
      is_system: true,
    });

  return NextResponse.json({ ok: true });
}
