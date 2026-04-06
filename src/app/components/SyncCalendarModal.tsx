"use client";

import { useState, useRef, useEffect } from "react";
import cn from "@/lib/tailwindMerge";
import * as db from "@/lib/db";
import { generateICSCalendar, downloadICS, buildGoogleCalendarUrl, type ICSEventParams } from "@/lib/ics";

const SyncCalendarModal = ({
  open,
  onClose,
  exportItems = [],
}: {
  open: boolean;
  onClose: () => void;
  exportItems?: { id: string; label: string; sub: string; params: ICSEventParams }[];
}) => {
  const [syncTab, setSyncTab] = useState<"export" | "subscribe">("subscribe");
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSyncSelected(new Set(exportItems.map((e) => e.id)));
      setSyncTab(exportItems.length > 0 ? "export" : "subscribe");
      setCopied(false);
      if (!calendarToken && !tokenLoading) {
        setTokenLoading(true);
        db.getCalendarToken()
          .then((t) => { setCalendarToken(t); setTokenLoading(false); })
          .catch(() => setTokenLoading(false));
      }
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => { onClose(); setClosing(false); setDragOffset(0); }, 200);
  };

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) { isDragging.current = true; setDragOffset(dy); }
  };
  const handleSwipeEnd = () => {
    if (dragOffset > 60) handleClose();
    else setDragOffset(0);
    isDragging.current = false;
  };
  const handleScrollTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) { isDragging.current = true; e.preventDefault(); setDragOffset(dy); }
  };
  const handleScrollTouchEnd = () => {
    if (isDragging.current) handleSwipeEnd();
  };

  const toggleItem = (id: string) => {
    setSyncSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const userTz = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York";
  const webcalUrl = calendarToken
    ? `webcal://${typeof window !== "undefined" ? window.location.host : ""}/api/calendar/${calendarToken}?tz=${encodeURIComponent(userTz)}`
    : null;

  const copyUrl = async () => {
    if (!webcalUrl) return;
    try { await navigator.clipboard.writeText(webcalUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const handleSync = (target: "google" | "ics") => {
    const selected = exportItems.filter((e) => syncSelected.has(e.id));
    if (selected.length === 0) return;
    if (target === "google" && selected.length === 1) {
      window.open(buildGoogleCalendarUrl(selected[0].params), "_blank");
    } else {
      const cal = generateICSCalendar(selected.map((e) => e.params));
      downloadICS("downto-calendar.ics", cal);
    }
    onClose();
  };

  const hasExportItems = exportItems.length > 0;

  return (
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[9999] flex items-end justify-center"
    >
      <div
        onClick={handleClose}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: closing ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: closing ? "blur(0px)" : "blur(8px)",
          opacity: closing ? 0 : 1,
          transition: "opacity 0.2s ease, backdrop-filter 0.2s ease, -webkit-backdrop-filter 0.2s ease",
        }}
      />
      <div
        className="relative bg-surface rounded-t-3xl max-w-[420px] w-full max-h-[75vh] flex flex-col"
        style={{
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        {/* Drag handle + header */}
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          className="touch-none"
          style={{ padding: "16px 20px 0" }}
        >
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-faint rounded-sm" />
          </div>
          <h3 className="font-serif text-lg text-primary font-normal mb-3" style={{ margin: "0 0 12px" }}>
            Sync to Calendar
          </h3>

          {/* Tabs */}
          <div className="flex gap-0 mb-3 border-b border-border">
            {hasExportItems && (
              <button
                onClick={() => setSyncTab("export")}
                className={cn(
                  "flex-1 py-2 bg-transparent border-none font-mono text-xs cursor-pointer uppercase",
                  syncTab === "export" ? "font-bold text-dt" : "font-normal text-dim",
                )}
                style={{
                  borderBottom: syncTab === "export" ? "2px solid #e8ff5a" : "2px solid transparent",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                }}
              >
                Export
              </button>
            )}
            <button
              onClick={() => setSyncTab("subscribe")}
              className={cn(
                "flex-1 py-2 bg-transparent border-none font-mono text-xs cursor-pointer uppercase",
                syncTab === "subscribe" ? "font-bold text-dt" : "font-normal text-dim",
              )}
              style={{
                borderBottom: syncTab === "subscribe" ? "2px solid #e8ff5a" : "2px solid transparent",
                fontSize: 11,
                letterSpacing: "0.08em",
              }}
            >
              Auto Sync
            </button>
          </div>
        </div>

        {/* Tab content */}
        {syncTab === "export" && hasExportItems ? (
          <>
            <div className="flex items-center justify-between mb-2" style={{ padding: "0 20px" }}>
              <span className="font-mono text-tiny text-dim">
                {syncSelected.size} of {exportItems.length} selected
              </span>
              <button
                onClick={() => {
                  if (syncSelected.size === exportItems.length) setSyncSelected(new Set());
                  else setSyncSelected(new Set(exportItems.map((e) => e.id)));
                }}
                className="bg-transparent border-none font-mono text-tiny text-dt cursor-pointer uppercase py-1"
                style={{ letterSpacing: "0.08em", padding: "4px 0" }}
              >
                {syncSelected.size === exportItems.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div
              ref={scrollRef}
              onTouchStart={handleScrollTouchStart}
              onTouchMove={handleScrollTouchMove}
              onTouchEnd={handleScrollTouchEnd}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ padding: "0 20px" }}
            >
              {exportItems.map((item) => {
                const selected = syncSelected.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className="flex items-center gap-3 cursor-pointer border-b border-border"
                    style={{ padding: "10px 0" }}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-150",
                        selected ? "bg-dt border-2 border-dt" : "bg-transparent border-2 border-border-mid",
                      )}
                      style={{ borderRadius: 6 }}
                    >
                      {selected && <span className="text-black text-xs leading-none" style={{ fontSize: 12 }}>✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis",
                        selected ? "text-primary" : "text-muted",
                      )} style={{ fontSize: 12 }}>
                        {item.label}
                      </div>
                      <div className="font-mono text-tiny text-faint">
                        {item.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2" style={{ padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))" }}>
              <button
                onClick={() => handleSync("google")}
                disabled={syncSelected.size === 0}
                className={cn(
                  "flex-1 py-3 bg-transparent rounded-xl font-mono text-xs font-bold uppercase",
                  syncSelected.size > 0 ? "text-primary cursor-pointer border border-border-mid" : "text-faint cursor-default border border-border",
                )}
                style={{ fontSize: 12, letterSpacing: "0.08em" }}
              >
                Google Cal
              </button>
              <button
                onClick={() => handleSync("ics")}
                disabled={syncSelected.size === 0}
                className={cn(
                  "flex-1 py-3 border-none rounded-xl font-mono text-xs font-bold uppercase",
                  syncSelected.size > 0 ? "bg-dt text-black cursor-pointer" : "bg-border text-faint cursor-default",
                )}
                style={{ fontSize: 12, letterSpacing: "0.08em" }}
              >
                Download .ics
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            <p className="font-mono text-xs text-muted mb-4" style={{ fontSize: 11, lineHeight: 1.6 }}>
              Subscribe once and your calendar app will automatically stay in sync. New events you save will appear automatically — no duplicates.
            </p>

            {tokenLoading ? (
              <div className="font-mono text-xs text-faint text-center p-5" style={{ fontSize: 11 }}>
                Loading...
              </div>
            ) : webcalUrl ? (
              <>
                <div
                  className="bg-deep border border-border rounded-lg font-mono text-tiny text-dim mb-3 break-all"
                  style={{ padding: "10px 12px", lineHeight: 1.5 }}
                >
                  {webcalUrl}
                </div>

                <div className="flex flex-col gap-2">
                  <a
                    href={webcalUrl}
                    className="block py-3 bg-dt border-none rounded-xl text-black font-mono text-xs font-bold cursor-pointer uppercase text-center no-underline"
                    style={{ fontSize: 12, letterSpacing: "0.08em" }}
                  >
                    Subscribe in Calendar App
                  </a>
                  <button
                    onClick={copyUrl}
                    className={cn(
                      "py-3 bg-transparent border border-border-mid rounded-xl font-mono text-xs font-bold cursor-pointer uppercase",
                      copied ? "text-dt" : "text-primary",
                    )}
                    style={{ fontSize: 12, letterSpacing: "0.08em" }}
                  >
                    {copied ? "Copied!" : "Copy URL"}
                  </button>
                </div>

                <p className="font-mono text-faint text-center mt-3.5" style={{ fontSize: 9, lineHeight: 1.5 }}>
                  Works with Apple Calendar, Google Calendar, Outlook, and any app that supports webcal subscriptions. Your calendar will refresh automatically.
                </p>
              </>
            ) : (
              <div className="font-mono text-xs text-faint text-center p-5" style={{ fontSize: 11 }}>
                Could not load subscription URL.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncCalendarModal;
