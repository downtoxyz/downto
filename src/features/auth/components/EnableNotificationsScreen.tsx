"use client";

import { useState } from "react";
import { color } from "@/lib/styles";
import {
  isPushSupported,
  isIOSNotStandalone,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/pushNotifications";
import Grain from "@/app/components/Grain";

const IOSInstallScreen = ({ onComplete }: { onComplete: (enabled: boolean) => void }) => (
  <div className="max-w-[420px] mx-auto min-h-screen bg-bg flex flex-col" style={{ padding: "60px 24px" }}>
    <Grain />

    <h1 className="font-serif text-5xl text-primary font-normal mb-2 leading-tight">
      install the app
    </h1>
    <p className="font-mono text-xs text-dim mb-10 leading-relaxed">
      get push notifications, faster loading, and easy access from your home screen
    </p>

    <div className="flex flex-col gap-5 mb-10">
      {[
        { step: "1", text: <>tap the share button <span style={{ fontSize: 18, verticalAlign: "middle" }}>&#xFE0E;{"\u{1F4E4}"}</span> in Safari</> },
        { step: "2", text: <>scroll down and tap <strong className="text-primary">&quot;Add to Home Screen&quot;</strong></> },
        { step: "3", text: <>open <strong className="text-dt">down to</strong> from your home screen</> },
      ].map(({ step, text }) => (
        <div key={step} className="flex items-start gap-3.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-sm text-dt shrink-0"
            style={{ border: `1.5px solid ${color.borderMid}` }}
          >
            {step}
          </div>
          <p className="font-mono text-sm text-muted leading-relaxed pt-1">
            {text}
          </p>
        </div>
      ))}
    </div>

    <button
      disabled
      className="w-full p-4 bg-border-mid border-none rounded-xl text-dim font-mono text-sm font-bold cursor-default mb-4"
    >
      waiting for install...
    </button>

    <button
      onClick={() => onComplete(false)}
      className="bg-transparent border-none text-dim font-mono text-xs cursor-pointer self-center"
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
    <div className="max-w-[420px] mx-auto min-h-screen bg-bg flex flex-col" style={{ padding: "60px 24px" }}>
      <Grain />

      <h1 className="font-serif text-5xl text-primary font-normal mb-2 leading-tight">
        stay in the loop
      </h1>
      <p className="font-mono text-xs text-dim mb-10 leading-relaxed">
        get notified when friends send you a check, accept your request, or when your squad is formed
      </p>

      <button
        onClick={handleEnable}
        disabled={loading || !supported}
        className="w-full p-4 border-none rounded-xl font-mono text-sm font-bold mb-4"
        style={{
          background: supported ? color.accent : color.borderMid,
          color: supported ? color.bg : color.dim,
          cursor: supported ? "pointer" : "default",
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
        className="bg-transparent border-none text-dim font-mono text-xs cursor-pointer self-center"
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
