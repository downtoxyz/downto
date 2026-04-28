"use client";

import React, { useState, useRef, useEffect } from "react";
import { color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";
import { resizeImageForChat } from "@/lib/imageResize";
import { logError } from "@/lib/logger";

interface PendingImage {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

interface MessageComposerProps {
  members: Squad['members'];
  onSend: (
    text: string,
    mentionUserIds: string[],
    image?: { blob: Blob; width: number; height: number }
  ) => Promise<void>;
  onOpenPollCreator?: () => void;
  /** Pass true while the squad's mystery check is pre-reveal. Disables image
   *  attach (photos are an obvious identity leak) and the poll creator
   *  (poll proposers leak too). Re-enables automatically post-reveal. */
  mysteryRestricted?: boolean;
}

export default function MessageComposer({
  members,
  onSend,
  onOpenPollCreator,
  mysteryRestricted = false,
}: MessageComposerProps) {
  const [newMsg, setNewMsg] = useState("");
  const [chatMentionQuery, setChatMentionQuery] = useState<string | null>(null);
  const [chatMentionIdx, setChatMentionIdx] = useState(-1);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const otherMembers = members.filter((m) => m.name !== "You");

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  const clearPendingImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePickImage = async (file: File) => {
    setPreparingImage(true);
    try {
      const { blob, width, height } = await resizeImageForChat(file);
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage({ blob, width, height, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      logError("resizeImage", err);
      alert("Couldn't prepare that image. Try a different one?");
    } finally {
      setPreparingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSend = (newMsg.trim().length > 0 || !!pendingImage) && !sending && !preparingImage;

  const handleSend = async () => {
    if (!canSend) return;
    const text = newMsg.trim();

    const mentionedNames = [...text.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = otherMembers
      .filter((m) => mentionedNames.some((n) =>
        m.name.toLowerCase() === n || m.name.split(' ')[0].toLowerCase() === n
      ))
      .map((m) => m.userId)
      .filter((id): id is string => !!id);

    const imagePayload = pendingImage
      ? { blob: pendingImage.blob, width: pendingImage.width, height: pendingImage.height }
      : undefined;

    setNewMsg("");
    setChatMentionQuery(null);
    setChatMentionIdx(-1);
    if (msgInputRef.current) msgInputRef.current.style.height = "auto";
    // Clear preview state but keep the blob reference we captured above
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setSending(true);
    try {
      await onSend(text, mentionedIds, imagePayload);
    } finally {
      setSending(false);
    }
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
      {/* Image preview */}
      {pendingImage && (
        <div className="px-5 pt-2 bg-surface">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.previewUrl}
              alt="attachment preview"
              className="rounded-lg object-cover"
              style={{ width: 88, height: 88 }}
            />
            <button
              onClick={clearPendingImage}
              aria-label="Remove image"
              className="absolute -top-1.5 -right-1.5 bg-black/80 border border-border-mid text-white rounded-full w-5 h-5 flex items-center justify-center font-mono cursor-pointer"
              style={{ fontSize: 11, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Input row */}
      <div
        className="flex gap-2 items-end"
        style={{ padding: "12px 20px" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePickImage(file);
          }}
        />
        {!mysteryRestricted && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={preparingImage}
          aria-label="Attach image"
          className="bg-none border-none p-0 opacity-60 cursor-pointer leading-none mb-2"
        >
          <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z"/></svg>
        </button>
        )}
        {onOpenPollCreator && !mysteryRestricted && (
          <button
            onClick={onOpenPollCreator}
            className="bg-none border-none p-0 text-xl opacity-60 cursor-pointer leading-none mb-2"
          >
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,1,0-16H224a8,8,0,0,1,0,16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z"/></svg>
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
          placeholder={pendingImage ? "Add a caption..." : "Message..."}
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
          disabled={!canSend}
          className="border-none rounded-full w-10 h-10 font-bold text-base"
          style={{
            background: canSend ? color.accent : color.borderMid,
            color: canSend ? "var(--color-on-accent)" : color.dim,
            cursor: canSend ? "pointer" : "default",
          }}
        >
          {preparingImage || sending ? "…" : "↑"}
        </button>
      </div>
    </>
  );
}
