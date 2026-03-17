"use client";

import { useState, useEffect } from "react";
import { font, color } from "@/lib/styles";
import { isIOSNotStandalone } from "@/lib/pushNotifications";

const DISMISSED_KEY = "pwa-install-banner-dismissed";

const IOSInstallBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isIOSNotStandalone() && localStorage.getItem(DISMISSED_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 12,
        right: 12,
        maxWidth: 396,
        margin: "0 auto",
        background: color.surface,
        border: `1px solid ${color.borderLight}`,
        borderRadius: 14,
        padding: "14px 16px",
        zIndex: 200,
        animation: "slideUp 0.3s ease",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontFamily: font.serif,
            fontSize: 16,
            color: color.text,
            marginBottom: 6,
          }}
        >
          install down to
        </p>
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            lineHeight: 1.5,
          }}
        >
          tap{" "}
          <span style={{ fontSize: 14, verticalAlign: "middle" }}>
            {"\u{1F4E4}"}
          </span>{" "}
          then &quot;Add to Home Screen&quot; for notifications &amp; faster access
        </p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, "1");
          setVisible(false);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 18,
          cursor: "pointer",
          padding: "0 4px",
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
};

export default IOSInstallBanner;
