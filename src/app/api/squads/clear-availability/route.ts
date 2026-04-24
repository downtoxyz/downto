import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

// Wipe all of the caller's cells for an availability poll. Used by the
// "Clear mine" button in the grid UI.
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId } = await req.json();
  if (!pollId) return NextResponse.json({ error: 'pollId required' }, { status: 400 });

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  const { data: poll } = await adminClient
    .from('squad_polls')
    .select('squad_id, status, poll_type')
    .eq('id', pollId)
    .single();
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  if (poll.poll_type !== 'availability') return NextResponse.json({ error: 'not an availability poll' }, { status: 400 });
  if (poll.status !== 'active') return NextResponse.json({ error: 'poll is closed' }, { status: 400 });

  const { data: membership } = await supabase
    .from('squad_members')
    .select('role')
    .eq('squad_id', poll.squad_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || membership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  await adminClient
    .from('squad_poll_availability')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
