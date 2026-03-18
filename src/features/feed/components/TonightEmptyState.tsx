"use client";

import { font, color } from "@/lib/styles";

export default function TonightEmptyState() {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{ fontFamily: font.serif, fontSize: 20, color: color.muted, marginBottom: 8 }}>
        Nothing tonight yet
      </div>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, lineHeight: 1.6 }}>
        Paste an IG link or add an event manually to get started
      </p>
    </div>
  );
}
