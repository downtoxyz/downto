import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { proposeSquadDate } from '@/lib/server/squadDate';

// Propose a date that came out of a closed availability poll. Members who
// already voted in the poll get their date_confirm row pre-marked 'yes' (and
// no notification) — they implicitly confirmed by voting. Only members who
// didn't respond to the poll see "are you still down?".
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId, date, time } = await req.json();
  if (!pollId || !date) {
    return NextResponse.json({ error: 'pollId and date required' }, { status: 400 });
  }

  const { data: poll, error: pollError } = await supabase
    .from('squad_polls')
    .select('id, squad_id, poll_type, status')
    .eq('id', pollId)
    .single();
  if (pollError || !poll) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }

  // Caller must be a non-waitlisted member of the squad
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', poll.squad_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || membership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Responders depend on poll type:
  //   - 'availability' polls store cells in squad_poll_availability
  //   - 'when' polls (any collection style) store votes in squad_poll_votes
  let responderIds: string[] = [];
  if (poll.poll_type === 'availability') {
    const { data: cells } = await adminClient
      .from('squad_poll_availability')
      .select('user_id')
      .eq('poll_id', pollId);
    responderIds = Array.from(new Set((cells ?? []).map((c) => c.user_id))) as string[];
  } else {
    const { data: votes } = await adminClient
      .from('squad_poll_votes')
      .select('user_id')
      .eq('poll_id', pollId);
    responderIds = Array.from(new Set((votes ?? []).map((v) => v.user_id))) as string[];
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  try {
    const { expiresAt } = await proposeSquadDate({
      adminClient,
      squadId: poll.squad_id,
      date,
      time: typeof time === 'string' && time.length > 0 ? time : null,
      proposerUserId: user.id,
      proposerDisplayName: displayName,
      preConfirmedUserIds: responderIds,
    });
    return NextResponse.json({ ok: true, expires_at: expiresAt, date_status: 'proposed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to propose date';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
