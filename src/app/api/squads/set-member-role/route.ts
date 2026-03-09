import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, userId: targetUserId, role } = await req.json();
  if (!squadId || !targetUserId || !['member', 'waitlist'].includes(role)) {
    return NextResponse.json({ error: 'squadId, userId, and role (member|waitlist) required' }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Can't change your own role" }, { status: 400 });
  }

  // Verify caller is a squad member (not waitlisted)
  const { data: callerMembership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not an active squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Verify target is in the squad
  const { data: targetMembership } = await adminClient
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMembership) {
    return NextResponse.json({ error: 'Target is not a squad member' }, { status: 400 });
  }

  if (targetMembership.role === role) {
    return NextResponse.json({ error: `Already has role: ${role}` }, { status: 400 });
  }

  // When promoting to member, check squad isn't full
  if (role === 'member') {
    const { count: memberCount } = await adminClient
      .from('squad_members')
      .select('id', { count: 'exact', head: true })
      .eq('squad_id', squadId)
      .neq('role', 'waitlist');

    // Get max squad size from linked check
    const { data: squad } = await adminClient
      .from('squads')
      .select('check_id')
      .eq('id', squadId)
      .single();

    let maxSize = 999;
    if (squad?.check_id) {
      const { data: check } = await adminClient
        .from('interest_checks')
        .select('max_squad_size')
        .eq('id', squad.check_id)
        .single();
      maxSize = check?.max_squad_size ?? 999;
    }

    if ((memberCount ?? 0) >= maxSize) {
      return NextResponse.json({ error: 'Squad is full' }, { status: 400 });
    }
  }

  // Update role
  const { error: updateError } = await adminClient
    .from('squad_members')
    .update({ role })
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get target user's display name for system message
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', targetUserId)
    .single();

  const targetName = targetProfile?.display_name ?? 'Someone';
  const systemText = role === 'waitlist'
    ? `${targetName} was moved to waitlist`
    : `${targetName} was moved off waitlist`;

  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: systemText,
      is_system: true,
    });

  return NextResponse.json({ ok: true });
}
