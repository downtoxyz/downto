"use client";

import { HEADER_HEIGHT_PX } from "./Header";

/**
 * Sticky banner that sits just below the Header when the viewer has pending
 * friend requests. Tapping opens the Friends modal on the friends tab (where
 * the incoming-requests list lives). Visible until every request has been
 * accepted or rejected (count drops to 0).
 */
export default function FriendRequestBanner({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  if (count <= 0) return null;
  const label = `${count} friend request${count === 1 ? "" : "s"} waiting`;
  return (
    <button
      onClick={onOpen}
      data-testid="friend-request-banner"
      className="fixed left-0 right-0 z-30 max-w-[420px] mx-auto px-3 bg-transparent border-none cursor-pointer"
      style={{
        top: `calc(env(safe-area-inset-top, 16px) + ${HEADER_HEIGHT_PX}px)`,
      }}
    >
      <div className="bg-dt text-on-accent rounded-xl flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ boxShadow: "0 4px 14px rgba(254, 68, 255, 0.35)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-on-accent shrink-0 animate-pulse" />
          <span className="font-mono text-xs font-bold uppercase tracking-[0.08em] truncate">
            {label}
          </span>
        </div>
        <span className="font-mono text-xs font-bold shrink-0">→</span>
      </div>
    </button>
  );
}

/** Height contributed to the top of the scroll container when the banner is visible. */
export const FRIEND_REQUEST_BANNER_HEIGHT_PX = 48;
