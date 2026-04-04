import webpush from 'web-push';
import apn from '@parse/node-apn';
import { getServiceClient } from '@/lib/supabase-admin';

// ── Web Push (VAPID) ────────────────────────────────────────────────────────

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

// ── APNs ────────────────────────────────────────────────────────────────────

let apnsProvider: apn.Provider | null = null;
let apnsInitialized = false;

function ensureApns(): boolean {
  if (apnsInitialized) return !!apnsProvider;
  apnsInitialized = true;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID ?? 'xyz.downto.app';
  const keyBase64 = process.env.APNS_KEY_BASE64;
  const keyPath = process.env.APNS_KEY_PATH;
  const sandbox = process.env.APNS_SANDBOX === 'true';

  if (!keyId || !teamId || (!keyBase64 && !keyPath)) return false;

  const keyOption = keyBase64
    ? { key: Buffer.from(keyBase64, 'base64').toString('utf-8') }
    : { key: keyPath! };

  apnsProvider = new apn.Provider({
    token: { ...keyOption, keyId, teamId },
    production: !sandbox,
  });

  // Store bundleId for later use
  (apnsProvider as unknown as { _bundleId: string })._bundleId = bundleId;
  return true;
}

// ── Shared types ────────────────────────────────────────────────────────────

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

// ── Send to all platforms ───────────────────────────────────────────────────

/** Send push to all of a user's subscriptions (web + native). Returns count sent. */
export async function sendPushToUser(notification: NotificationPayload): Promise<number> {
  const supabase = getServiceClient();

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id);

  if (!subscriptions?.length) return 0;

  const webSubs = subscriptions.filter((s) => s.platform === 'web');
  const iosSubs = subscriptions.filter((s) => s.platform === 'ios');

  const staleEndpoints: string[] = [];
  const staleDeviceTokens: string[] = [];
  let sent = 0;

  const logRows: { notification_id: string | null; user_id: string; endpoint: string; status: string; error: string | null }[] = [];

  const relatedId = notification.related_squad_id || notification.related_check_id || notification.related_event_id || notification.related_user_id;

  // ── Web push ──────────────────────────────────────────────────────────

  if (webSubs.length > 0 && ensureVapid()) {
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body || '',
      type: notification.type,
      relatedId,
    });

    await Promise.allSettled(
      webSubs.map(async (sub) => {
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
  }

  // ── APNs (iOS native) ─────────────────────────────────────────────────

  if (iosSubs.length > 0 && ensureApns() && apnsProvider) {
    const bundleId = (apnsProvider as unknown as { _bundleId: string })._bundleId ?? 'xyz.downto.app';

    await Promise.allSettled(
      iosSubs.map(async (sub) => {
        if (!sub.device_token) return;
        const note = new apn.Notification();
        note.alert = { title: notification.title, body: notification.body || '' };
        note.sound = 'default';
        note.badge = 1;
        note.topic = bundleId;
        note.payload = {
          type: notification.type,
          relatedId,
        };

        try {
          const result = await apnsProvider!.send(note, sub.device_token);
          if (result.sent.length > 0) {
            sent++;
            logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.device_token, status: 'sent', error: null });
          }
          for (const failure of result.failed) {
            const reason = failure.response?.reason ?? 'unknown';
            if (reason === 'Unregistered' || reason === 'BadDeviceToken') {
              staleDeviceTokens.push(sub.device_token);
              logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.device_token, status: 'stale', error: reason });
            } else {
              logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.device_token, status: 'failed', error: reason });
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logRows.push({ notification_id: notification.id ?? null, user_id: notification.user_id, endpoint: sub.device_token, status: 'failed', error: message });
        }
      })
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

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

  if (staleDeviceTokens.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', notification.user_id)
      .in('device_token', staleDeviceTokens);
  }

  return sent;
}
