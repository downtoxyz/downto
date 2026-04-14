"use client";

import { font, color } from "@/lib/styles";

const Toast = ({
  message,
  action,
  onDismiss,
  dismissible,
}: {
  message: string;
  action?: (() => void) | null;
  onDismiss: () => void;
  dismissible?: boolean;
}) => (
  <div
    onClick={action ? () => {
      action();
      onDismiss();
    } : undefined}
    style={{
      position: "fixed",
      bottom: 100,
      left: "50%",
      transform: "translateX(-50%)",
      background: color.accent,
      color: "#000",
      padding: "10px 20px",
      borderRadius: 12,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      fontWeight: 700,
      zIndex: 200,
      animation: "toastIn 0.3s ease",
      whiteSpace: "nowrap",
      cursor: action ? "pointer" : "default",
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}
  >
    <span>{message}{action ? " tap >" : ""}</span>
    {dismissible && (
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        style={{
          background: "transparent",
          border: "none",
          color: "#000",
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
          opacity: 0.6,
        }}
      >×</button>
    )}
  </div>
);

export default Toast;
