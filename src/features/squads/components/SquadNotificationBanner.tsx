"use client";

import { font, color } from "@/lib/styles";

interface SquadNotificationData {
  squadId: string;
  squadName: string;
  ideaBy: string;
  startedBy: string;
  members: string[];
}

const SquadNotificationBanner = ({
  notification,
  onOpen,
}: {
  notification: SquadNotificationData;
  onOpen: (squadId: string) => void;
}) => (
  <div
    onClick={() => onOpen(notification.squadId)}
    style={{
      position: "fixed",
      top: 60,
      left: 20,
      right: 20,
      background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
      border: `2px solid ${color.accent}`,
      borderRadius: 16,
      padding: 16,
      zIndex: 250,
      animation: "toastIn 0.3s ease",
      boxShadow: `0 8px 32px rgba(232, 255, 90, 0.2)`,
      cursor: "pointer",
    }}
  >
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        color: color.accent,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: 8,
      }}
    >
      🎉 Squad Formed!
    </div>
    <div
      style={{
        fontFamily: font.serif,
        fontSize: 18,
        color: color.text,
        marginBottom: 12,
      }}
    >
      {notification.squadName}
    </div>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.dim,
        }}
      >
        💡 idea by <span style={{ color: color.text }}>{notification.ideaBy}</span>
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.dim,
        }}
      >
        🚀 started by <span style={{ color: color.accent }}>{notification.startedBy}</span>
      </div>
      {notification.members.length > 0 && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            marginTop: 4,
          }}
        >
          👥 {notification.members.join(", ")} + you
        </div>
      )}
    </div>
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        color: color.accent,
        marginTop: 10,
        opacity: 0.7,
      }}
    >
      Tap to open chat →
    </div>
  </div>
);

export default SquadNotificationBanner;
