import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { checkId, maxSquadSize } = await req.json();
  if (!checkId || typeof maxSquadSize !== 'number') {
    return NextResponse.json({ error: 'checkId and maxSquadSize required' }, { status: 400 });
  }

  // Get squad linked to this check
  const { data: squad } = await supabase
    .from('squads')
    .select('id')
    .eq('check_id', checkId)
    .maybeSingle();

  if (!squad) {
    return NextResponse.json({ error: 'No squad for this check' }, { status: 400 });
  }

  // Verify caller is an active squad member (not waitlisted)
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squad.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not an active squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Update the check's max_squad_size
  const { error: updateError } = await adminClient
    .from('interest_checks')
    .update({ max_squad_size: maxSquadSize })
    .eq('id', checkId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Auto-promote waitlisted check responses if there's now room
  // The RPC promotes one at a time and returns the promoted user_id (or null)
  const { count: downCount } = await adminClient
    .from('check_responses')
    .select('id', { count: 'exact', head: true })
    .eq('check_id', checkId)
    .eq('response', 'down');

  const spotsAvailable = maxSquadSize - (downCount ?? 0);

  if (spotsAvailable > 0) {
    for (let i = 0; i < spotsAvailable; i++) {
      const { data: promoted } = await adminClient.rpc('promote_waitlisted_check_response', { p_check_id: checkId });
      if (!promoted) break; // no more waitlisted
    }
  }

  return NextResponse.json({ ok: true });
}
