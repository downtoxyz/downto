import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/db';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isIOSNotStandalone(): boolean {
  if (!isIOS()) return false;
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return !isStandalone;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    return registration;
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    await saveSubscriptionToServer(subscription);
    return subscription;
  } catch (err) {
    console.warn('Push subscription failed:', err);
    return null;
  }
}

async function saveSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const subJson = subscription.toJSON();

  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }),
  });
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<void> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }

    await subscription.unsubscribe();
  } catch (err) {
    console.warn('Push unsubscribe failed:', err);
  }
}
