"use client";

import { useEffect, useRef, useState } from "react";
import { logVersionPing, API_BASE } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { color } from "@/lib/styles";

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
        className="fixed inset-0 z-[9999] bg-bg flex flex-col items-center justify-center gap-3"
        style={{ animation: "fadeIn 0.3s ease-out" }}
      >
        <div
          className="w-6 h-6 rounded-full"
          style={{
            border: `2px solid ${color.borderMid}`,
            borderTopColor: color.accent,
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p className="font-mono text-xs text-dim">
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
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] bg-dt text-black rounded-xl font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
        style={{
          padding: "10px 20px",
          animation: "slideUp 0.3s ease-out",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        Update available — tap to refresh
      </div>
    );
  }

  return null;
}
