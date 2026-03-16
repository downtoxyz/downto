import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId, optionIndex } = await req.json();
  if (!pollId || typeof optionIndex !== 'number') {
    return NextResponse.json({ error: 'pollId and optionIndex required' }, { status: 400 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Fetch poll
  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .select('id, squad_id, options, status')
    .eq('id', pollId)
    .single();

  if (pollError || !poll) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }

  if (poll.status !== 'active') {
    return NextResponse.json({ error: 'Poll is closed' }, { status: 400 });
  }

  const opts = poll.options as string[];
  if (optionIndex < 0 || optionIndex >= opts.length) {
    return NextResponse.json({ error: 'Invalid option index' }, { status: 400 });
  }

  // Verify caller is a non-waitlisted squad member
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', poll.squad_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  // Upsert vote
  const { error: voteError } = await adminClient
    .from('squad_poll_votes')
    .upsert(
      { poll_id: pollId, user_id: user.id, option_index: optionIndex },
      { onConflict: 'poll_id,user_id' }
    );

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
