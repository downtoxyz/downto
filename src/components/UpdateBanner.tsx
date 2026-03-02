"use client";

import { useEffect, useRef, useState } from "react";
import { font, color } from "@/lib/styles";
import { logVersionPing } from "@/lib/db";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_BACKGROUND_MS = 5 * 60 * 1000; // 5 minutes

export default function UpdateBanner() {
  const [show, setShow] = useState(false);
  const backgroundSince = useRef<number | null>(null);

  useEffect(() => {
    if (CLIENT_BUILD_ID) logVersionPing(CLIENT_BUILD_ID);
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
        .then(({ buildId }) => {
          if (buildId && buildId !== CLIENT_BUILD_ID) setShow(true);
        })
        .catch(() => {});
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 70,
        left: 0,
        right: 0,
        zIndex: 9998,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: color.surface,
          border: `1px solid ${color.borderMid}`,
          borderRadius: 12,
          padding: "10px 14px",
          pointerEvents: "auto",
        }}
      >
        <span
          onClick={() => window.location.reload()}
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: color.accent,
            cursor: "pointer",
          }}
        >
          Update available &middot; tap to refresh
        </span>
        <span
          onClick={() => setShow(false)}
          style={{
            fontFamily: font.mono,
            fontSize: 14,
            color: color.dim,
            cursor: "pointer",
            padding: "0 2px",
          }}
        >
          &times;
        </span>
      </div>
    </div>
  );
}
