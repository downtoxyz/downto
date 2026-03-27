"use client";

import { useRef, useEffect, useState } from "react";
import { font, color } from "@/lib/styles";
import type { Tab } from "@/lib/ui-types";
import { TABS } from "@/lib/ui-types";

const tabIcons: Record<Tab, string> = { feed: "⚡", calendar: "📅", groups: "👥", profile: "⚙" };
const tabLabels: Record<Tab, string> = { feed: "Feed", calendar: "Cal", groups: "Squads", profile: "You" };

const BottomNav = ({
  tab,
  onTabChange,
  hasGroupsUnread,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  hasGroupsUnread: boolean;
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
    const cell = (i: number) => `calc(${i} * (100% - 8px) / 4 + 4px)`;
    const cellW = "calc((100% - 8px) / 4)";
    const cellWExpanded = "calc((100% - 8px) / 4 + 20px)";

    // Start from current position
    el.style.transition = "none";
    el.style.left = cell(from);
    el.style.width = cellW;
    void el.offsetWidth;

    // Slide + expand (shift left by 10px to stay centered during stretch)
    el.style.transition = "left 0.15s ease-out, width 0.15s ease-out";
    el.style.left = `calc(${to} * (100% - 8px) / 4 + 4px - 10px)`;
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
    <div
      style={{
        flexShrink: 0,
        padding: "0px 16px 16px",
        background: color.bg,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 0,
          background: color.card,
          borderRadius: 18,
          padding: "4px",
          border: `1px solid ${color.border}`,
          position: "relative",
          height: 60,
          alignItems: "stretch",
        }}
      >
        {/* Sliding highlight */}
        <div
          ref={highlightRef}
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: `calc(${idx} * (100% - 8px) / 4 + 4px)`,
            width: "calc((100% - 8px) / 4)",
            background: color.borderLight,
            borderRadius: 14,
            opacity: 0.3,
            ...(settled ? { transition: "none" } : {}),
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px 0",
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>
              {tabIcons[t]}
            </span>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 9,
                lineHeight: 1,
                marginTop: 5,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: tab === t ? color.accent : color.faint,
                fontWeight: tab === t ? 700 : 400,
              }}
            >
              {tabLabels[t]}
            </span>
            {t === "groups" && hasGroupsUnread && (
              <div
                data-testid="squads-unread-dot"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 8,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#ff3b30",
                }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
