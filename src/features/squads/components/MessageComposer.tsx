"use client";

import React, { useState, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";

interface MessageComposerProps {
  members: Squad['members'];
  activePoll: { status: string } | null;
  onSend: (text: string, mentionUserIds: string[]) => Promise<void>;
  onOpenPollCreator?: () => void;
}

export default function MessageComposer({
  members,
  activePoll,
  onSend,
  onOpenPollCreator,
}: MessageComposerProps) {
  const [newMsg, setNewMsg] = useState("");
  const [chatMentionQuery, setChatMentionQuery] = useState<string | null>(null);
  const [chatMentionIdx, setChatMentionIdx] = useState(-1);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);

  const otherMembers = members.filter((m) => m.name !== "You");

  const handleSend = async () => {
    const text = newMsg.trim();
    if (!text) return;

    const mentionedNames = [...text.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = otherMembers
      .filter((m) => mentionedNames.some((n) =>
        m.name.toLowerCase() === n || m.name.split(' ')[0].toLowerCase() === n
      ))
      .map((m) => m.userId)
      .filter((id): id is string => !!id);

    setNewMsg("");
    setChatMentionQuery(null);
    setChatMentionIdx(-1);
    if (msgInputRef.current) msgInputRef.current.style.height = "auto";

    await onSend(text, mentionedIds);
  };

  return (
    <>
      {/* @mention autocomplete */}
      {chatMentionQuery !== null && otherMembers.length > 0 && (() => {
        const filtered = otherMembers.filter((m) =>
          m.name.toLowerCase().includes(chatMentionQuery)
        );
        if (filtered.length === 0) return null;
        return (
          <div style={{ padding: "4px 20px", background: color.surface }}>
            <div style={{
              background: color.deep, border: `1px solid ${color.borderMid}`,
              borderRadius: 10, maxHeight: 120, overflowY: "auto",
            }}>
              {filtered.slice(0, 6).map((m) => (
                <button
                  key={m.userId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const before = newMsg.slice(0, chatMentionIdx);
                    const after = newMsg.slice(chatMentionIdx + 1 + (chatMentionQuery?.length ?? 0));
                    setNewMsg(before + "@" + m.name + " " + after);
                    setChatMentionQuery(null);
                    setChatMentionIdx(-1);
                    msgInputRef.current?.focus();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "8px 12px",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: `1px solid ${color.border}`,
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: color.borderLight, color: color.dim,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                  }}>
                    {m.avatar}
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {/* Input row */}
      <div
        style={{
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        {(!activePoll || activePoll.status === 'closed') && onOpenPollCreator && (
          <button
            onClick={onOpenPollCreator}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: 20, opacity: 0.6, cursor: 'pointer', lineHeight: 1, marginBottom: 8,
            }}
          >
            📊
          </button>
        )}
        <textarea
          ref={msgInputRef}
          value={newMsg}
          onChange={(e) => {
            const val = e.target.value;
            setNewMsg(val);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            const cursor = e.target.selectionStart ?? val.length;
            const before = val.slice(0, cursor);
            const atMatch = before.match(/@([^\s@]*)$/);
            if (atMatch) {
              setChatMentionQuery(atMatch[1].toLowerCase());
              setChatMentionIdx(before.length - atMatch[0].length);
            } else {
              setChatMentionQuery(null);
              setChatMentionIdx(-1);
            }
          }}
          onKeyDown={(e) => {
            if (chatMentionQuery !== null && e.key === "Escape") {
              setChatMentionQuery(null);
              setChatMentionIdx(-1);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          enterKeyHint="send"
          placeholder="Message..."
          rows={1}
          style={{
            flex: 1,
            background: color.card,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 20,
            padding: "10px 16px",
            color: color.text,
            fontFamily: font.mono,
            fontSize: 16,
            outline: "none",
            resize: "none",
            maxHeight: 120,
            lineHeight: 1.4,
            overflowY: "auto",
          }}
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={!newMsg.trim()}
          style={{
            background: newMsg.trim() ? color.accent : color.borderMid,
            color: newMsg.trim() ? "#000" : color.dim,
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            cursor: newMsg.trim() ? "pointer" : "default",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          ↑
        </button>
      </div>
    </>
  );
}
