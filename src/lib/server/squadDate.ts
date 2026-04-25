import type { SupabaseClient } from '@supabase/supabase-js';

export function formatDateLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Propose a squad date and trigger the standard date-confirm flow.
 * Inserts the interactive system message, the confirm rows (proposer auto-yes),
 * notifications for the other members, and syncs the date back to the linked
 * interest_check / event row. Mirrors the propose branch of /api/squads/set-date.
 *
 * Pass `proposerUserId: null` when the proposal is system-initiated (e.g. a
 * dates-poll winner). In that case no auto-yes is recorded and confirm rows
 * are created for every member.
 *
 * Pass `preConfirmedUserIds` to skip the "are you still down?" prompt for
 * members who already implicitly confirmed (e.g. they voted in the poll
 * whose winning slot is now being proposed). Those members get
 * `response: 'yes'` confirm rows and no notification — the only people
 * pinged are squad members who didn't weigh in.
 */
export async function proposeSquadDate(params: {
  adminClient: SupabaseClient;
  squadId: string;
  date: string;
  time: string | null;
  proposerUserId: string | null;
  proposerDisplayName: string;
  preConfirmedUserIds?: string[];
}): Promise<{ expiresAt: string; messageId: string }> {
  const { adminClient, squadId, date, time, proposerUserId, proposerDisplayName, preConfirmedUserIds } = params;

  const { data: squad } = await adminClient
    .from('squads')
    .select('check_id, event_id, name')
    .eq('id', squadId)
    .single();

  const expiresAtDate = new Date(date + 'T23:59:59Z');
  expiresAtDate.setHours(expiresAtDate.getHours() + 24);
  const expiresAt = expiresAtDate.toISOString();

  await adminClient
    .from('squads')
    .update({ expires_at: expiresAt, locked_date: date, date_status: 'proposed' })
    .eq('id', squadId);

  if (squad?.check_id) {
    await adminClient
      .from('interest_checks')
      .update({
        event_date: date,
        date_flexible: true,
        ...(time !== undefined ? { event_time: time, time_flexible: true } : {}),
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
    .from('squad_date_confirms')
    .delete()
    .eq('squad_id', squadId);

  const { data: msg } = await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: `${proposerDisplayName} proposed ${dateLabel}${timeLabel} — are you still down?`,
      is_system: true,
      message_type: 'date_confirm',
    })
    .select('id')
    .single();

  const messageId: string | undefined = msg?.id;
  if (!messageId) throw new Error('Failed to create date_confirm message');

  const memberFilter = adminClient
    .from('squad_members')
    .select('user_id')
    .eq('squad_id', squadId);
  const { data: allMembers } = proposerUserId
    ? await memberFilter.neq('user_id', proposerUserId)
    : await memberFilter;
  const otherMembers = allMembers ?? [];

  // Split "other members" into two buckets:
  //   - pre-confirmed (auto-yes, no notification) — they already weighed in
  //     via the source-of-truth signal (poll vote, etc.)
  //   - needs-prompt (response=null + notification) — the standard flow
  const preConfirmedSet = new Set(preConfirmedUserIds ?? []);
  const needsPrompt = otherMembers.filter((m) => !preConfirmedSet.has(m.user_id));
  const autoYesOthers = otherMembers.filter((m) => preConfirmedSet.has(m.user_id));

  if (proposerUserId) {
    await adminClient
      .from('squad_date_confirms')
      .insert({ squad_id: squadId, message_id: messageId, user_id: proposerUserId, response: 'yes' });
  }

  if (autoYesOthers.length > 0) {
    await adminClient
      .from('squad_date_confirms')
      .insert(autoYesOthers.map((m) => ({
        squad_id: squadId,
        message_id: messageId,
        user_id: m.user_id,
        response: 'yes',
      })));
  }

  if (needsPrompt.length > 0) {
    await adminClient
      .from('squad_date_confirms')
      .insert(needsPrompt.map((m) => ({
        squad_id: squadId,
        message_id: messageId,
        user_id: m.user_id,
      })));

    await adminClient
      .from('notifications')
      .insert(needsPrompt.map((m) => ({
        user_id: m.user_id,
        type: 'date_confirm',
        title: squad?.name ?? 'Squad',
        body: `${proposerDisplayName} proposed ${dateLabel}${timeLabel} — are you still down?`,
        related_squad_id: squadId,
        related_user_id: proposerUserId,
      })));
  }

  return { expiresAt, messageId };
}
