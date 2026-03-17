"use client";

import { useState, useEffect, useRef } from "react";
import {
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";

export function usePushNotifications(
  isLoggedIn: boolean,
  isDemoMode: boolean,
  showToast: (msg: string) => void,
) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    if (!isPushSupported()) return;
    setPushSupported(true);

    (async () => {
      const reg = await registerServiceWorker();
      if (!reg) return;
      swRegistrationRef.current = reg;

      // Check if already subscribed
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setPushEnabled(true);
      } else if (!localStorage.getItem("pushAutoPrompted") && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        // Auto-prompt once after first login
        localStorage.setItem("pushAutoPrompted", "1");
        const sub = await subscribeToPush(reg);
        if (sub) {
          setPushEnabled(true);
        }
      }
    })();
  }, [isLoggedIn, isDemoMode]);

  const handleTogglePush = async () => {
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
