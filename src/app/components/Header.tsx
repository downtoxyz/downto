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
  scrolled,
}: {
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAdd: () => void;
  glowAdd?: boolean;
  sortBy?: 'recent' | 'upcoming';
  onSortChange?: (sort: 'recent' | 'upcoming') => void;
  showSort?: boolean;
  scrolled?: boolean;
}) => (
  <div
    className="fixed top-0 left-0 right-0 z-40 max-w-[420px] mx-auto"
    style={{
      paddingTop: "env(safe-area-inset-top, 16px)",
    }}
  >
    {/* Blur layer — smooth 8-stop eased fade. Hidden at rest; fades in on scroll. */}
    <div className="absolute pointer-events-none transition-opacity duration-300" style={{
      inset: "0 0 -24px 0",
      opacity: scrolled ? 1 : 0,
      backdropFilter: scrolled ? "blur(40px)" : "blur(0px)",
      WebkitBackdropFilter: scrolled ? "blur(40px)" : "blur(0px)",
      mask: "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.9) 45%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.15) 85%, rgba(0,0,0,0.05) 93%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.9) 45%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.15) 85%, rgba(0,0,0,0.05) 93%, transparent 100%)",
    }} />
    {/* Color tint — smooth fade with noise dithering */}
    <div className="absolute pointer-events-none transition-opacity duration-300" style={{
      inset: "0 0 -24px 0",
      opacity: scrolled ? 0.4 : 0,
      background: "var(--color-bg)",
      mask: "linear-gradient(to bottom, black 25%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0.05) 92%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, black 25%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0.05) 92%, transparent 100%)",
    }} />
    {/* Noise dither overlay to break up gradient banding */}
    <div className="absolute pointer-events-none transition-opacity duration-300" style={{
      inset: "0 0 -24px 0",
      opacity: scrolled ? 0.12 : 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      mask: "linear-gradient(to bottom, transparent 30%, black 60%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, transparent 30%, black 60%, transparent 100%)",
    }} />

    <div className="px-5 pb-0 flex justify-between items-center relative">
      <h1
        className="font-serif text-dt font-normal"
        style={{ fontSize: 24, letterSpacing: "-0.06em" }}
      >
        downto
      </h1>
      <div className="flex items-center gap-2.5">
        {/* Sort toggle */}
        {showSort && sortBy && onSortChange && (
          <button
            onClick={() => onSortChange(sortBy === 'recent' ? 'upcoming' : 'recent')}
            className="bg-transparent border-none cursor-pointer p-2 flex items-center justify-center"
            title={sortBy === 'recent' ? 'Sort by upcoming' : 'Sort by recent'}
          >
            <svg width="18" height="18" viewBox="0 0 256 256" fill={sortBy === 'recent' ? color.text : color.accent}>
              <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h56A8,8,0,0,1,192,128Z"/>
            </svg>
          </button>
        )}
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
            className="bg-dt text-on-accent border-none w-10 h-10 rounded-full cursor-pointer flex items-center justify-center font-bold"
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

  </div>
);

export default Header;
