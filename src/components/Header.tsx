"use client";

import { font, color } from "@/lib/styles";

const Header = ({
  unreadCount,
  onOpenNotifications,
  onOpenAdd,
  glowAdd,
}: {
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAdd: () => void;
  glowAdd?: boolean;
}) => (
  <div
    style={{
      padding: "8px 20px 2px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexShrink: 0,
      background: color.bg,
    }}
  >
    <h1
      style={{
        fontFamily: font.serif,
        fontSize: 28,
        color: color.text,
        fontWeight: 400,
        letterSpacing: "-0.02em",
      }}
    >
      down to
    </h1>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Bell icon */}
      <button
        onClick={onOpenNotifications}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          position: "relative",
          padding: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: unreadCount > 9 ? 18 : 16,
              height: 16,
              borderRadius: 8,
              background: "#ff3b30",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: font.mono,
              color: "#fff",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </button>
      {/* Add event button */}
      <div style={{ position: "relative" }}>
        {glowAdd && (
          <div
            style={{
              position: "absolute",
              bottom: -28,
              right: 0,
              whiteSpace: "nowrap",
              fontFamily: font.mono,
              fontSize: 10,
              color: color.accent,
              letterSpacing: "0.02em",
            }}
          >
            drop your first idea
          </div>
        )}
        <button
          onClick={onOpenAdd}
          style={{
            background: color.accent,
            color: "#000",
            border: "none",
            width: 40,
            height: 40,
            borderRadius: "50%",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            animation: glowAdd ? "addButtonGlow 2s ease-in-out infinite" : undefined,
          }}
        >
          +
        </button>
      </div>
    </div>
  </div>
);

export default Header;
