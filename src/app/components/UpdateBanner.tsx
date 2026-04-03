"use client";

import { useEffect, useRef, useState } from "react";
import { logVersionPing, API_BASE } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_BACKGROUND_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function clearCachesAndReload() {
  const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
  await Promise.all(regs.map((r) => r.unregister()));
  const keys = await caches?.keys() ?? [];
  await Promise.all(keys.map((k) => caches.delete(k)));
  window.location.reload();
}

export default function UpdateBanner() {
  const backgroundSince = useRef<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
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

  // Check if a newer build is available
  const checkForUpdate = async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API_BASE}/api/version`);
      const { buildId } = await r.json();
      return !!buildId && buildId !== CLIENT_BUILD_ID;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Auto-reload when returning from background after 5+ min
    function onVisibilityChange() {
      if (document.hidden) {
        backgroundSince.current = Date.now();
        return;
      }

      const since = backgroundSince.current;
      backgroundSince.current = null;
      if (!since || Date.now() - since < MIN_BACKGROUND_MS) return;

      checkForUpdate().then(async (hasUpdate) => {
        if (!hasUpdate) return;
        setReloading(true);
        await new Promise((r) => setTimeout(r, 400));
        await clearCachesAndReload();
      });
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Poll for updates while in foreground
  useEffect(() => {
    if (!CLIENT_BUILD_ID) return;
    const id = setInterval(async () => {
      if (document.hidden || updateAvailable) return;
      const hasUpdate = await checkForUpdate();
      if (hasUpdate) setUpdateAvailable(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [updateAvailable]);

  // Full-screen "updating..." overlay during auto-reload
  if (reloading) {
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

  // Gentle banner when update detected via polling
  if (updateAvailable) {
    return (
      <div
        onClick={async () => {
          setUpdateAvailable(false);
          setReloading(true);
          await new Promise((r) => setTimeout(r, 400));
          await clearCachesAndReload();
        }}
        style={{
          position: "fixed",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          background: color.accent,
          color: "#000",
          borderRadius: 12,
          padding: "10px 20px",
          fontFamily: font.mono,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          animation: "slideUp 0.3s ease-out",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          whiteSpace: "nowrap",
        }}
      >
        Update available — tap to refresh
      </div>
    );
  }

  return null;
}
