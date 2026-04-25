"use client";

import { useEffect, useMemo, useState } from "react";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

const EULOGIES = [
  "they got cold feet. it happens.",
  "this check has left the chat.",
  "the check went out for milk and never came back.",
  "rip. archived. ghosted. yeeted.",
  "the check has crossed the rainbow bridge.",
  "404 — vibes not found.",
  "this check has been moved to a farm upstate.",
  "the check has gone where all checks go. nowhere.",
  "abandoned, like new year's resolutions.",
  "they unchecked. the universe checked back.",
  "this check is sleeping with the fishes.",
  "the check ascended to a higher plane (the trash).",
  "rsvp'd to nothing forever.",
  "the check unsubscribed from being a check.",
];

const DISMISSALS = [
  "oh well",
  "whatever",
  "press f",
  "rip",
  "such is life",
  "bummer",
  "noted",
  "fair",
  "moving on",
  "carry on",
  "godspeed",
  "pour one out",
  "tragic",
  "respect",
  "no thoughts",
  "cool cool",
  "next",
];

const DeletedCheckScreen = ({
  open,
  onClose,
  isMine,
  onRevive,
}: {
  open: boolean;
  onClose: () => void;
  /** Author/co-author of the deleted check — when true, shows a "revive" CTA. */
  isMine: boolean;
  /** Called when the author taps "revive it". Should re-activate the check
   *  via the SECURITY DEFINER RPC and refresh data. The screen closes after. */
  onRevive: () => Promise<void>;
}) => {
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const [reviving, setReviving] = useState(false);

  const eulogy = useMemo(
    () => EULOGIES[Math.floor(Math.random() * EULOGIES.length)],
    // re-roll each time the screen is opened
    [open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dismissal = useMemo(
    () => DISMISSALS[Math.floor(Math.random() * DISMISSALS.length)],
    [open], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
      <div
        onClick={close}
        className="absolute inset-0 bg-black/70"
        style={{
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.25s ease, backdrop-filter 0.25s ease, -webkit-backdrop-filter 0.25s ease",
        }}
      />
      <div
        className="relative bg-surface w-full max-w-[360px] rounded-3xl border border-border px-6 py-10 flex flex-col items-center text-center"
        style={{
          opacity: (entering || closing) ? 0 : 1,
          transform: (entering || closing) ? "scale(0.96) translateY(8px)" : "scale(1) translateY(0)",
          transition: "opacity 0.25s ease-out, transform 0.25s ease-out",
        }}
      >
        <div
          aria-hidden
          className="font-serif text-primary mb-4 select-none"
          style={{ fontSize: 56, lineHeight: 1 }}
        >
          ⌑
        </div>
        <h2 className="font-serif text-primary font-normal mb-3" style={{ fontSize: 24, lineHeight: 1.15 }}>
          this check is gone.
        </h2>
        <p className="font-mono text-sm text-dim mb-8" style={{ lineHeight: 1.5 }}>
          {eulogy}
        </p>
        {isMine ? (
          <>
            <button
              disabled={reviving}
              onClick={async () => {
                setReviving(true);
                try {
                  await onRevive();
                  close();
                } finally {
                  setReviving(false);
                }
              }}
              className="font-mono text-xs uppercase bg-dt text-on-accent border-none rounded-xl cursor-pointer w-full disabled:opacity-60"
              style={{
                padding: "12px 16px",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {reviving ? "reviving…" : "revive it"}
            </button>
            <button
              onClick={close}
              disabled={reviving}
              className="font-mono text-xs uppercase bg-transparent border-none cursor-pointer text-dim mt-3 disabled:opacity-60"
              style={{
                padding: "8px 16px",
                letterSpacing: "0.08em",
              }}
            >
              {dismissal}
            </button>
          </>
        ) : (
          <button
            onClick={close}
            className="font-mono text-xs uppercase bg-dt text-on-accent border-none rounded-xl cursor-pointer w-full"
            style={{
              padding: "12px 16px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            {dismissal}
          </button>
        )}
      </div>
    </div>
  );
};

export default DeletedCheckScreen;
