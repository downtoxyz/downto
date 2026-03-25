import webpush from 'web-push';
import { getServiceClient } from '@/lib/supabase-admin';

let vapidInitialized = false;

export function ensureVapid(): boolean {
  if (vapidInitialized) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:push@downto.xyz', pub, priv);
  vapidInitialized = true;
  return true;
}

interface NotificationPayload {
  id?: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  related_squad_id?: string | null;
  related_check_id?: string | null;
  related_user_id?: string | null;
  related_event_id?: string | null;
}

/** Send web-push to all of a user's subscriptions. Returns count sent. */
export async function sendPushToUser(notification: NotificationPayload): Promise<number> {
  const supabase = getServiceClient();

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id);

  if (!subscriptions?.length) return 0;

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body || '',
    type: notification.type,
    relatedId: notification.related_squad_id || notification.related_check_id || notification.related_event_id || notification.related_user_id,
  });

  const staleEndpoints: string[] = [];
  let sent = 0;

  const logRows: { notification_id: string | null; user_id: string; endpoint: string; status: string; error: string | null }[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
        logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.endpoint, status: 'sent', error: null });
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
          logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.endpoint, status: 'stale', error: `endpoint returned ${statusCode}` });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.endpoint, status: 'failed', error: message });
        }
      }
    })
  );

  // Log delivery attempts — never let logging break push delivery
  try {
    if (logRows.length > 0) {
      await supabase.from('push_logs').insert(logRows);
    }
  } catch (_) { /* swallow */ }

  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', notification.user_id)
      .in('endpoint', staleEndpoints);
  }

  return sent;
}
