"use client";

import { useRef, useEffect, useState } from "react";
import { color } from "@/lib/styles";
import type { Tab } from "@/lib/ui-types";
import { TABS } from "@/lib/ui-types";

const TabIcon = ({ tab, fill, active }: { tab: Tab; fill: string; active: boolean }) => {
  const s = { width: 18, height: 18, viewBox: "0 0 256 256", fill };
  const st = { stroke: "#FE44FF", strokeWidth: 8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const stInactive = { stroke: "#FE44FF", strokeWidth: 8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (tab) {
    case "feed":
      return active
        ? <svg {...s}><path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17Z" {...st}/></svg>
        : <svg {...s} fill="none"><path d="M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,13Z" {...stInactive}/></svg>;
    case "squads":
      return active
        ? <svg {...s}><path d="M128,24A104,104,0,0,0,36.18,176.68L24.83,210.93a16,16,0,0,0,20.24,20.24l34.25-11.35A104,104,0,1,0,128,24Z" {...st}/></svg>
        : <svg {...s} fill="none"><path d="M128,24A104,104,0,0,0,36.18,176.68L24.83,210.93a16,16,0,0,0,20.24,20.24l34.25-11.35A104,104,0,1,0,128,24Z" fill="none" {...stInactive}/></svg>;
    case "profile":
      return active
        ? <svg {...s}><path d="M237.94,107.21a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128.27,42.91,98.48,25a8,8,0,0,0-6.46-.59A112.1,112.1,0,0,0,55.31,45.13a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59l29.82-17.07,29.79,17a8,8,0,0,0,6.46.59A112.1,112.1,0,0,0,200.69,211a8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" {...st}/></svg>
        : <svg {...s} fill="none"><path d="M237.94,107.21a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128.27,42.91,98.48,25a8,8,0,0,0-6.46-.59A112.1,112.1,0,0,0,55.31,45.13a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59l29.82-17.07,29.79,17a8,8,0,0,0,6.46.59A112.1,112.1,0,0,0,200.69,211a8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" fill="none" {...stInactive}/><circle cx="128" cy="128" r="40" fill="none" {...stInactive}/></svg>;
  }
};

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
    const cell = (i: number) => `calc(${i} * (100% - 8px) / 3 + 4px + 16px)`;
    const cellW = "calc((100% - 8px) / 3 - 32px)";
    const cellWExpanded = "calc((100% - 8px) / 3 - 32px + 20px)";

    // Start from current position
    el.style.transition = "none";
    el.style.left = cell(from);
    el.style.width = cellW;
    void el.offsetWidth;

    // Slide + expand (shift left by 10px to stay centered during stretch)
    el.style.transition = "left 0.15s ease-out, width 0.15s ease-out";
    el.style.left = `calc(${to} * (100% - 8px) / 3 + 4px + 16px - 10px)`;
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
    <div className="fixed bottom-0 left-0 right-0 z-40 max-w-[420px] mx-auto px-4 pb-3">
      {/* Blur fade — heavy blur, minimal color tint */}
      <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{
        height: 110,
        backdropFilter: "blur(50px)",
        WebkitBackdropFilter: "blur(50px)",
        mask: "linear-gradient(to top, black 15%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.15) 75%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to top, black 15%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.15) 75%, transparent 100%)",
      }} />
      <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{
        height: 110,
        background: "linear-gradient(to top, rgba(252,255,226,0.15), transparent)",
      }} />
      <div
        className="flex bg-card rounded-[14px] p-1 relative items-stretch"
        style={{ height: 48, border: "1px solid #FE44FF" }}
      >
        {/* Sliding highlight */}
        <div
          ref={highlightRef}
          className="absolute top-1 bottom-1 bg-border-light rounded-xl opacity-30"
          style={{
            left: `calc(${idx} * (100% - 8px) / 3 + 4px + 16px)`,
            width: "calc((100% - 8px) / 3 - 32px)",
            ...(settled ? { transition: "none" } : {}),
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className="flex-1 bg-none border-none cursor-pointer py-1 relative z-[1] flex flex-col items-center justify-center gap-0"
          >
            <TabIcon tab={t} fill={tab === t ? "#ECFFA5" : color.faint} active={tab === t} />
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
