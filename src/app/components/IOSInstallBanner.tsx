"use client";

import { useState, useEffect } from "react";
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
      className="fixed bottom-20 left-3 right-3 max-w-[396px] mx-auto bg-surface border border-border-light rounded-xl z-[200] flex items-start gap-3"
      style={{
        padding: "14px 16px",
        animation: "slideUp 0.3s ease",
      }}
    >
      <div className="flex-1">
        <p className="font-serif text-base text-primary mb-1.5">
          install down to
        </p>
        <p className="font-mono text-xs text-dim leading-relaxed">
          tap{" "}
          <span className="text-sm align-middle">
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
        className="bg-transparent border-none text-dim font-mono text-lg cursor-pointer px-1 leading-none shrink-0"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
};

export default IOSInstallBanner;
