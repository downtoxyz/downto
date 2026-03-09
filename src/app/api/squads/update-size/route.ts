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

  // Verify caller is a squad member
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id')
    .eq('squad_id', squad.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
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

  // Auto-promote waitlisted members if there's now room
  const { count: activeCount } = await adminClient
    .from('squad_members')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', squad.id)
    .eq('role', 'member');

  const spotsAvailable = maxSquadSize - (activeCount ?? 0);

  if (spotsAvailable > 0) {
    // Get waitlisted members ordered by join time (first come first served)
    const { data: waitlisted } = await adminClient
      .from('squad_members')
      .select('id, user_id, user:profiles!user_id(display_name)')
      .eq('squad_id', squad.id)
      .eq('role', 'waitlist')
      .order('joined_at', { ascending: true })
      .limit(spotsAvailable);

    if (waitlisted && waitlisted.length > 0) {
      const idsToPromote = waitlisted.map((w) => w.id);
      await adminClient
        .from('squad_members')
        .update({ role: 'member' })
        .in('id', idsToPromote);

      // Send system messages for promoted members
      const messages = waitlisted.map((w) => ({
        squad_id: squad.id,
        sender_id: null,
        text: `${(w.user as { display_name?: string })?.display_name ?? 'Someone'} joined from waitlist`,
        is_system: true,
      }));
      await adminClient.from('messages').insert(messages);
    }
  }

  return NextResponse.json({ ok: true });
}
