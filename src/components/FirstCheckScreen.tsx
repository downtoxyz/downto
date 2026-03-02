"use client";

import { useState, useRef, useEffect } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, sanitize } from "@/lib/utils";
import GlobalStyles from "./GlobalStyles";
import Grain from "./Grain";

const FirstCheckScreen = ({
  onComplete,
  onSkip,
}: {
  onComplete: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number, eventTime?: string | null, dateFlexible?: boolean, timeFlexible?: boolean) => void;
  onSkip: () => void;
}) => {
  const [idea, setIdea] = useState("");
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [squadSize, setSquadSize] = useState(5);

  const detectedDate = idea ? parseNaturalDate(idea) : null;
  const detectedTime = idea ? parseNaturalTime(idea) : null;
  const [dateDismissed, setDateDismissed] = useState(false);
  const [timeDismissed, setTimeDismissed] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [hasToggledLock, setHasToggledLock] = useState(false);
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => ideaRef.current?.focus(), 300);
  }, []);

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
          lineHeight: 1.1,
        }}
      >
        what are you down for?
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
        }}
      >
        throw out an idea — your friends & their friends will see it
      </p>

      {/* Idea textarea */}
      <textarea
        ref={ideaRef}
        value={idea}
        onChange={(e) => { setIdea(e.target.value.slice(0, 280)); setDateDismissed(false); setTimeDismissed(false); }}
        maxLength={280}
        placeholder="e.g., dinner at 7 tomorrow? rooftop picnic saturday? movie night?"
        style={{
          width: "100%",
          background: color.card,
          border: `1px solid ${color.borderMid}`,
          borderRadius: 12,
          padding: "14px 16px",
          color: color.text,
          fontFamily: font.mono,
          fontSize: 13,
          outline: "none",
          resize: "none",
          height: 100,
          lineHeight: 1.5,
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />

      {/* Auto-detected date/time chips */}
      {((detectedDate && !dateDismissed) || (detectedTime && !timeDismissed)) && (
        <div style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 12,
        }}>
          {detectedDate && !dateDismissed && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: dateLocked ? "rgba(232,255,90,0.08)" : "transparent",
              borderRadius: 8,
              border: dateLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
              cursor: "pointer",
            }}>
              <span
                onClick={() => { setDateLocked((v) => !v); setHasToggledLock(true); }}
                style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600, cursor: "pointer" }}
              >
                📅 {detectedDate.label}
              </span>
              <button
                onClick={() => setDateDismissed(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: color.dim,
                  fontFamily: font.mono,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
          {detectedTime && !timeDismissed && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: timeLocked ? "rgba(232,255,90,0.08)" : "transparent",
              borderRadius: 8,
              border: timeLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
              cursor: "pointer",
            }}>
              <span
                onClick={() => { setTimeLocked((v) => !v); setHasToggledLock(true); }}
                style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600, cursor: "pointer" }}
              >
                🕐 {detectedTime}
              </span>
              <button
                onClick={() => setTimeDismissed(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: color.dim,
                  fontFamily: font.mono,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
          {!hasToggledLock && (
            <div style={{ width: "100%", fontFamily: font.mono, fontSize: 9, color: color.faint, marginTop: 2 }}>
              tap to lock in · dashed = flexible
            </div>
          )}
        </div>
      )}

      {/* Timer picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
          Expires in
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "1h", hours: 1 as number | null },
            { label: "4h", hours: 4 as number | null },
            { label: "12h", hours: 12 as number | null },
            { label: "24h", hours: 24 as number | null },
            { label: "\u221e", hours: null as number | null },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setCheckTimer(opt.hours)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: checkTimer === opt.hours ? color.accent : "transparent",
                color: checkTimer === opt.hours ? "#000" : color.muted,
                border: `1px solid ${checkTimer === opt.hours ? color.accent : color.borderMid}`,
                borderRadius: 10,
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: checkTimer === opt.hours ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Squad size picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
          Starting squad size
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[3, 4, 5, 6, 8].map((n) => (
            <button
              key={n}
              onClick={() => setSquadSize(n)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: squadSize === n ? color.accent : "transparent",
                color: squadSize === n ? "#000" : color.muted,
                border: `1px solid ${squadSize === n ? color.accent : color.borderMid}`,
                borderRadius: 10,
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: squadSize === n ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Send it button */}
      <button
        onClick={() => {
          if (idea.trim()) {
            const eventDate = (!dateDismissed && detectedDate) ? detectedDate.iso : null;
            const eventTime = (!timeDismissed && detectedTime) ? detectedTime : null;
            onComplete(sanitize(idea, 280), checkTimer, eventDate, squadSize, eventTime, !dateLocked, !timeLocked);
          }
        }}
        disabled={!idea.trim()}
        style={{
          width: "100%",
          padding: "16px",
          background: idea.trim() ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: idea.trim() ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: idea.trim() ? "pointer" : "default",
          marginBottom: 16,
        }}
      >
        send it
      </button>

      {/* Skip link */}
      <button
        onClick={onSkip}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "center",
        }}
      >
        skip for now
      </button>
    </div>
  );
};

export default FirstCheckScreen;
