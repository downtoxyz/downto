"use client";

import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import { logError } from "@/lib/logger";
import type { Event, InterestCheck } from "@/lib/ui-types";
import TonightEmptyState from "./TonightEmptyState";

function TonightChecks({
  tonightChecks,
  myCheckResponses,
  onNavigateToGroups,
}: {
  tonightChecks: InterestCheck[];
  myCheckResponses: Record<string, "down" | "waitlist">;
  onNavigateToGroups: (squadId?: string) => void;
}) {
  if (tonightChecks.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 12,
          padding: "0 4px",
        }}
      >
        Your plans
      </div>
      {tonightChecks.map((check) => {
        const myResponse = myCheckResponses[check.id];
        return (
          <div
            key={check.id}
            style={{
              background: check.isYours ? "rgba(232,255,90,0.05)" : color.card,
              borderRadius: 14,
              padding: 14,
              marginBottom: 8,
              border: `1px solid ${check.isYours ? "rgba(232,255,90,0.2)" : color.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: check.isYours ? color.accent : color.borderLight,
                  color: check.isYours ? "#000" : color.dim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {check.author[0]}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: check.isYours ? color.accent : color.muted }}>
                {check.author}
              </span>
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 18,
                color: color.text,
                lineHeight: 1.3,
                marginBottom: 8,
              }}
            >
              {check.text}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
                {check.eventTime ?? "tonight"}
                {check.responses.length > 0 && ` · ${check.responses.length} ${check.responses.length === 1 ? "response" : "responses"}`}
              </div>
              {myResponse && (
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: myResponse === "down" ? color.accent : color.muted,
                  }}
                >
                  {myResponse === "down" ? "✓ Down" : "✓ Waitlisted"}
                </div>
              )}
            </div>
            {check.squadId && (
              <button
                onClick={() => onNavigateToGroups(check.squadId)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "6px 12px",
                  fontFamily: font.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: color.accent,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Open Squad →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TonightEvents({
  tonightEvents,
  tonightChecks,
  setTonightEvents,
  setEvents,
  isDemoMode,
  showToast,
}: {
  tonightEvents: Event[];
  tonightChecks: InterestCheck[];
  setTonightEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  isDemoMode: boolean;
  showToast: (msg: string) => void;
}) {
  return (
    <>
      <div style={{ padding: "0 4px", marginBottom: 20 }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: color.dim,
            marginBottom: 4,
          }}
        >
          Out tonight
        </div>
        <p style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, lineHeight: 1.6 }}>
          public events happening tonight in Brooklyn
        </p>
      </div>

      {tonightEvents.length === 0 && tonightChecks.length === 0 && <TonightEmptyState />}

      {tonightEvents.map((e) => (
        <div
          key={e.id}
          style={{
            background: color.card,
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 12,
            border: `1px solid ${color.border}`,
          }}
        >
          <div style={{ display: "flex", gap: 14, padding: 14 }}>
            {e.image ? (
              <img
                src={e.image}
                alt=""
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", filter: "brightness(0.8)" }}
              />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 12, background: color.card }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font.serif, fontSize: 17, color: color.text, marginBottom: 4, fontWeight: 400, lineHeight: 1.2 }}>
                {e.title}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, marginBottom: 2 }}>
                {e.time}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                {e.venue} · {e.neighborhood}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderTop: `1px solid ${color.border}`,
              background: color.deep,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex" }}>
                {e.peopleDown.slice(0, 3).map((p, i) => (
                  <div
                    key={p.name}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: color.borderLight,
                      color: color.dim,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: font.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      marginLeft: i > 0 ? -6 : 0,
                      border: `2px solid ${color.deep}`,
                    }}
                  >
                    {p.avatar}
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                {e.peopleDown.length} going
              </span>
            </div>
            <button
              onClick={async () => {
                const newSaved = !e.saved;
                setTonightEvents((prev) =>
                  prev.map((ev) => (ev.id === e.id ? { ...ev, saved: newSaved } : ev))
                );
                showToast(newSaved ? "Saved to your calendar ✓" : "Removed");

                if (!isDemoMode) {
                  try {
                    if (newSaved) {
                      await db.saveEvent(e.id);
                      await db.toggleDown(e.id, true);
                      const savedEvent: Event = { ...e, saved: true, isDown: true };
                      setEvents((prev) => {
                        if (prev.some((ev) => ev.id === e.id)) return prev;
                        return [savedEvent, ...prev];
                      });
                    } else {
                      await db.unsaveEvent(e.id);
                      setEvents((prev) => prev.filter((ev) => ev.id !== e.id));
                    }
                  } catch (err: unknown) {
                    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
                    if (code !== "23505") {
                      logError("saveTonightEvent", err, { eventId: e.id });
                      showToast("Failed to save — try again");
                    }
                  }
                }
              }}
              style={{
                background: e.saved ? color.accent : "transparent",
                color: e.saved ? "#000" : color.accent,
                border: e.saved ? "none" : `1px solid ${color.accent}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontFamily: font.mono,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {e.saved ? "✓ Saved" : "Save"}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export interface TonightViewProps {
  tonightChecks: InterestCheck[];
  tonightEvents: Event[];
  setTonightEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  myCheckResponses: Record<string, "down" | "waitlist">;
  isDemoMode: boolean;
  onNavigateToGroups: (squadId?: string) => void;
  showToast: (msg: string) => void;
}

export default function TonightView({
  tonightChecks,
  tonightEvents,
  setTonightEvents,
  setEvents,
  myCheckResponses,
  isDemoMode,
  onNavigateToGroups,
  showToast,
}: TonightViewProps) {
  return (
    <>
      <TonightChecks
        tonightChecks={tonightChecks}
        myCheckResponses={myCheckResponses}
        onNavigateToGroups={onNavigateToGroups}
      />
      <TonightEvents
        tonightEvents={tonightEvents}
        tonightChecks={tonightChecks}
        setTonightEvents={setTonightEvents}
        setEvents={setEvents}
        isDemoMode={isDemoMode}
        showToast={showToast}
      />
    </>
  );
}
