import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, userId: targetUserId } = await req.json();
  if (!squadId || !targetUserId) {
    return NextResponse.json({ error: 'squadId and userId required' }, { status: 400 });
  }

  // Verify caller is a squad member
  const { data: callerMembership } = await supabase
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership) {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  // Get squad with check info
  const { data: squad } = await supabase
    .from('squads')
    .select('check_id')
    .eq('id', squadId)
    .single();

  if (!squad?.check_id) {
    return NextResponse.json({ error: 'Squad has no linked check' }, { status: 400 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Verify target user responded "down" on the check
  const { data: response } = await adminClient
    .from('check_responses')
    .select('id')
    .eq('check_id', squad.check_id)
    .eq('user_id', targetUserId)
    .eq('response', 'down')
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: 'User did not respond down on the check' }, { status: 400 });
  }

  // Check squad is not full
  const { count: memberCount } = await adminClient
    .from('squad_members')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', squadId)
    .neq('role', 'waitlist');

  const { data: check } = await adminClient
    .from('interest_checks')
    .select('max_squad_size')
    .eq('id', squad.check_id)
    .single();

  const maxSize = check?.max_squad_size ?? 999;
  if ((memberCount ?? 0) >= maxSize) {
    return NextResponse.json({ error: 'Squad is full' }, { status: 400 });
  }

  // Add member
  const { error: insertError } = await adminClient
    .from('squad_members')
    .insert({ squad_id: squadId, user_id: targetUserId });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Get target user's display name for system message
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', targetUserId)
    .single();

  const targetName = targetProfile?.display_name ?? 'Someone';

  // Send system message
  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${targetName} was added`,
      is_system: true,
    });

  return NextResponse.json({ ok: true, memberCount: (memberCount ?? 0) + 1 });
}
