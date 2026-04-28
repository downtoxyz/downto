"use client";

import { useState, useEffect, useRef } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  isPushSupported,
  isNativePlatform,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  registerNativePush,
} from "@/lib/pushNotifications";

export function usePushNotifications(
  isLoggedIn: boolean,
  showToast: (msg: string) => void,
) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!isPushSupported()) return;
    setPushSupported(true);

    (async () => {
      if (isNativePlatform()) {
        // On native, the OS owns permission state. Mirror it into the toggle.
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive === "granted") {
          // iOS preserves the permission grant across uninstall/reinstall, so
          // a fresh build on an already-allowed device hits this branch on
          // first sign-in. We still need to call register() so APNs hands us
          // a fresh device token and we save it to push_subscriptions.
          // registerNativePush is idempotent — re-calling on an already-
          // granted device just refreshes the token.
          const ok = await registerNativePush();
          if (ok) setPushEnabled(true);
        } else if (
          perm.receive === "prompt" &&
          !localStorage.getItem("pushAutoPrompted")
        ) {
          localStorage.setItem("pushAutoPrompted", "1");
          const ok = await registerNativePush();
          if (ok) setPushEnabled(true);
        }
        return;
      }

      const reg = await registerServiceWorker();
      if (!reg) return;
      swRegistrationRef.current = reg;

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setPushEnabled(true);
      } else if (!localStorage.getItem("pushAutoPrompted") && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        localStorage.setItem("pushAutoPrompted", "1");
        const sub = await subscribeToPush(reg);
        if (sub) {
          setPushEnabled(true);
        }
      }
    })();
  }, [isLoggedIn]);

  const handleTogglePush = async () => {
    if (isNativePlatform()) {
      if (pushEnabled) {
        // iOS doesn't let an app revoke its own push permission.
        showToast("Disable in iOS Settings → downto");
        return;
      }
      const ok = await registerNativePush();
      if (ok) {
        setPushEnabled(true);
        showToast("Push notifications enabled!");
      } else {
        showToast("Enable in iOS Settings → downto");
      }
      return;
    }

    const reg = swRegistrationRef.current;
    if (!reg) return;

    if (pushEnabled) {
      await unsubscribeFromPush(reg);
      setPushEnabled(false);
      showToast("Push notifications disabled");
    } else {
      const sub = await subscribeToPush(reg);
      if (sub) {
        setPushEnabled(true);
        showToast("Push notifications enabled!");
      } else {
        showToast("Could not enable push — check browser permissions");
      }
    }
  };

  return {
    pushEnabled,
    pushSupported,
    handleTogglePush,
  };
}
