"use client";

import { useState } from "react";
import { font, color } from "@/lib/styles";
import {
  isPushSupported,
  isIOSNotStandalone,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/pushNotifications";
import Grain from "@/app/components/Grain";

const IOSInstallScreen = ({ onComplete }: { onComplete: (enabled: boolean) => void }) => (
  <div
    style={{
      maxWidth: 420,
      margin: "0 auto",
      minHeight: "100vh",
      background: color.bg,
      padding: "60px 24px",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Grain />

    <h1
      style={{
        fontFamily: font.serif,
        fontSize: 48,
        color: color.text,
        fontWeight: 400,
        marginBottom: 8,
        lineHeight: 1.1,
      }}
    >
      install the app
    </h1>
    <p
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        color: color.dim,
        marginBottom: 40,
        lineHeight: 1.6,
      }}
    >
      get push notifications, faster loading, and easy access from your home screen
    </p>

    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
      {[
        { step: "1", text: <>tap the share button <span style={{ fontSize: 18, verticalAlign: "middle" }}>&#xFE0E;{"\u{1F4E4}"}</span> in Safari</> },
        { step: "2", text: <>scroll down and tap <strong style={{ color: color.text }}>&quot;Add to Home Screen&quot;</strong></> },
        { step: "3", text: <>open <strong style={{ color: color.accent }}>down to</strong> from your home screen</> },
      ].map(({ step, text }) => (
        <div key={step} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1.5px solid ${color.borderMid}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 13,
              color: color.accent,
              flexShrink: 0,
            }}
          >
            {step}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 13,
              color: color.muted,
              lineHeight: 1.6,
              paddingTop: 4,
            }}
          >
            {text}
          </p>
        </div>
      ))}
    </div>

    <button
      disabled
      style={{
        width: "100%",
        padding: "16px",
        background: color.borderMid,
        border: "none",
        borderRadius: 12,
        color: color.dim,
        fontFamily: font.mono,
        fontSize: 14,
        fontWeight: 700,
        cursor: "default",
        marginBottom: 16,
      }}
    >
      waiting for install...
    </button>

    <button
      onClick={() => onComplete(false)}
      style={{
        background: "transparent",
        border: "none",
        color: color.dim,
        fontFamily: font.mono,
        fontSize: 12,
        cursor: "pointer",
        alignSelf: "center",
      }}
    >
      skip for now
    </button>
  </div>
);

const NotificationsScreen = ({ onComplete }: { onComplete: (enabled: boolean) => void }) => {
  const [loading, setLoading] = useState(false);
  const supported = isPushSupported();

  const handleEnable = async () => {
    setLoading(true);
    try {
      const reg = await registerServiceWorker();
      if (!reg) {
        onComplete(false);
        return;
      }
      const sub = await subscribeToPush(reg);
      onComplete(!!sub);
    } catch {
      onComplete(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
          lineHeight: 1.1,
        }}
      >
        stay in the loop
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
          lineHeight: 1.6,
        }}
      >
        get notified when friends send you a check, accept your request, or when your squad is formed
      </p>

      <button
        onClick={handleEnable}
        disabled={loading || !supported}
        style={{
          width: "100%",
          padding: "16px",
          background: supported ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: supported ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: supported ? "pointer" : "default",
          marginBottom: 16,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? "enabling..."
          : supported
            ? "enable notifications"
            : "notifications not supported"}
      </button>

      <button
        onClick={() => onComplete(false)}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "center",
        }}
      >
        skip for now
      </button>
    </div>
  );
};

const EnableNotificationsScreen = ({
  onComplete,
}: {
  onComplete: (enabled: boolean) => void;
}) => {
  if (isIOSNotStandalone()) {
    return <IOSInstallScreen onComplete={onComplete} />;
  }
  return <NotificationsScreen onComplete={onComplete} />;
};

export { IOSInstallScreen };
export default EnableNotificationsScreen;
