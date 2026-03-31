"use client";

import { useState, useRef, useEffect } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, sanitize } from "@/lib/utils";
import Grain from "@/app/components/Grain";

const FirstCheckScreen = ({
  onComplete,
  onSkip,
}: {
  onComplete: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number | null, eventTime?: string | null, dateFlexible?: boolean, timeFlexible?: boolean, location?: string | null) => void;
  onSkip: () => void;
}) => {
  const [idea, setIdea] = useState("");
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [squadSize, setSquadSize] = useState(5);
  const [whenInput, setWhenInput] = useState("");
  const [whereInput, setWhereInput] = useState("");
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;
  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(" ");
  })();

  useEffect(() => {
    setTimeout(() => ideaRef.current?.focus(), 300);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
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
        onChange={(e) => setIdea(e.target.value.slice(0, 280))}
        maxLength={280}
        placeholder="e.g., park hang w me and @kat ^.^"
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
          height: 72,
          lineHeight: 1.5,
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />

      {/* When / Where inputs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <input
          type="text"
          placeholder="when? (e.g. tmr 7pm)"
          value={whenInput}
          onChange={(e) => setWhenInput(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            background: color.deep,
            border: `1px solid ${idea.trim() && !parsedDate ? '#ff6b6b44' : color.borderMid}`,
            borderRadius: 10,
            fontFamily: font.mono,
            fontSize: 11,
            color: color.text,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <input
          type="text"
          placeholder="where?"
          value={whereInput}
          onChange={(e) => setWhereInput(e.target.value)}
          style={{
            flex: 0.6,
            minWidth: 0,
            padding: "10px 12px",
            background: color.deep,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 10,
            fontFamily: font.mono,
            fontSize: 11,
            color: color.text,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      {whenPreview && (
        <div style={{
          fontFamily: font.mono,
          fontSize: 10,
          color: color.dim,
          marginBottom: 8,
          paddingLeft: 2,
        }}>
          {whenPreview}
        </div>
      )}
      {!whenPreview && idea.trim() && !parsedDate && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: '#ff6b6b',
            marginBottom: 8,
            paddingLeft: 2,
          }}
        >
          add a date (e.g. &quot;fri&quot;, &quot;3/14&quot;, &quot;next sat&quot;)
        </div>
      )}
      {!whenPreview && (!idea.trim() || parsedDate) && <div style={{ marginBottom: 8 }} />}

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
            const eventDate = parsedDate?.iso ?? null;
            const eventTime = parsedTime ?? null;
            const location = whereInput.trim() || null;
            const title = sanitize(idea, 280);
            onComplete(title, checkTimer, eventDate, squadSize === 0 ? null : squadSize, eventTime, true, true, location);
          }
        }}
        disabled={!idea.trim() || !parsedDate}
        style={{
          width: "100%",
          padding: "16px",
          background: idea.trim() && parsedDate ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: idea.trim() && parsedDate ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: idea.trim() && parsedDate ? "pointer" : "default",
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
