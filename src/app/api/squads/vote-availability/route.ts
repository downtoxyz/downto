import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

// Toggle one cell on an availability grid poll. Body: { pollId, dayOffset, slotIndex }.
// Inserts the row if absent, deletes if present. Idempotent per-cell.
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId, dayOffset, slotIndex } = await req.json();
  if (!pollId || !Number.isInteger(dayOffset) || !Number.isInteger(slotIndex) || dayOffset < 0 || slotIndex < 0) {
    return NextResponse.json({ error: 'pollId, dayOffset, slotIndex required' }, { status: 400 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Fetch poll to verify squad membership + grid bounds
  const { data: poll } = await adminClient
    .from('squad_polls')
    .select('id, squad_id, status, poll_type, grid_dates, grid_hour_start, grid_hour_end, grid_slot_minutes')
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

  const dates = (poll.grid_dates ?? []) as string[];
  const slotsPerDay = Math.ceil(((poll.grid_hour_end - poll.grid_hour_start) * 60) / poll.grid_slot_minutes);
  if (dayOffset >= dates.length || slotIndex >= slotsPerDay) {
    return NextResponse.json({ error: 'cell out of range' }, { status: 400 });
  }

  // Toggle: check if row exists, delete if yes, insert if no
  const { data: existing } = await adminClient
    .from('squad_poll_availability')
    .select('poll_id')
    .eq('poll_id', pollId)
    .eq('user_id', user.id)
    .eq('day_offset', dayOffset)
    .eq('slot_index', slotIndex)
    .maybeSingle();

  if (existing) {
    await adminClient
      .from('squad_poll_availability')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', user.id)
      .eq('day_offset', dayOffset)
      .eq('slot_index', slotIndex);
    return NextResponse.json({ ok: true, toggled: 'off' });
  }

  await adminClient
    .from('squad_poll_availability')
    .insert({ poll_id: pollId, user_id: user.id, day_offset: dayOffset, slot_index: slotIndex });
  return NextResponse.json({ ok: true, toggled: 'on' });
}
