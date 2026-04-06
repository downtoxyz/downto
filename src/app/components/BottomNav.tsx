"use client";

import { useRef, useEffect, useState } from "react";
import { color } from "@/lib/styles";
import type { Tab } from "@/lib/ui-types";
import { TABS } from "@/lib/ui-types";

const tabIcons: Record<Tab, string> = { feed: "⚡", squads: "👥", profile: "⚙" };
const tabLabels: Record<Tab, string> = { feed: "Feed", squads: "Squads", profile: "You" };

const BottomNav = ({
  tab,
  onTabChange,
  hasSquadsUnread,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  hasSquadsUnread: boolean;
}) => {
  const prevTab = useRef(tab);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    if (prevTab.current === tab) return;
    const from = TABS.indexOf(prevTab.current);
    const to = TABS.indexOf(tab);
    prevTab.current = tab;

    const el = highlightRef.current;
    if (!el) return;

    // Stretch phase: animate to cover both old and new position
    const min = Math.min(from, to);
    const max = Math.max(from, to);

    setSettled(false);
    const cell = (i: number) => `calc(${i} * (100% - 8px) / 3 + 4px)`;
    const cellW = "calc((100% - 8px) / 3)";
    const cellWExpanded = "calc((100% - 8px) / 3 + 20px)";

    // Start from current position
    el.style.transition = "none";
    el.style.left = cell(from);
    el.style.width = cellW;
    void el.offsetWidth;

    // Slide + expand (shift left by 10px to stay centered during stretch)
    el.style.transition = "left 0.15s ease-out, width 0.15s ease-out";
    el.style.left = `calc(${to} * (100% - 8px) / 3 + 4px - 10px)`;
    el.style.width = cellWExpanded;

    // Settle: shrink back to normal at final position
    let innerTimer: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      el.style.transition = "left 0.12s ease-out, width 0.12s ease-out";
      el.style.left = cell(to);
      el.style.width = cellW;
      innerTimer = setTimeout(() => setSettled(true), 120);
    }, 100);

    return () => { clearTimeout(timer); clearTimeout(innerTimer); };
  }, [tab]);

  const idx = TABS.indexOf(tab);

  return (
    <div className="shrink-0 px-4 pb-3 bg-bg">
      <div
        className="flex bg-card rounded-[14px] p-1 border border-border relative items-stretch"
        style={{ height: 48 }}
      >
        {/* Sliding highlight */}
        <div
          ref={highlightRef}
          className="absolute top-1 bottom-1 bg-border-light rounded-xl opacity-30"
          style={{
            left: `calc(${idx} * (100% - 8px) / 3 + 4px)`,
            width: "calc((100% - 8px) / 3)",
            ...(settled ? { transition: "none" } : {}),
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className="flex-1 bg-none border-none cursor-pointer py-1 relative z-[1] flex flex-col items-center justify-center gap-0"
          >
            <span className="text-xs leading-none">
              {tabIcons[t]}
            </span>
            <span
              className="font-mono leading-none mt-[3px] uppercase"
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                color: tab === t ? color.accent : color.faint,
                fontWeight: tab === t ? 700 : 400,
              }}
            >
              {tabLabels[t]}
            </span>
            {t === "squads" && hasSquadsUnread && (
              <div
                data-testid="squads-unread-dot"
                className="absolute top-1 right-2 w-[7px] h-[7px] rounded-full bg-[#ff3b30]"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
