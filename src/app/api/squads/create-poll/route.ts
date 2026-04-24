import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

type GridParams = {
  dates: string[];
  hourStart: number;
  hourEnd: number;
  slotMinutes: number;
};

type WhenSlot = {
  date: string;
  startMin: number | null;
  endMin: number | null;
  label: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json();
  const { squadId, question, options, multiSelect = true, pollType = 'text' } = body;
  if (!squadId) {
    return NextResponse.json({ error: 'squadId required' }, { status: 400 });
  }
  if (pollType !== 'text' && pollType !== 'dates' && pollType !== 'availability' && pollType !== 'when') {
    return NextResponse.json({ error: 'invalid pollType' }, { status: 400 });
  }

  type DateOption = { date: string; time: string | null };
  let normalizedOptions: string[] | DateOption[] | WhenSlot[] = [];
  let grid: GridParams | null = null;
  let collectionStyle: 'preference' | 'availability' | null = null;

  if (pollType === 'when') {
    const { slots, collectionStyle: cs } = body as { slots?: unknown; collectionStyle?: unknown };
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 50) {
      return NextResponse.json({ error: 'slots must be 1–50 entries' }, { status: 400 });
    }
    if (cs !== 'preference' && cs !== 'availability') {
      return NextResponse.json({ error: "collectionStyle must be 'preference' or 'availability'" }, { status: 400 });
    }
    collectionStyle = cs;
    const isValidDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const parsed: WhenSlot[] = [];
    for (const raw of slots) {
      if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'slot must be an object' }, { status: 400 });
      const s = raw as { date?: unknown; startMin?: unknown; endMin?: unknown; label?: unknown };
      if (!isValidDate(s.date)) return NextResponse.json({ error: 'slot.date must be YYYY-MM-DD' }, { status: 400 });
      const startNull = s.startMin === null || s.startMin === undefined;
      const endNull = s.endMin === null || s.endMin === undefined;
      if (startNull !== endNull) return NextResponse.json({ error: 'startMin and endMin must both be set or both null' }, { status: 400 });
      let startMin: number | null = null;
      let endMin: number | null = null;
      if (!startNull) {
        if (!Number.isInteger(s.startMin) || !Number.isInteger(s.endMin)) return NextResponse.json({ error: 'startMin/endMin must be ints' }, { status: 400 });
        startMin = s.startMin as number;
        endMin = s.endMin as number;
        if (startMin < 0 || startMin > 1440 || endMin < 0 || endMin > 1440) return NextResponse.json({ error: 'startMin/endMin out of range' }, { status: 400 });
        if (startMin >= endMin) return NextResponse.json({ error: 'startMin must be < endMin' }, { status: 400 });
      }
      const label = typeof s.label === 'string' && s.label.trim().length > 0 ? s.label.trim().slice(0, 32) : null;
      parsed.push({ date: s.date, startMin, endMin, label });
    }
    // Dedupe by (date, startMin, endMin); sort by date then startMin (whole-day first).
    const seen = new Set<string>();
    const deduped = parsed.filter((slot) => {
      const k = `${slot.date}|${slot.startMin ?? '*'}|${slot.endMin ?? '*'}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    deduped.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.startMin === null && b.startMin === null) return 0;
      if (a.startMin === null) return -1;
      if (b.startMin === null) return 1;
      return a.startMin - b.startMin;
    });
    if (deduped.length < 1) return NextResponse.json({ error: 'need at least 1 slot' }, { status: 400 });
    normalizedOptions = deduped;
  } else if (pollType === 'availability') {
    const { dates, hourStart, hourEnd, slotMinutes } = body as GridParams;
    const isValidDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!Array.isArray(dates) || dates.length < 1 || dates.length > 21 || !dates.every(isValidDate)) {
      return NextResponse.json({ error: 'dates must be 1–21 YYYY-MM-DD strings' }, { status: 400 });
    }
    // Dedupe + sort chronologically.
    const normalizedDates = Array.from(new Set(dates)).sort();
    if (!Number.isInteger(hourStart) || !Number.isInteger(hourEnd) || hourStart < 0 || hourStart > 23 || hourEnd < 1 || hourEnd > 24 || hourEnd <= hourStart) {
      return NextResponse.json({ error: 'hourStart/hourEnd out of range' }, { status: 400 });
    }
    if (slotMinutes !== 30 && slotMinutes !== 60) {
      return NextResponse.json({ error: 'slotMinutes must be 30 or 60' }, { status: 400 });
    }
    grid = { dates: normalizedDates, hourStart, hourEnd, slotMinutes };
  } else {
    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      return NextResponse.json({ error: '2–10 options required' }, { status: 400 });
    }
    if (pollType === 'text' && !question?.trim()) {
      return NextResponse.json({ error: 'question required' }, { status: 400 });
    }
    if (pollType === 'dates') {
      const isValidDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const parsed: DateOption[] = [];
      for (const o of options) {
        if (!o || typeof o !== 'object' || !isValidDate((o as { date?: unknown }).date)) {
          return NextResponse.json({ error: 'each dates option needs { date: YYYY-MM-DD, time?: string }' }, { status: 400 });
        }
        const raw = o as { date: string; time?: unknown };
        const time = typeof raw.time === 'string' && raw.time.trim().length > 0 ? raw.time.trim().slice(0, 16) : null;
        parsed.push({ date: raw.date, time });
      }
      const seen = new Set<string>();
      normalizedOptions = parsed.filter((o) => {
        const k = `${o.date}|${o.time ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (normalizedOptions.length < 2) {
        return NextResponse.json({ error: 'need at least 2 distinct date options' }, { status: 400 });
      }
    } else {
      normalizedOptions = options.map((o: string) => String(o).trim()).filter((o: string) => o.length > 0);
      if (normalizedOptions.length < 2) {
        return NextResponse.json({ error: 'need at least 2 non-empty options' }, { status: 400 });
      }
    }
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

  // Get user display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const displayName = profile?.display_name ?? 'Someone';

  let pollQuestion: string;
  let messageText: string;
  if (pollType === 'when') {
    pollQuestion = 'when works?';
    messageText = collectionStyle === 'availability'
      ? `${displayName} is collecting availability`
      : `${displayName} started a when poll`;
  } else if (pollType === 'availability') {
    pollQuestion = 'when works?';
    messageText = `${displayName} started an availability poll`;
  } else if (pollType === 'dates') {
    pollQuestion = 'when works?';
    messageText = `${displayName} started a dates poll`;
  } else {
    pollQuestion = question.trim();
    messageText = `${displayName} started a poll: ${pollQuestion}`;
  }

  // Insert system message
  const { data: message, error: msgError } = await adminClient
    .from('messages')
    .insert({
      squad_id: squadId,
      sender_id: null,
      text: messageText,
      is_system: true,
      message_type: 'poll',
    })
    .select('id')
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Insert poll
  const pollRow: Record<string, unknown> = {
    squad_id: squadId,
    message_id: message.id,
    question: pollQuestion,
    options: normalizedOptions,
    multi_select: pollType === 'text' ? !!multiSelect : true,
    poll_type: pollType,
    created_by: user.id,
  };
  if (grid) {
    pollRow.grid_dates = grid.dates;
    pollRow.grid_hour_start = grid.hourStart;
    pollRow.grid_hour_end = grid.hourEnd;
    pollRow.grid_slot_minutes = grid.slotMinutes;
  }
  if (collectionStyle) {
    pollRow.collection_style = collectionStyle;
  }
  const { data: poll, error: pollError } = await adminClient
    .from('squad_polls')
    .insert(pollRow)
    .select('id')
    .single();

  if (pollError) {
    return NextResponse.json({ error: pollError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pollId: poll.id, messageId: message.id });
}
