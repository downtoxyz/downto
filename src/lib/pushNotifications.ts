import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/db';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

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
  if (isNativePlatform()) return true;
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// ---------------------------------------------------------------------------
// Web push (existing — unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Native push (Capacitor — iOS / Android)
// ---------------------------------------------------------------------------

export async function registerNativePush(): Promise<void> {
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('Native push permission not granted');
      return;
    }

    await PushNotifications.register();

    // Listen for the registration token
    PushNotifications.addListener('registration', async (token) => {
      console.log('Native push token:', token.value);
      await saveNativeTokenToServer(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Native push registration error:', err.error);
    });

    // Foreground notification received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground:', notification);
    });

    // User tapped on a notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push action performed:', action);
    });
  } catch (err) {
    console.warn('Native push registration failed:', err);
  }
}

async function saveNativeTokenToServer(deviceToken: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      platform,
      deviceToken,
    }),
  });
}

export async function unregisterNativePush(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // We don't have the token readily available, so we rely on server
      // cleaning up all native tokens for this user on explicit unregister.
      // For now, native unsubscribe is a no-op on the client side.
      // The server can clean up stale tokens when APNs returns errors.
    }
    await PushNotifications.removeAllListeners();
  } catch (err) {
    console.warn('Native push unregister failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Unified registration — picks web or native based on platform
// ---------------------------------------------------------------------------

export async function registerPush(): Promise<void> {
  if (isNativePlatform()) {
    await registerNativePush();
  } else {
    const registration = await registerServiceWorker();
    if (registration) {
      await subscribeToPush(registration);
    }
  }
}
