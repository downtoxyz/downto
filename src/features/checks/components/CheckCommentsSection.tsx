"use client";

import React, { useState, useRef } from "react";
import { font, color } from "@/lib/styles";
import { formatTimeAgo } from "@/lib/utils";
import type { CommentUI } from "@/features/checks/hooks/useCheckComments";

export default function CheckCommentsSection({
  comments,
  userId,
  friends,
  onPost,
}: {
  comments: CommentUI[];
  userId: string | null;
  friends?: { id: string; name: string; avatar: string }[];
  onPost: (text: string, mentions?: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const mentionCandidates = (() => {
    const map = new Map<string, { id: string; name: string; avatar: string }>();
    for (const f of (friends ?? [])) map.set(f.id, { id: f.id, name: f.name, avatar: f.avatar });
    for (const c of comments.filter((c) => c.userId !== userId && !c.isYours)) {
      if (!map.has(c.userId)) map.set(c.userId, { id: c.userId, name: c.userName, avatar: c.userAvatar });
    }
    return Array.from(map.values());
  })();

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const mentionedNames = [...trimmed.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = mentionCandidates
      .filter((c) => mentionedNames.some((n) =>
        c.name.toLowerCase() === n || c.name.split(' ')[0].toLowerCase() === n
      ))
      .map((c) => c.id);
    onPost(trimmed, mentionedIds.length > 0 ? mentionedIds : undefined);
    setText("");
    setMentionQuery(null);
    setMentionIdx(-1);
  };

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${color.border}`, paddingTop: 10 }}>
      {comments.length === 0 ? (
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>no comments yet</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: c.isYours ? color.accent : color.borderLight,
                  color: c.isYours ? "#000" : color.dim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: font.mono, fontSize: 9, fontWeight: 700,
                }}
              >
                {c.userAvatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.isYours ? color.accent : color.muted, fontWeight: 600 }}>
                    {c.userName}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: color.faint }}>
                    {formatTimeAgo(new Date(c.createdAt))}
                  </span>
                </div>
                <p style={{ fontFamily: font.mono, fontSize: 11, color: color.text, margin: 0, lineHeight: 1.4 }}>
                  {c.text.split(/(@\S+)/g).map((part, pi) =>
                    part.startsWith("@") ? (
                      <span key={pi} style={{ color: color.accent, fontWeight: 700 }}>{part}</span>
                    ) : part
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, minWidth: 0 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const val = e.target.value.slice(0, 280);
            setText(val);
            const cursor = e.target.selectionStart ?? val.length;
            const before = val.slice(0, cursor);
            const atMatch = before.match(/@([^\s@]*)$/);
            if (atMatch) {
              setMentionQuery(atMatch[1].toLowerCase());
              setMentionIdx(before.length - atMatch[0].length);
            } else {
              setMentionQuery(null);
              setMentionIdx(-1);
            }
          }}
          onKeyDown={(e) => {
            if (mentionQuery !== null && e.key === "Escape") {
              setMentionQuery(null);
              setMentionIdx(-1);
              return;
            }
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Add a comment…"
          style={{
            flex: 1, minWidth: 0,
            background: color.deep, border: `1px solid ${color.border}`,
            borderRadius: 8, padding: "6px 10px",
            fontFamily: font.mono, fontSize: 11, color: color.text, outline: "none",
          }}
        />
        <button
          onClick={handleSubmit}
          style={{
            flexShrink: 0, background: color.accent, color: "#000",
            border: "none", borderRadius: 8, padding: "6px 12px",
            fontFamily: font.mono, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}
        >
          Post
        </button>
      </div>
      {mentionQuery !== null && mentionCandidates.length > 0 && (() => {
        const filtered = mentionCandidates.filter(c => c.name.toLowerCase().includes(mentionQuery));
        if (filtered.length === 0) return null;
        return (
          <div style={{
            background: color.deep, border: `1px solid ${color.borderMid}`,
            borderRadius: 8, marginTop: 4, maxHeight: 100, overflowY: "auto",
          }}>
            {filtered.slice(0, 5).map(c => (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  const before = text.slice(0, mentionIdx);
                  const after = text.slice(mentionIdx + 1 + (mentionQuery?.length ?? 0));
                  setText(before + "@" + c.name + " " + after);
                  setMentionQuery(null);
                  setMentionIdx(-1);
                  inputRef.current?.focus();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "6px 10px",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: color.borderLight, color: color.dim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: font.mono, fontSize: 8, fontWeight: 700,
                }}>
                  {c.avatar}
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.text }}>{c.name}</span>
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
