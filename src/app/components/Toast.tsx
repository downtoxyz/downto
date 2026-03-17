"use client";

import { font, color } from "@/lib/styles";

const Toast = ({
  message,
  action,
  onDismiss,
}: {
  message: string;
  action?: (() => void) | null;
  onDismiss: () => void;
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
      fontFamily: font.mono,
      fontSize: 12,
      fontWeight: 700,
      zIndex: 200,
      animation: "toastIn 0.3s ease",
      whiteSpace: "nowrap",
      cursor: action ? "pointer" : "default",
    }}
  >
    {message}{action ? " tap >" : ""}
  </div>
);

export default Toast;
