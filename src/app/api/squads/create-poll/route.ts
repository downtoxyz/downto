import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, question, options } = await req.json();
  if (!squadId || !question?.trim() || !Array.isArray(options) || options.length < 2 || options.length > 10) {
    return NextResponse.json({ error: 'squadId, question, and 2-10 options required' }, { status: 400 });
  }

  // Verify caller is a non-waitlisted squad member
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Check no active poll exists
  const { data: existing } = await adminClient
    .from('squad_polls')
    .select('id')
    .eq('squad_id', squadId)
    .eq('status', 'active')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'A poll is already active in this squad' }, { status: 409 });
  }

  // Get user display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  // Insert system message
  const { data: message, error: msgError } = await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${displayName} started a poll: ${question.trim()}`,
      is_system: true,
      message_type: 'poll',
    })
    .select('id')
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Insert poll
  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .insert({
      squad_id: squadId,
      message_id: message.id,
      question: question.trim(),
      options: options.map((o: string) => o.trim()),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (pollError) {
    return NextResponse.json({ error: pollError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pollId: poll.id, messageId: message.id });
}
