import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

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

  // Get squad's linked check_id and current check event_date
  const { data: squad } = await supabase
    .from('squads')
    .select('check_id')
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

  // Update expires_at to date + 24h
  const expiresAt = new Date(date + 'T23:59:59Z');
  expiresAt.setHours(expiresAt.getHours() + 24);

  const dateStatus = locked ? 'locked' : isProposal ? 'proposed' : null;

  const { error: updateError } = await supabase
    .from('squads')
    .update({
      expires_at: expiresAt.toISOString(),
      locked_date: date,
      date_status: dateStatus,
    })
    .eq('id', squadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Sync date/time back to the linked interest check
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

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeLabel = time ? ` at ${time}` : '';

  if (isProposal) {
    // --- Proposal flow: insert date_confirm message + confirm rows ---

    // Clear any old confirms (if re-proposing)
    await adminClient
      .from('squad_date_confirms')
      .delete()
      .eq('squad_id', squadId);

    // Insert interactive system message
    const { data: msg } = await adminClient
      .from('messages')
      .insert({
        squad_id: squadId,
        sender_id: null,
        text: `${displayName} proposed ${dateLabel}${timeLabel} — are you still down?`,
        is_system: true,
        message_type: 'date_confirm',
      })
      .select('id')
      .single();

    const messageId = msg?.id;
    if (!messageId) {
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }

    // Get all squad members except proposer
    const { data: members } = await adminClient
      .from('squad_members')
      .select('user_id')
      .eq('squad_id', squadId)
      .neq('user_id', user.id);

    const otherMembers = members ?? [];

    // Auto-confirm proposer as "still down"
    await adminClient
      .from('squad_date_confirms')
      .insert({
        squad_id: squadId,
        message_id: messageId,
        user_id: user.id,
        response: 'yes',
      });

    // Create pending confirm rows for other members
    if (otherMembers.length > 0) {
      await adminClient
        .from('squad_date_confirms')
        .insert(otherMembers.map((m) => ({
          squad_id: squadId,
          message_id: messageId,
          user_id: m.user_id,
        })));

      // Get squad name for notifications
      const { data: squadData } = await supabase
        .from('squads')
        .select('name')
        .eq('id', squadId)
        .single();

      // Create notifications (not push — just in-app)
      await adminClient
        .from('notifications')
        .insert(otherMembers.map((m) => ({
          user_id: m.user_id,
          type: 'date_confirm',
          title: squadData?.name ?? 'Squad',
          body: `${displayName} proposed ${dateLabel}${timeLabel} — are you still down?`,
          related_squad_id: squadId,
          related_user_id: user.id,
        })));
    }

    return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString(), date_status: 'proposed' });
  }

  // --- Standard lock flow ---
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
