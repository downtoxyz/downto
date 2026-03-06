"use client";

import { useState, useRef, useEffect } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, parseNaturalLocation, parseDateToISO, sanitize } from "@/lib/utils";
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
  const detectedLocation = idea ? parseNaturalLocation(idea) : null;

  const [manualDate, setManualDate] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState<string | null>(null);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [locationLocked, setLocationLocked] = useState(false);
  const [editingChip, setEditingChip] = useState<"date" | "time" | "location" | null>(null);
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
        onChange={(e) => { setIdea(e.target.value.slice(0, 280)); }}
        maxLength={280}
        placeholder="e.g., park hang w me and @kat ^.^ dinner at 7 tomorrow? need to touch grass asap"
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

      {/* Date / Time / Location chips — always visible */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {([
          { key: "date" as const, placeholder: "date?", detected: detectedDate?.label ?? null, manual: manualDate, setManual: setManualDate, locked: dateLocked, setLocked: setDateLocked },
          { key: "time" as const, placeholder: "time?", detected: detectedTime ?? null, manual: manualTime, setManual: setManualTime, locked: timeLocked, setLocked: setTimeLocked },
          { key: "location" as const, placeholder: "location?", detected: detectedLocation ?? null, manual: manualLocation, setManual: setManualLocation, locked: locationLocked, setLocked: setLocationLocked },
        ] as const).map((chip) => {
          const value = chip.manual !== null ? chip.manual : chip.detected;
          const hasValue = !!value;
          const isEditing = editingChip === chip.key;

          if (isEditing) {
            return (
              <input
                key={chip.key}
                autoFocus
                placeholder={chip.placeholder.replace("?", "")}
                defaultValue={value ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  chip.setManual(v || "");
                  setEditingChip(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                }}
                style={{
                  padding: "6px 10px",
                  background: "rgba(232,255,90,0.08)",
                  border: `1px solid ${color.accent}`,
                  borderRadius: 8,
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.accent,
                  fontWeight: 600,
                  outline: "none",
                  width: 120,
                }}
              />
            );
          }

          return (
            <div
              key={chip.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 10px",
                background: "rgba(232,255,90,0.08)",
                borderRadius: 8,
                border: "1px solid rgba(232,255,90,0.2)",
              }}
            >
              <span
                onClick={() => {
                  if (!hasValue) setEditingChip(chip.key);
                  else if (chip.locked) chip.setLocked(false);
                  else setEditingChip(chip.key);
                }}
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: hasValue ? color.accent : color.dim,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {hasValue ? value : chip.placeholder}
              </span>
              {!chip.locked && (
                <span
                  onClick={(e) => { e.stopPropagation(); chip.setLocked(true); }}
                  style={{
                    padding: "1px 6px",
                    background: "rgba(232,255,90,0.15)",
                    borderRadius: 4,
                    fontFamily: font.mono,
                    fontSize: 9,
                    color: color.accent,
                    cursor: "pointer",
                  }}
                >
                  flexible
                </span>
              )}
              {hasValue && (
                <button
                  onClick={(e) => { e.stopPropagation(); chip.setManual(""); chip.setLocked(false); }}
                  style={{ background: "none", border: "none", color: color.dim, fontFamily: font.mono, fontSize: 13, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

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
          Squad size
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "3", value: 3 },
            { label: "4", value: 4 },
            { label: "5", value: 5 },
            { label: "6", value: 6 },
            { label: "8", value: 8 },
            { label: "\u221e", value: 0 },
          ].map((opt) => {
            const selected = squadSize === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => setSquadSize(opt.value)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: selected ? color.accent : "transparent",
                  color: selected ? "#000" : color.muted,
                  border: `1px solid ${selected ? color.accent : color.borderMid}`,
                  borderRadius: 10,
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: selected ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Send it button */}
      <button
        onClick={() => {
          if (idea.trim()) {
            const eventDate = manualDate !== null
              ? (manualDate ? parseDateToISO(manualDate) : null)
              : (detectedDate?.iso ?? null);
            const eventTime = manualTime !== null ? (manualTime || null) : (detectedTime ?? null);
            onComplete(sanitize(idea, 280), checkTimer, eventDate, squadSize === 0 ? 999 : squadSize, eventTime, !dateLocked, !timeLocked);
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
