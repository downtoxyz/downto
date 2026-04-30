"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { sanitize } from "@/lib/utils";
import { parseWhen } from "@/lib/dateParse";
import Grain from "@/app/components/Grain";
import cn from "@/lib/tailwindMerge";

const FirstCheckScreen = ({
  onComplete,
  onSkip,
}: {
  onComplete: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number | null, eventTime?: string | null, dateFlexible?: boolean, timeFlexible?: boolean, location?: string | null, eventDateLabel?: string | null) => void;
  onSkip: () => void;
}) => {
  const [idea, setIdea] = useState("");
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [squadSize, setSquadSize] = useState(5);
  const [whenInput, setWhenInput] = useState("");
  const [whereInput, setWhereInput] = useState("");
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  // parseWhen returns every date the user implied — we keep the first since
  // the check schema is single-date for now. The user's full original input
  // becomes the preview label (covers "or" inputs naturally).
  //
  // Wrapped in a single useMemo (instead of three render-scoped consts +
  // an IIFE) so all four bindings live in one closure — Sentry caught a
  // "Can't find variable: parsedDate" TDZ-shaped ReferenceError on Mobile
  // Safari 26.5 (issue 7446164800), which the prior chained-const layout
  // somehow triggered through the minifier. One closure, one return shape,
  // no inter-binding TDZ to mis-order.
  const { parsed, parsedDate, parsedTime, whenPreview } = useMemo(() => {
    const parsedRes = whenInput ? parseWhen(whenInput) : null;
    const date = parsedRes?.dates[0] ?? null;
    const time = parsedRes?.time ?? null;
    let preview: string | null = null;
    if (date || time) {
      const parts: string[] = [];
      if (parsedRes?.label) parts.push(parsedRes.label);
      else if (time) parts.push(time);
      preview = parts.join(" ");
    }
    return { parsed: parsedRes, parsedDate: date, parsedTime: time, whenPreview: preview };
  }, [whenInput]);

  useEffect(() => {
    setTimeout(() => ideaRef.current?.focus(), 300);
  }, []);

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen bg-bg px-6 pt-[60px] pb-6 flex flex-col box-border overflow-hidden">
      <Grain />

      <h1 className="font-serif text-5xl text-primary font-normal mb-2 leading-tight">
        what are you down for?
      </h1>
      <p className="font-mono text-xs text-dim mb-10">
        throw out an idea — your friends & their friends will see it
      </p>

      {/* Idea textarea */}
      <textarea
        ref={ideaRef}
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, 280))}
        maxLength={280}
        placeholder="e.g., park hang w me and @kat ^.^"
        className="w-full bg-card border border-border-mid rounded-xl py-3.5 px-4 text-primary font-mono text-sm outline-none resize-none leading-relaxed mb-4 box-border"
        style={{ height: 72 }}
      />

      {/* When / Where inputs */}
      <div className="flex gap-2 mb-1">
        <input
          type="text"
          placeholder="when? (e.g. tmr 7pm)"
          value={whenInput}
          onChange={(e) => setWhenInput(e.target.value)}
          className={cn(
            "flex-1 min-w-0 py-2.5 px-3 bg-deep rounded-lg font-mono text-xs text-primary outline-none box-border border",
            whenInput.trim() && !parsedDate ? "border-danger/25" : "border-border-mid"
          )}
        />
        <input
          type="text"
          placeholder="where?"
          value={whereInput}
          onChange={(e) => setWhereInput(e.target.value)}
          className="min-w-0 py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
          style={{ flex: 0.6 }}
        />
      </div>
      {whenPreview && (
        <div className="font-mono text-tiny text-dim mb-2" style={{ paddingLeft: 2 }}>
          {whenPreview}
        </div>
      )}
      {!whenPreview && whenInput.trim() && !parsedDate && (
        <div className="font-mono text-tiny text-danger mb-2" style={{ paddingLeft: 2 }}>
          couldn&apos;t read that — try &quot;fri&quot;, &quot;3/14&quot;, &quot;next sat&quot;
        </div>
      )}
      {!whenPreview && !whenInput.trim() && <div className="mb-2" />}

      {/* Timer picker */}
      <div className="mb-4">
        <div className="font-mono text-tiny text-dim mb-2 uppercase" style={{ letterSpacing: "0.15em" }}>
          Expires in
        </div>
        <div className="flex gap-2">
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
              className={cn(
                "flex-1 py-2.5 rounded-lg font-mono text-xs cursor-pointer transition-all duration-150 border",
                checkTimer === opt.hours
                  ? "bg-dt text-on-accent border-dt font-bold"
                  : "bg-transparent text-muted border-border-mid font-normal"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Squad size picker */}
      <div className="mb-4">
        <div className="font-mono text-tiny text-dim mb-2 uppercase" style={{ letterSpacing: "0.15em" }}>
          Squad size
        </div>
        <div className="flex gap-2">
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
                className={cn(
                  "flex-1 py-2.5 rounded-lg font-mono text-xs cursor-pointer transition-all duration-150 border",
                  selected
                    ? "bg-dt text-on-accent border-dt font-bold"
                    : "bg-transparent text-muted border-border-mid font-normal"
                )}
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
            const eventDate = parsedDate;
            const eventTime = parsedTime;
            const location = whereInput.trim() || null;
            const title = sanitize(idea, 280);
            // Preserve typed phrase only when it implied multiple dates;
            // otherwise let the display fall back to the auto-formatted date.
            const typedDateLabel = (parsed?.dates.length ?? 0) > 1 ? whenInput.trim() : null;
            onComplete(title, checkTimer, eventDate, squadSize === 0 ? null : squadSize, eventTime, true, true, location, typedDateLabel);
          }
        }}
        disabled={!idea.trim()}
        className={cn(
          "w-full p-4 border-none rounded-xl font-mono text-sm font-bold mb-4",
          idea.trim()
            ? "bg-dt text-bg cursor-pointer"
            : "bg-border-mid text-dim cursor-default"
        )}
      >
        send it
      </button>

      {/* Skip link */}
      <button
        onClick={onSkip}
        className="bg-transparent border-none text-dim font-mono text-xs cursor-pointer self-center"
      >
        skip for now
      </button>
    </div>
  );
};

export default FirstCheckScreen;
