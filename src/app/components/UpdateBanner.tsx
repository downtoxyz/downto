"use client";

import { useEffect, useRef, useState } from "react";
import { logVersionPing } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_BACKGROUND_MS = 5 * 60 * 1000; // 5 minutes

export default function UpdateBanner() {
  const backgroundSince = useRef<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const hasPinged = useRef(false);

  // Wait for auth to be ready before logging version ping
  useEffect(() => {
    if (!CLIENT_BUILD_ID) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && !hasPinged.current) {
        hasPinged.current = true;
        logVersionPing(CLIENT_BUILD_ID);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        backgroundSince.current = Date.now();
        return;
      }

      // Returning to foreground
      const since = backgroundSince.current;
      backgroundSince.current = null;
      if (!since || Date.now() - since < MIN_BACKGROUND_MS) return;

      fetch("/api/version")
        .then((r) => r.json())
        .then(async ({ buildId }) => {
          if (!buildId || buildId === CLIENT_BUILD_ID) return;

          // Show smooth transition, then reload
          setReloading(true);

          // Wait for fade animation to complete
          await new Promise((r) => setTimeout(r, 400));

          const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
          await Promise.all(regs.map((r) => r.unregister()));
          const keys = await caches?.keys() ?? [];
          await Promise.all(keys.map((k) => caches.delete(k)));
          window.location.reload();
        })
        .catch(() => {});
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  if (!reloading) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: color.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: `2px solid ${color.borderMid}`,
          borderTopColor: color.accent,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>
        updating...
      </p>
    </div>
  );
}
