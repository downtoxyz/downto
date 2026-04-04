"use client";

import React, { useState, useRef } from "react";
import { color } from "@/lib/styles";
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
          <div className="px-5 bg-surface">
            <div className="bg-deep border border-border-mid rounded-lg max-h-[120px] overflow-y-auto">
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
                  className="flex items-center gap-2 w-full px-3 py-2 bg-transparent border-none cursor-pointer border-b border-border"
                >
                  <div className="w-6 h-6 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-tiny font-bold">
                    {m.avatar}
                  </div>
                  <span className="font-mono text-xs text-primary">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {/* Input row */}
      <div
        className="flex gap-2 items-end"
        style={{ padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        {(!activePoll || activePoll.status === 'closed') && onOpenPollCreator && (
          <button
            onClick={onOpenPollCreator}
            className="bg-none border-none p-0 text-xl opacity-60 cursor-pointer leading-none mb-2"
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
          className="flex-1 bg-card border border-border-mid rounded-[20px] text-primary font-mono outline-none resize-none max-h-[120px] overflow-y-auto"
          style={{
            padding: "10px 16px",
            fontSize: 16,
            lineHeight: 1.4,
          }}
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={!newMsg.trim()}
          className="border-none rounded-full w-10 h-10 font-bold text-base"
          style={{
            background: newMsg.trim() ? color.accent : color.borderMid,
            color: newMsg.trim() ? "#000" : color.dim,
            cursor: newMsg.trim() ? "pointer" : "default",
          }}
        >
          ↑
        </button>
      </div>
    </>
  );
}
