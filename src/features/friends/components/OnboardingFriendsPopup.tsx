"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Friend } from "@/lib/ui-types";

export default function OnboardingFriendsPopup({
  suggestions,
  checkAuthorId,
  onAddFriend,
  onSearchUsers,
  onDone,
}: {
  suggestions: Friend[];
  checkAuthorId: string | null;
  onAddFriend: (id: string) => void;
  onSearchUsers?: (query: string) => Promise<Friend[]>;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onSearchUsers || search.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await onSearchUsers(search);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, onSearchUsers]);

  const available = suggestions.filter((s) => s.status === "none" || s.status === "pending");
  const hasAdded = suggestions.some((s) => s.status === "pending") || searchResults.some((s) => s.status === "pending");
  const checkAuthor = checkAuthorId ? suggestions.find((s) => s.id === checkAuthorId) : null;
  const others = available.filter((s) => s.id !== checkAuthorId);
  const isSearching = search.length >= 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        padding: 20,
      }}
    >
      <div
        style={{
          background: color.deep,
          border: `1px solid ${color.border}`,
          borderRadius: 16,
          padding: "24px 20px",
          maxWidth: 360,
          width: "100%",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{
          fontFamily: font.serif,
          fontSize: 22,
          color: color.text,
          fontWeight: 400,
          margin: "0 0 4px",
          textAlign: "center",
        }}>
          add friends
        </h2>
        <p style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.dim,
          textAlign: "center",
          margin: "0 0 20px",
        }}>
          add at least one to get started
        </p>

        {/* Search input */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or username..."
          style={{
            width: "100%",
            background: color.card,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 10,
            padding: "10px 12px",
            color: color.text,
            fontFamily: font.mono,
            fontSize: 12,
            outline: "none",
            marginBottom: 16,
            boxSizing: "border-box",
          }}
        />

        {/* Search results */}
        {isSearching && (
          <>
            {searching && (
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, textAlign: "center", padding: "8px 0" }}>
                searching...
              </p>
            )}
            {!searching && searchResults.length === 0 && search.length >= 2 && (
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, textAlign: "center", padding: "8px 0" }}>
                no results
              </p>
            )}
            {searchResults.filter((r) => r.id !== checkAuthorId).map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: color.borderLight, color: color.dim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: font.mono, fontSize: 14, fontWeight: 700, marginRight: 12,
                }}>
                  {f.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>{f.name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>@{f.username}</div>
                </div>
                <button
                  onClick={() => f.status === "none" && onAddFriend(f.id)}
                  disabled={f.status !== "none"}
                  style={{
                    background: f.status === "none" ? color.accent : "transparent",
                    color: f.status === "none" ? "#000" : color.dim,
                    border: f.status !== "none" ? `1px solid ${color.borderMid}` : "none",
                    borderRadius: 8, padding: "8px 14px",
                    fontFamily: font.mono, fontSize: 11, fontWeight: 700,
                    cursor: f.status === "none" ? "pointer" : "default", flexShrink: 0,
                  }}
                >
                  {f.status === "pending" ? "Requested" : f.status === "friend" ? "Friends" : "Add"}
                </button>
              </div>
            ))}
          </>
        )}

        {!isSearching && (
          <>
        {/* Check author — highlighted */}
        {checkAuthor && checkAuthor.status !== "pending" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              background: "rgba(232,255,90,0.08)",
              border: `1px solid rgba(232,255,90,0.2)`,
              borderRadius: 12,
              padding: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: color.accent,
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 18,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {checkAuthor.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.mono, fontSize: 13, color: color.accent, fontWeight: 700 }}>
                  {checkAuthor.name}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginTop: 2 }}>
                  sent you this check — tap Add to connect
                </div>
              </div>
              <button
                onClick={() => onAddFriend(checkAuthor.id)}
                style={{
                  background: color.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
        {/* Check author — already added */}
        {checkAuthor && checkAuthor.status === "pending" && (
          <div style={{
            background: "rgba(232,255,90,0.05)",
            border: `1px solid rgba(232,255,90,0.1)`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: color.borderLight,
              color: color.dim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {checkAuthor.avatar}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>
                {checkAuthor.name}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginTop: 2 }}>
                request sent!
              </div>
            </div>
            <span style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 8,
              padding: "8px 14px",
            }}>
              Requested
            </span>
          </div>
        )}

        {/* Other suggestions */}
        {others.length > 0 && (
          <>
            {checkAuthor && (
              <div style={{
                fontFamily: font.mono,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: color.dim,
                marginBottom: 10,
              }}>
                People you may know
              </div>
            )}
            {others.slice(0, 6).map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: color.borderLight,
                  color: color.dim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: font.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  marginRight: 12,
                }}>
                  {f.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>{f.name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>@{f.username}</div>
                </div>
                <button
                  onClick={() => f.status === "none" && onAddFriend(f.id)}
                  disabled={f.status === "pending"}
                  style={{
                    background: f.status === "pending" ? "transparent" : color.accent,
                    color: f.status === "pending" ? color.dim : "#000",
                    border: f.status === "pending" ? `1px solid ${color.borderMid}` : "none",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontFamily: font.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: f.status === "pending" ? "default" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  {f.status === "pending" ? "Requested" : "Add"}
                </button>
              </div>
            ))}
          </>
        )}
          </>
        )}

        {/* Continue button */}
        <button
          onClick={onDone}
          disabled={!hasAdded}
          style={{
            width: "100%",
            marginTop: 20,
            background: hasAdded ? color.accent : color.borderMid,
            color: hasAdded ? "#000" : color.dim,
            border: "none",
            borderRadius: 12,
            padding: 14,
            fontFamily: font.mono,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: hasAdded ? "pointer" : "default",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
