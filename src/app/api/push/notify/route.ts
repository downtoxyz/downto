import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';
import { ensureVapid, sendPushToUser } from '@/lib/push';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!ensureVapid()) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }

  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;

  const { checkId, squadId, eventId, messageTimestamp } = await request.json();
  const supabase = getServiceClient();
  let notifications: Record<string, unknown>[] | null = null;

  if (checkId) {
    // Fetch friend_check notifications created by the DB trigger
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('related_check_id', checkId)
      .eq('type', 'friend_check');
    notifications = data;
  } else if (eventId) {
    // Fetch friend_event notifications created by the DB trigger
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('related_event_id', eventId)
      .eq('type', 'friend_event');
    notifications = data;
  } else if (squadId) {
    // Fetch squad_message notifications created after the message was sent
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('related_squad_id', squadId)
      .in('type', ['squad_message', 'squad_mention']);
    if (messageTimestamp) {
      query = query.gte('created_at', messageTimestamp);
    }
    const { data } = await query;
    notifications = data;
  } else {
    return NextResponse.json({ error: 'Missing checkId, eventId, or squadId' }, { status: 400 });
  }

  if (!notifications?.length) {
    return NextResponse.json({ sent: 0 });
  }

  let totalSent = 0;
  await Promise.allSettled(
    notifications.map(async (n) => {
      totalSent += await sendPushToUser(n as unknown as Parameters<typeof sendPushToUser>[0]);
    })
  );

  return NextResponse.json({ sent: totalSent });
}
