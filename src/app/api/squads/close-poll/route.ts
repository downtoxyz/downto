import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { proposeSquadDate, formatDateLabel } from '@/lib/server/squadDate';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { pollId } = await req.json();
  if (!pollId) {
    return NextResponse.json({ error: 'pollId required' }, { status: 400 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Fetch poll
  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .select('id, squad_id, status, created_by, poll_type, options, grid_dates, grid_hour_start, grid_slot_minutes')
    .eq('id', pollId)
    .single();

  if (pollError || !poll) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }

  if (poll.status !== 'active') {
    return NextResponse.json({ error: 'Poll is already closed' }, { status: 400 });
  }

  if (poll.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the poll creator can close it' }, { status: 403 });
  }

  // Close poll
  const { error: updateError } = await adminClient
    .from('squad_polls')
    .update({ status: 'closed' })
    .eq('id', pollId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  // System message
  await adminClient
    .from('messages')
    .insert({
      squad_id: poll.squad_id,
      sender_id: null,
      text: `${displayName} closed the poll`,
      is_system: true,
    });

  // Dates polls auto-propose the plurality winner (unique highest-count option).
  // Ties or zero-vote polls resolve without proposing anything.
  if (poll.poll_type === 'dates') {
    const { data: votes } = await adminClient
      .from('squad_poll_votes')
      .select('option_index')
      .eq('poll_id', pollId);

    const counts = new Map<number, number>();
    for (const v of votes ?? []) counts.set(v.option_index, (counts.get(v.option_index) ?? 0) + 1);

    let topIdx: number | null = null;
    let topCount = 0;
    let tied = false;
    for (const [idx, c] of counts) {
      if (c > topCount) { topIdx = idx; topCount = c; tied = false; }
      else if (c === topCount) { tied = true; }
    }

    if (topIdx !== null && !tied && topCount > 0) {
      const options = poll.options as Array<{ date: string; time: string | null }>;
      const winner = options[topIdx];
      if (winner?.date) {
        const label = formatDateLabel(winner.date) + (winner.time ? ` · ${winner.time}` : '');
        await adminClient
          .from('messages')
          .insert({
            squad_id: poll.squad_id,
            sender_id: null,
            text: `${label} wins — proposing to the squad`,
            is_system: true,
          });
        try {
          await proposeSquadDate({
            adminClient,
            squadId: poll.squad_id,
            date: winner.date,
            time: winner.time,
            proposerUserId: null,
            proposerDisplayName: 'The poll',
          });
        } catch (err) {
          // Non-fatal: poll is already closed and the winner message is in
          // chat. Someone can propose manually.
          console.error('proposeSquadDate from poll winner failed', err);
        }
      }
    }
  }

  // Availability polls resolve by plurality-best cell: the (day, slot) where
  // the most members are free. Ties or zero-response polls resolve quietly.
  if (poll.poll_type === 'availability') {
    const { data: cells } = await adminClient
      .from('squad_poll_availability')
      .select('user_id, day_offset, slot_index')
      .eq('poll_id', pollId);

    const counts = new Map<string, { count: number; dayOffset: number; slotIndex: number }>();
    for (const c of cells ?? []) {
      const key = `${c.day_offset}|${c.slot_index}`;
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { count: 1, dayOffset: c.day_offset, slotIndex: c.slot_index });
    }
    let top: { count: number; dayOffset: number; slotIndex: number } | null = null;
    let tied = false;
    for (const v of counts.values()) {
      if (!top || v.count > top.count) { top = v; tied = false; }
      else if (v.count === top.count) { tied = true; }
    }

    const gridDates = (poll.grid_dates ?? []) as string[];
    if (top && !tied && top.count > 0 && gridDates[top.dayOffset] && poll.grid_hour_start !== null && poll.grid_slot_minutes) {
      const iso = gridDates[top.dayOffset];
      const totalMin = poll.grid_hour_start * 60 + top.slotIndex * poll.grid_slot_minutes;
      const hour24 = Math.floor(totalMin / 60);
      const minute = totalMin % 60;
      const ampm = hour24 >= 12 ? 'pm' : 'am';
      const hour12 = ((hour24 + 11) % 12) + 1;
      const timeStr = minute === 0 ? `${hour12}${ampm}` : `${hour12}:${minute.toString().padStart(2, '0')}${ampm}`;

      const label = `${formatDateLabel(iso)} · ${timeStr}`;
      await adminClient
        .from('messages')
        .insert({
          squad_id: poll.squad_id,
          sender_id: null,
          text: `${label} wins — proposing to the squad`,
          is_system: true,
        });
      try {
        await proposeSquadDate({
          adminClient,
          squadId: poll.squad_id,
          date: iso,
          time: timeStr,
          proposerUserId: null,
          proposerDisplayName: 'The poll',
        });
      } catch (err) {
        console.error('proposeSquadDate from availability winner failed', err);
      }
    }
  }

  // 'when' polls: same plurality model as dates polls, but the winning slot
  // carries a {date, startMin, endMin, label}. Whole-day winners propose
  // without a time. Ranges propose their start time.
  if (poll.poll_type === 'when') {
    const { data: votes } = await adminClient
      .from('squad_poll_votes')
      .select('option_index')
      .eq('poll_id', pollId);

    const counts = new Map<number, number>();
    for (const v of votes ?? []) counts.set(v.option_index, (counts.get(v.option_index) ?? 0) + 1);

    let topIdx: number | null = null;
    let topCount = 0;
    let tied = false;
    for (const [idx, c] of counts) {
      if (c > topCount) { topIdx = idx; topCount = c; tied = false; }
      else if (c === topCount) { tied = true; }
    }

    if (topIdx !== null && !tied && topCount > 0) {
      const slots = poll.options as Array<{ date: string; startMin: number | null; endMin: number | null; label: string | null }>;
      const winner = slots[topIdx];
      if (winner?.date) {
        const formatMinuteOfDay = (min: number): string => {
          const h24 = Math.floor(min / 60);
          const m = min % 60;
          const ampm = h24 >= 12 ? 'pm' : 'am';
          const h12 = ((h24 + 11) % 12) + 1;
          return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
        };
        const timeStr = winner.startMin !== null ? formatMinuteOfDay(winner.startMin) : null;
        const displaySuffix = winner.label ?? (timeStr ?? '');
        const label = displaySuffix ? `${formatDateLabel(winner.date)} · ${displaySuffix}` : formatDateLabel(winner.date);
        await adminClient
          .from('messages')
          .insert({
            squad_id: poll.squad_id,
            sender_id: null,
            text: `${label} wins — proposing to the squad`,
            is_system: true,
          });
        try {
          await proposeSquadDate({
            adminClient,
            squadId: poll.squad_id,
            date: winner.date,
            time: timeStr,
            proposerUserId: null,
            proposerDisplayName: 'The poll',
          });
        } catch (err) {
          console.error('proposeSquadDate from when winner failed', err);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
