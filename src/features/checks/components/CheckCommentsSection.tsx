"use client";

import React, { useState, useRef } from "react";
import type { CommentUI } from "@/features/checks/hooks/useCheckComments";

export default function CheckCommentsSection({
  comments,
  userId,
  friends,
  onPost,
  onCollapse,
}: {
  comments: CommentUI[];
  userId: string | null;
  friends?: { id: string; name: string; avatar: string }[];
  onPost: (text: string, mentions?: string[]) => void;
  onCollapse?: () => void;
}) {
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showInput, setShowInput] = useState(false);
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
    <div>
      <div className="bg-card border border-[#CDC999] rounded-2xl px-3 py-2.5 mb-2 flex flex-col gap-1.5 cursor-pointer" onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("button") || t.closest("a") || t.closest("input")) return; if (onCollapse) onCollapse(); else setShowInput(true); }}>
      {comments.length === 0 ? (
        <span className="font-mono text-tiny text-dim py-0.5">no comments yet</span>
      ) : (
        <>
          {(showAll ? comments : comments.slice(-3)).map((c) => (
            <div key={c.id} className="flex items-center gap-2 min-w-0">
              <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-mono text-[9px] font-bold ${c.isYours ? "bg-dt text-on-accent" : "bg-border-light text-dim"}`}>
                {c.userAvatar}
              </div>
              <span className="font-mono text-tiny text-muted shrink-0 leading-snug">
                {c.userName}
              </span>
              <span className="font-mono text-tiny text-primary min-w-0 break-words leading-snug">
                {c.text.split(/(@\S+)/g).map((part, pi) =>
                  part.startsWith("@") ? (
                    <span key={pi} className="text-dt font-bold">{part}</span>
                  ) : part
                )}
              </span>
            </div>
          ))}
          {!showAll && comments.length > 3 && (
            <button
              onClick={() => setShowAll(true)}
              className="font-mono text-tiny text-dim cursor-pointer bg-transparent border-none p-0 mt-0.5"
            >
              + {comments.length - 3} more
            </button>
          )}
        </>
      )}
      {showInput && <div className="flex gap-2 items-center mt-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
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
          className="flex-1 min-w-0 bg-surface border border-border rounded-lg py-1.5 px-2.5 font-mono text-xs text-primary outline-none"
        />
        <button
          onClick={handleSubmit}
          className="shrink-0 bg-dt text-on-accent rounded-lg py-1.5 px-3 font-mono text-xs font-bold cursor-pointer"
        >
          Post
        </button>
      </div>}
      {showInput && mentionQuery !== null && mentionCandidates.length > 0 && (() => {
        const filtered = mentionCandidates.filter(c => c.name.toLowerCase().includes(mentionQuery));
        if (filtered.length === 0) return null;
        return (
          <div className="bg-surface border border-border-mid rounded-lg mt-1 max-h-25 overflow-y-auto">
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
                className="flex items-center gap-1.5 w-full py-1.5 px-2.5 bg-transparent cursor-pointer border-b border-border"
              >
                <div className="size-5 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-tiny font-bold">
                  {c.avatar}
                </div>
                <span className="font-mono text-xs text-primary">{c.name}</span>
              </button>
            ))}
          </div>
        );
      })()}
      </div>
    </div>
  );
}
