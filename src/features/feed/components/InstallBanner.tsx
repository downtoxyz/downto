"use client";

interface InstallBannerProps {
  variant: "install" | "notifications";
  onDismiss: () => void;
  onEnableNotifications?: () => void;
}

export default function InstallBanner({ variant, onDismiss, onEnableNotifications }: InstallBannerProps) {
  return (
    <div className="mx-4 mb-4 rounded-2xl border border-dt/20 bg-dt/[0.08] px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {variant === "install" ? (
          <>
            <p className="font-mono text-xs text-dt m-0 mb-1 font-bold uppercase tracking-[0.08em]">
              Add to Home Screen
            </p>
            <p className="font-mono text-[11px] text-neutral-400 m-0 leading-relaxed">
              Get notifications — tap{" "}
              <span className="inline-block align-middle text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dt inline-block">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{" "}
              then &ldquo;Add to Home Screen&rdquo;
            </p>
          </>
        ) : (
          <>
            <p className="font-mono text-xs text-dt m-0 mb-1 font-bold uppercase tracking-[0.08em]">
              Enable Notifications
            </p>
            <p className="font-mono text-[11px] text-neutral-400 m-0 leading-relaxed">
              Get notified when friends respond to your checks
            </p>
            {onEnableNotifications && (
              <button
                onClick={onEnableNotifications}
                className="mt-2 bg-dt text-on-accent font-mono text-[11px] font-bold uppercase tracking-[0.08em] border-none rounded-lg py-1.5 px-3 cursor-pointer"
              >
                Turn on
              </button>
            )}
          </>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 bg-transparent border-none text-neutral-500 font-mono text-xs cursor-pointer p-1"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
