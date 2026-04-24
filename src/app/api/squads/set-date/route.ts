import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { proposeSquadDate, formatDateLabel } from '@/lib/server/squadDate';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, date, time, clear, locked } = await req.json();
  if (!squadId) {
    return NextResponse.json({ error: 'squadId required' }, { status: 400 });
  }

  // Verify user is a squad member
  const { data: membership } = await supabase
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Not a squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Get user's display name for the system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name ?? 'Someone';

  // Get squad's linked check_id / event_id and current check event_date
  const { data: squad } = await supabase
    .from('squads')
    .select('check_id, event_id')
    .eq('id', squadId)
    .single();

  let checkHadDate = true;
  if (squad?.check_id) {
    const { data: check } = await supabase
      .from('interest_checks')
      .select('event_date')
      .eq('id', squad.check_id)
      .single();
    checkHadDate = !!check?.event_date;
  }

  // --- Clear date/time ---
  if (clear) {
    // Any squad member can clear (membership already verified above)
    if (squad?.check_id) {
      await adminClient
        .from('interest_checks')
        .update({ event_date: null, event_time: null })
        .eq('id', squad.check_id);
    }
    if (squad?.event_id) {
      await adminClient
        .from('events')
        .update({ time_display: null })
        .eq('id', squad.event_id);
    }

    // Reset date and confirm state
    await supabase
      .from('squads')
      .update({ locked_date: null, date_status: null })
      .eq('id', squadId);

    await adminClient
      .from('squad_date_confirms')
      .delete()
      .eq('squad_id', squadId);

    await adminClient
      .from('messages')
      .insert({
        squad_id: squadId,
        sender_id: null,
        text: `${displayName} cleared the date`,
        is_system: true,
      });

    return NextResponse.json({ ok: true, cleared: true });
  }

  // --- Set date/time ---
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }

  // Check-based squads use the confirm flow unless the user locked everything in
  const isProposal = !!squad?.check_id && !locked;

  if (isProposal) {
    const { expiresAt } = await proposeSquadDate({
      adminClient,
      squadId,
      date,
      time: time ?? null,
      proposerUserId: user.id,
      proposerDisplayName: displayName,
    });
    return NextResponse.json({ ok: true, expires_at: expiresAt, date_status: 'proposed' });
  }

  // --- Standard lock flow ---
  const expiresAt = new Date(date + 'T23:59:59Z');
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error: updateError } = await supabase
    .from('squads')
    .update({
      expires_at: expiresAt.toISOString(),
      locked_date: date,
      date_status: locked ? 'locked' : null,
    })
    .eq('id', squadId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (squad?.check_id) {
    await adminClient
      .from('interest_checks')
      .update({
        event_date: date,
        date_flexible: !locked,
        ...(time !== undefined ? { event_time: time, time_flexible: !locked } : {}),
      })
      .eq('id', squad.check_id);
  }
  if (squad?.event_id) {
    await adminClient
      .from('events')
      .update({ date, ...(time ? { time_display: time } : {}) })
      .eq('id', squad.event_id);
  }

  const dateLabel = formatDateLabel(date);
  const timeLabel = time ? ` at ${time}` : '';

  await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${displayName} locked in ${dateLabel}${timeLabel}`,
      is_system: true,
    });

  return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString(), date_status: locked ? 'locked' : null });
}
