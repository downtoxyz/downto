"use client";

import { useRef, useEffect, useState, type CSSProperties, type RefObject } from "react";
import type { TextSpan } from "@/lib/utils";

interface HighlightedTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  spans: TextSpan[];
  placeholder?: string;
  maxLength?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  background?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  style?: CSSProperties;
}

/**
 * Textarea with inline highlighting using CSS background-image gradients.
 * Positions highlights using `ch` units on the textarea itself —
 * no overlay, no dual rendering, no alignment issues.
 */
const HighlightedTextarea = ({
  value,
  onChange,
  spans,
  placeholder,
  maxLength,
  textareaRef,
  background = "transparent",
  onKeyDown,
  style = {},
}: HighlightedTextareaProps) => {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const [charsPerLine, setCharsPerLine] = useState(999);

  const fontSize = style.fontSize ?? 13;
  const lineHeight = style.lineHeight ?? 1.5;
  const fontFamily = style.fontFamily ?? "monospace";
  const padding = style.padding ?? "14px 16px";

  // Measure how many chars fit per line (for word-wrap calculation)
  useEffect(() => {
    const measure = () => {
      const ta = ref.current;
      if (!ta) return;
      // Measure 1ch in pixels using a temporary element with same font
      const span = document.createElement("span");
      span.style.font = `${fontSize}px ${fontFamily}`;
      span.style.visibility = "hidden";
      span.style.position = "absolute";
      span.style.whiteSpace = "pre";
      span.textContent = "0";
      document.body.appendChild(span);
      const chPx = span.getBoundingClientRect().width;
      document.body.removeChild(span);
      if (chPx <= 0) return;

      const cs = getComputedStyle(ta);
      const contentW =
        ta.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      setCharsPerLine(Math.floor(contentW / chPx) || 999);
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(measure);
    } else {
      measure();
    }
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fontSize, fontFamily, ref]);

  // Build CSS background layers for highlights
  const bgImages: string[] = [];
  const bgSizes: string[] = [];
  const bgPositions: string[] = [];

  if (spans.length > 0) {
    const lines = getWrappedLines(value, charsPerLine);
    const lh = typeof lineHeight === "number" ? lineHeight : parseFloat(String(lineHeight));

    for (const span of spans) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (span.start >= line.end || span.end <= line.start) continue;
        const hStart = Math.max(span.start, line.start);
        const hEnd = Math.min(span.end, line.end);
        const col = hStart - line.start;
        const count = hEnd - hStart;

        bgImages.push(
          "linear-gradient(rgba(232,255,90,0.25),rgba(232,255,90,0.25))"
        );
        bgSizes.push(`${count}ch ${lh}em`);
        bgPositions.push(`${col}ch ${li * lh}em`);
      }
    }
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
      placeholder={placeholder}
      style={{
        width: style.width ?? "100%",
        height: style.height ?? 100,
        fontFamily,
        fontSize,
        lineHeight,
        padding,
        letterSpacing: "normal",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        overflowWrap: "break-word",
        boxSizing: "border-box",
        border: style.border ?? "none",
        borderRadius: style.borderRadius ?? 12,
        color: style.color ?? "#fff",
        backgroundColor: background,
        backgroundImage: bgImages.length > 0 ? bgImages.join(", ") : "none",
        backgroundSize: bgSizes.join(", ") || "auto",
        backgroundPosition: bgPositions.join(", ") || "0 0",
        backgroundRepeat: "no-repeat",
        backgroundOrigin: "content-box",
        outline: "none",
        resize: "none",
        margin: 0,
        WebkitAppearance: "none",
      }}
    />
  );
};

/** Compute wrapped line ranges for pre-wrap word-wrapping */
function getWrappedLines(
  text: string,
  charsPerLine: number
): { start: number; end: number }[] {
  if (!text) return [{ start: 0, end: 0 }];
  const lines: { start: number; end: number }[] = [];
  let i = 0;

  while (i < text.length) {
    const nlIdx = text.indexOf("\n", i);
    const lineText = nlIdx >= 0 ? text.slice(i, nlIdx) : text.slice(i);

    if (lineText.length <= charsPerLine) {
      const end = nlIdx >= 0 ? nlIdx + 1 : text.length;
      lines.push({ start: i, end });
      i = end;
    } else {
      let breakAt = -1;
      for (let j = i + charsPerLine; j > i; j--) {
        if (text[j] === " ") {
          breakAt = j;
          break;
        }
      }
      if (breakAt <= i) {
        breakAt = i + charsPerLine;
      }
      lines.push({ start: i, end: breakAt });
      i = text[breakAt] === " " ? breakAt + 1 : breakAt;
    }
  }

  if (lines.length === 0) lines.push({ start: 0, end: 0 });
  return lines;
}

export default HighlightedTextarea;
