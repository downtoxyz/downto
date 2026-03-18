"use client";

import { font, color } from "@/lib/styles";

interface ForYouEmptyStateProps {
  onOpenAdd: () => void;
  onOpenFriends: (tab?: "friends" | "add") => void;
  setFeedMode: (mode: "foryou" | "tonight") => void;
}

export default function ForYouEmptyState({
  onOpenAdd,
  onOpenFriends,
  setFeedMode,
}: ForYouEmptyStateProps) {
  return (
    <div
      style={{
        background: color.card,
        border: `1px dashed ${color.borderMid}`,
        borderRadius: 16,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <p style={{ fontFamily: font.serif, fontSize: 22, color: color.text, marginBottom: 8 }}>
        Your feed is empty
      </p>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: color.dim, marginBottom: 24, lineHeight: 1.6 }}>
        Save events, add friends, or check out what&apos;s happening tonight
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => onOpenAdd()}
          style={{
            background: color.accent,
            color: "#000",
            border: "none",
            borderRadius: 20,
            padding: "10px 16px",
            fontFamily: font.mono,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Add Event
        </button>
        <button
          onClick={() => onOpenFriends()}
          style={{
            background: "transparent",
            color: color.text,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 20,
            padding: "10px 16px",
            fontFamily: font.mono,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Find Friends
        </button>
        <button
          onClick={() => setFeedMode("tonight")}
          style={{
            background: "transparent",
            color: color.text,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 20,
            padding: "10px 16px",
            fontFamily: font.mono,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Tonight ✶
        </button>
      </div>
    </div>
  );
}
