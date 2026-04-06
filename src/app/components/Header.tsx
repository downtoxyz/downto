"use client";

import { color } from "@/lib/styles";

/** Total header height = safe-area-inset-top + this value */
export const HEADER_HEIGHT_PX = 52;
/** Header height when sort tabs are visible */
export const HEADER_HEIGHT_WITH_TABS_PX = 84;
/** Small gap between header bottom and content — matches card gap (mb-2 = 8px) */
export const HEADER_OFFSET_PX = 8;

const Header = ({
  unreadCount,
  onOpenNotifications,
  onOpenAdd,
  glowAdd,
  sortBy,
  onSortChange,
  showSort,
}: {
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAdd: () => void;
  glowAdd?: boolean;
  sortBy?: 'recent' | 'upcoming';
  onSortChange?: (sort: 'recent' | 'upcoming') => void;
  showSort?: boolean;
}) => (
  <div
    className="fixed top-0 left-0 right-0 z-40 max-w-[420px] mx-auto"
    style={{
      paddingTop: "calc(env(safe-area-inset-top, 16px) + 4px)",
      background: "transparent",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
    }}
  >
    <div className="px-5 pb-2 flex justify-between items-center">
      <h1
        className="font-serif text-primary font-normal"
        style={{ fontSize: 28, letterSpacing: "-0.02em" }}
      >
        down to
      </h1>
      <div className="flex items-center gap-2.5">
        {/* Bell icon */}
        <button
          onClick={onOpenNotifications}
          className="bg-none border-none cursor-pointer relative p-2 flex items-center justify-center"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <div
              className="absolute top-1 right-1 h-4 rounded-lg bg-[#ff3b30] flex items-center justify-center font-mono text-white font-bold"
              style={{ width: unreadCount > 9 ? 18 : 16, fontSize: 9 }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </div>
          )}
        </button>
        {/* Add event button */}
        <div className="relative">
          {glowAdd && (
            <div
              className="absolute right-0 whitespace-nowrap font-mono text-tiny text-dt"
              style={{ bottom: -28, letterSpacing: "0.02em" }}
            >
              drop your first idea
            </div>
          )}
          <button
            onClick={onOpenAdd}
            className="bg-dt text-black border-none w-10 h-10 rounded-full cursor-pointer flex items-center justify-center font-bold"
            style={{
              fontSize: 22,
              animation: glowAdd ? "addButtonGlow 2s ease-in-out infinite" : undefined,
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
    {showSort && sortBy && onSortChange && (
      <div className="relative flex border-b border-border">
        {(['recent', 'upcoming'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onSortChange(mode)}
            className={`relative flex-1 cursor-pointer bg-transparent border-none py-2 font-mono text-tiny font-bold tracking-[0.08em] uppercase transition-colors ${
              sortBy === mode ? 'text-dt' : 'text-faint'
            }`}
          >
            {mode === 'recent' ? 'Recent' : 'Upcoming'}
          </button>
        ))}
        {/* Sliding underline */}
        <div
          className="absolute bottom-0 h-[2px] w-10 rounded-full bg-dt transition-all duration-200 ease-out"
          style={{ left: sortBy === 'recent' ? '25%' : '75%', transform: 'translateX(-50%)' }}
        />
      </div>
    )}
  </div>
);

export default Header;
