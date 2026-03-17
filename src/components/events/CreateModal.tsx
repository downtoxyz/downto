"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { font, color } from "@/lib/styles";
import { useModalTransition } from "@/hooks/useModalTransition";
import type { ScrapedEvent } from "@/lib/ui-types";
import { parseNaturalDate, parseNaturalTime, parseNaturalLocation, parseDateToISO, sanitize, stripDateTimeText } from "@/lib/utils";
import { logWarn } from "@/lib/logger";
import * as db from "@/lib/db";

interface CheckMovie {
  title: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  vibes?: string[];
  letterboxdUrl: string;
}

const CHECK_PLACEHOLDERS = [
  "park hang w me and @kat ^.^",
  "dinner at 7 tomorrow?",
  "need to touch grass asap",
  "someone come thrift w me",
  "get molly tea or heytea tn??",
  "beach day this weekend who's in",
  "late night ramen?",
  "gonna go on a walk, join me",
  "movie marathon at mine tonight",
  "farmers market tmrw morning?",
  "who wants to be productive at a cafe",
  "spontaneous road trip this wknd??",
  "karaoke night let's goooo",
  "sunrise hike anyone?",
  "cooking dinner tonight need taste testers",
  "someone pls come to this concert w me",
];

const AddModal = ({
  open,
  onClose,
  onSubmit,
  onInterestCheck,
  defaultMode,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: ScrapedEvent, sharePublicly: boolean) => void;
  onInterestCheck: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number | null, movieData?: CheckMovie, eventTime?: string | null, dateFlexible?: boolean, timeFlexible?: boolean, taggedFriendIds?: string[]) => void;
  defaultMode?: "paste" | "idea" | "manual" | null;
  friends?: { id: string; name: string; avatar: string }[];
}) => {
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const checkPlaceholder = useMemo(() =>
    CHECK_PLACEHOLDERS[Math.floor(Math.random() * CHECK_PLACEHOLDERS.length)],
  []);
  const [mode, setMode] = useState<"paste" | "idea" | "manual">("idea");
  const [url, setUrl] = useState("");
  const [idea, setIdea] = useState("");
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [squadSize, setSquadSize] = useState(5);

  // Count tagged co-authors from @mentions in idea text
  const taggedCoAuthorCount = (() => {
    const mentionNames = [...idea.matchAll(/@(\S+)/g)].map(m => m[1].toLowerCase());
    if (mentionNames.length === 0) return 0;
    return (friends ?? []).filter(f => mentionNames.some(m =>
      m === (f as { username?: string }).username?.toLowerCase() ||
      m === f.name.toLowerCase() ||
      m === f.name.split(' ')[0]?.toLowerCase()
    )).length;
  })();
  const minSquadSize = 1 + taggedCoAuthorCount; // author + co-authors

  // Auto-bump squad size if current selection is impossible
  useEffect(() => {
    if (squadSize !== 0 && squadSize < minSquadSize) {
      const options = [3, 4, 5, 6, 8];
      const nextValid = options.find(n => n >= minSquadSize);
      setSquadSize(nextValid ?? 0);
    }
  }, [minSquadSize, squadSize]);

  const detectedDate = idea ? parseNaturalDate(idea) : null;
  const detectedTime = idea ? parseNaturalTime(idea) : null;
  const detectedLocation = idea ? parseNaturalLocation(idea) : null;

  // Chip state: null = use auto-detected, string = manual override, "" = cleared
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState<string | null>(null);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [locationLocked, setLocationLocked] = useState(false);
  const [editingChip, setEditingChip] = useState<"date" | "time" | "location" | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1); // cursor position of @
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState<ScrapedEvent | null>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    vibe: "",
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const dragging = useRef(false);
  const [socialSignal, setSocialSignal] = useState<{ totalDown: number; friendsDown: number } | null>(null);
  const [checkMovie, setCheckMovie] = useState<CheckMovie | null>(null);
  const [checkMovieLoading, setCheckMovieLoading] = useState(false);
  const checkMovieUrlRef = useRef<string | null>(null);
  const checkMovieLoadingRef = useRef(false);

  // Manual mode: movie search
  const [movieMode, setMovieMode] = useState(false);
  const [manualMovie, setManualMovie] = useState<{ title: string; year: string; director: string; thumbnail: string; url: string; vibes: string[] } | null>(null);
  const [movieSearching, setMovieSearching] = useState(false);
  const movieSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (defaultMode) setMode(defaultMode);
      if (modalRef.current) {
        modalRef.current.style.transform = "translateY(0)";
      }
      setTimeout(() => {
        if ((defaultMode || mode) === "paste") inputRef.current?.focus();
        else ideaRef.current?.focus();
      }, 200);
    }
    if (!open) {
      setUrl("");
      setIdea("");
      setLoading(false);
      setScraped(null);
      setSharePublicly(false);
      setMode("idea");
      setError(null);
      setManual({ title: "", venue: "", date: "", time: "", vibe: "" });
      setSocialSignal(null);
      setCheckMovie(null);
      setCheckMovieLoading(false);
      checkMovieLoadingRef.current = false;
      checkMovieUrlRef.current = null;
      setMentionQuery(null);
      setMentionIdx(-1);
      setMovieMode(false);
      setManualMovie(null);
      setMovieSearching(false);
      if (movieSearchTimer.current) clearTimeout(movieSearchTimer.current);
    }
  }, [open, mode, defaultMode]);

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [visible]);

  const [error, setError] = useState<string | null>(null);

  const handlePull = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to scrape post");
        setLoading(false);
        return;
      }

      setScraped({
        title: data.title,
        venue: data.venue,
        date: data.date,
        time: data.time,
        vibe: data.vibe,
        igHandle: data.igHandle || "",
        isPublicPost: data.isPublicPost || false,
        igUrl: data.igUrl,
        diceUrl: data.diceUrl,
      });
      setSharePublicly(data.isPublicPost || false);

      // Check for existing event with this IG/Dice URL → social signal
      if (data.igUrl || data.diceUrl) {
        try {
          const existingEvent = data.igUrl
            ? await db.findEventByIgUrl(data.igUrl)
            : data.diceUrl
              ? await db.findEventByDiceUrl(data.diceUrl)
              : null;
          if (existingEvent) {
            const signal = await db.getEventSocialSignal(existingEvent.id);
            if (signal.totalDown > 0) {
              setSocialSignal(signal);
            }
          }
        } catch {
          // Non-critical — just skip the signal
        }
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }

    setLoading(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        ref={modalRef}
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          maxHeight: "85dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: "0 24px calc(24px + env(safe-area-inset-bottom, 0px))",
          animation: closing ? "none" : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : undefined,
          transition: closing ? "transform 0.2s ease-in" : (dragging.current ? "none" : "transform 0.2s ease-out"),
        }}
      >
        <div
          onTouchStart={(e) => {
            touchStartY.current = e.touches[0].clientY;
            dragging.current = true;
          }}
          onTouchMove={(e) => {
            if (!dragging.current) return;
            const deltaY = e.touches[0].clientY - touchStartY.current;
            if (deltaY > 0 && modalRef.current) {
              modalRef.current.style.transform = `translateY(${deltaY}px)`;
              modalRef.current.style.transition = "none";
            }
          }}
          onTouchEnd={(e) => {
            if (!dragging.current) return;
            dragging.current = false;
            const deltaY = e.changedTouches[0].clientY - touchStartY.current;
            if (modalRef.current) {
              if (deltaY > 80) {
                close();
              } else {
                modalRef.current.style.transition = "transform 0.2s ease-out";
                modalRef.current.style.transform = "translateY(0)";
              }
            }
          }}
          style={{
            padding: "20px 0 12px",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              background: color.faint,
              borderRadius: 2,
              margin: "0 auto",
            }}
          />
        </div>
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setMode("idea")}
            style={{
              flex: 1,
              background: mode === "idea" ? color.accent : "transparent",
              color: mode === "idea" ? "#000" : color.dim,
              border: mode === "idea" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: mode === "idea" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Interest Check
          </button>
          <button
            onClick={() => setMode("paste")}
            style={{
              flex: 1,
              background: (mode === "paste" || mode === "manual") ? color.accent : "transparent",
              color: (mode === "paste" || mode === "manual") ? "#000" : color.dim,
              border: (mode === "paste" || mode === "manual") ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: (mode === "paste" || mode === "manual") ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Save Event
          </button>
        </div>

        {mode === "paste" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <textarea
                ref={inputRef}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handlePull();
                  }
                }}
                placeholder="paste link"
                rows={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  lineHeight: "1.4",
                  outline: "none",
                  transition: "border-color 0.2s",
                  resize: "none",
                  overflow: "hidden",
                  maxHeight: 100,
                }}
              />
              <button
                onClick={handlePull}
                style={{
                  background: color.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 20px",
                  fontFamily: font.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {loading ? "..." : "Pull"}
              </button>
            </div>

        {!loading && !scraped && !error && (
          <div
            style={{
              padding: "12px 14px",
              background: color.deep,
              borderRadius: 10,
              marginBottom: 14,
              border: `1px solid ${color.borderLight}`,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.muted,
                lineHeight: 1.5,
              }}
            >
              Paste an Instagram or Dice link to pull event details.
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 20,
              color: color.dim,
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: `2px solid ${color.borderMid}`,
                borderTopColor: color.accent,
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            {url.includes("dice.fm") ? "fetching event details..." : "scraping event details..."}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(255,100,100,0.1)",
              border: "1px solid rgba(255,100,100,0.3)",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: "#ff6b6b",
                marginBottom: 10,
              }}
            >
              {error}
            </div>
            <button
              onClick={() => {
                setMode("manual");
                setError(null);
              }}
              style={{
                background: "transparent",
                color: color.accent,
                border: `1px solid ${color.accent}`,
                borderRadius: 8,
                padding: "8px 14px",
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Enter manually instead
            </button>
          </div>
        )}

        {scraped && (
          <div
            style={{
              background: color.deep,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${color.borderLight}`,
              animation: "fadeIn 0.3s ease",
            }}
          >
            <input
              type="text"
              value={scraped.title}
              onChange={(e) => setScraped({ ...scraped, title: e.target.value })}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${color.borderMid}`,
                borderRadius: 0,
                padding: "4px 0",
                fontFamily: font.serif,
                fontSize: 22,
                color: color.text,
                marginBottom: 8,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={scraped.venue === "TBD" ? "" : scraped.venue}
                onChange={(e) => setScraped({ ...scraped, venue: e.target.value })}
                placeholder="Venue"
                style={{
                  background: color.surface,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={scraped.date === "TBD" ? "" : scraped.date}
                  onChange={(e) => setScraped({ ...scraped, date: e.target.value })}
                  placeholder="Date"
                  style={{
                    flex: 1,
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={scraped.time === "TBD" ? "" : scraped.time}
                  onChange={(e) => setScraped({ ...scraped, time: e.target.value })}
                  placeholder="Time"
                  style={{
                    flex: 1,
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>
              <input
                type="text"
                value={scraped.vibe.join(", ")}
                onChange={(e) => setScraped({ ...scraped, vibe: e.target.value.split(",").map(v => v.trim().toLowerCase()).filter(Boolean) })}
                placeholder="Vibes (comma separated)"
                style={{
                  background: color.surface,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
            {/* Social signal — shows when existing event has people down */}
            {socialSignal && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "rgba(232,255,90,0.06)",
                  borderRadius: 10,
                  marginBottom: 14,
                  border: `1px solid ${color.border}`,
                }}
              >
                <span style={{ fontSize: 14 }}>👥</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
                  {socialSignal.totalDown} {socialSignal.totalDown === 1 ? "person" : "people"} down
                  {socialSignal.friendsDown > 0 && (
                    <span style={{ color: color.accent }}> · {socialSignal.friendsDown} {socialSignal.friendsDown === 1 ? "friend" : "friends"}</span>
                  )}
                </span>
              </div>
            )}
            {/* Public post indicator and share toggle */}
            {scraped.isPublicPost && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "rgba(232,255,90,0.08)",
                  borderRadius: 10,
                  marginBottom: 14,
                  border: `1px solid ${color.borderLight}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.accent,
                      marginBottom: 2,
                    }}
                  >
                    {scraped.diceUrl ? "Public Dice event detected" : "Public IG post detected"}
                  </div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                    }}
                  >
                    Share on &quot;Tonight&quot; for others to find
                  </div>
                </div>
                <button
                  onClick={() => setSharePublicly(!sharePublicly)}
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    background: sharePublicly ? color.accent : color.borderMid,
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: sharePublicly ? 21 : 3,
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
            )}
            {!scraped.isPublicPost && (
              <div
                style={{
                  padding: "10px 14px",
                  background: color.surface,
                  borderRadius: 10,
                  marginBottom: 14,
                  fontFamily: font.mono,
                  fontSize: 10,
                  color: color.dim,
                }}
              >
                Private IG post — only visible to you
              </div>
            )}
            <button
              onClick={async () => {
                await onSubmit(scraped, sharePublicly);
                close();
              }}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {sharePublicly ? "Save & Share Publicly →" : "Save to Calendar →"}
            </button>
            <button
              onClick={() => {
                const title = scraped.title || "Event";
                const dateStr = scraped.date && scraped.date !== "TBD" ? scraped.date : null;
                const parsedDate = dateStr ? parseNaturalDate(dateStr) : null;
                const timeStr = scraped.time && scraped.time !== "TBD" ? scraped.time : null;
                onInterestCheck(
                  sanitize(title, 280),
                  24,
                  parsedDate?.iso ?? null,
                  5,
                  undefined,
                  timeStr,
                );
                close();
              }}
              style={{
                width: "100%",
                background: "transparent",
                color: color.accent,
                border: `1px solid ${color.accent}`,
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginTop: 8,
              }}
            >
              Send as Interest Check →
            </button>
            <p
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                color: color.faint,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              sent to your friends & their friends
            </p>
          </div>
        )}
          </>
        )}

        {mode === "idea" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                  marginBottom: 12,
                  lineHeight: 1.6,
                }}
              >
                Got an idea? See if your friends are down.
              </p>
              <textarea
                ref={ideaRef}
                value={idea}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 280);
                  setIdea(val);
                  // Reset dismissed chips so auto-detection re-evaluates
                  setManualDate(null);
                  setManualTime(null);
                  setManualLocation(null);
                  // Detect @mention
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
                  // Detect Letterboxd URL
                  const lbMatch = val.match(/https?:\/\/(www\.)?letterboxd\.com\/film\/[a-z0-9-]+\/?/i)
                    || val.match(/https?:\/\/boxd\.it\/[a-zA-Z0-9]+\/?/i);
                  const detectedUrl = lbMatch ? lbMatch[0] : null;
                  if (detectedUrl && detectedUrl !== checkMovieUrlRef.current && !checkMovieLoadingRef.current) {
                    checkMovieUrlRef.current = detectedUrl;
                    checkMovieLoadingRef.current = true;
                    setCheckMovieLoading(true);
                    const urlToReplace = detectedUrl;
                    fetch("/api/scrape", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: detectedUrl }),
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.movieTitle || data.title) {
                          const movieTitle = data.movieTitle || data.title;
                          setCheckMovie({
                            title: movieTitle,
                            year: data.year,
                            director: data.director,
                            thumbnail: data.thumbnail,
                            vibes: data.vibe || [],
                            letterboxdUrl: data.letterboxdUrl || urlToReplace,
                          });
                          // Remove the URL from the textarea
                          setIdea((prev) => prev.replace(urlToReplace, "").trim());
                        }
                      })
                      .catch((err) => logWarn("checkMovieFetch", "Failed", { error: err }))
                      .finally(() => { setCheckMovieLoading(false); checkMovieLoadingRef.current = false; });
                  } else if (!detectedUrl && !checkMovie) {
                    checkMovieUrlRef.current = null;
                  }
                }}
                onKeyDown={(e) => {
                  if (mentionQuery !== null && e.key === "Escape") {
                    setMentionQuery(null);
                    setMentionIdx(-1);
                  }
                }}
                maxLength={280}
                placeholder={checkPlaceholder}
                style={{
                  width: "100%",
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  outline: "none",
                  resize: "none",
                  height: 100,
                  lineHeight: 1.5,
                }}
              />
              {/* @mention autocomplete dropdown */}
              {mentionQuery !== null && friends && friends.length > 0 && (() => {
                const filtered = friends.filter(f => f.name.toLowerCase().includes(mentionQuery));
                if (filtered.length === 0) return null;
                return (
                  <div style={{
                    background: color.deep, border: `1px solid ${color.borderMid}`,
                    borderRadius: 10, marginTop: 4, maxHeight: 140, overflowY: "auto",
                  }}>
                    {filtered.slice(0, 6).map(f => (
                      <button
                        key={f.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          // Replace @query with @Name
                          const before = idea.slice(0, mentionIdx);
                          const after = idea.slice(mentionIdx + 1 + (mentionQuery?.length ?? 0));
                          setIdea(before + "@" + f.name + " " + after);
                          setMentionQuery(null);
                          setMentionIdx(-1);
                          ideaRef.current?.focus();
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "8px 12px",
                          background: "transparent", border: "none", cursor: "pointer",
                          borderBottom: `1px solid ${color.border}`,
                        }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: color.borderLight, color: color.dim,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                        }}>
                          {f.avatar}
                        </div>
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>{f.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Date / Time / Location chips — always visible */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {([
                {
                  key: "date" as const,
                  placeholder: "date?",
                  detected: detectedDate?.label ?? null,
                  manual: manualDate,
                  setManual: setManualDate,
                  locked: dateLocked,
                  setLocked: setDateLocked,
                },
                {
                  key: "time" as const,
                  placeholder: "time?",
                  detected: detectedTime ?? null,
                  manual: manualTime,
                  setManual: setManualTime,
                  locked: timeLocked,
                  setLocked: setTimeLocked,
                },
                {
                  key: "location" as const,
                  placeholder: "location?",
                  detected: detectedLocation ?? null,
                  manual: manualLocation,
                  setManual: setManualLocation,
                  locked: locationLocked,
                  setLocked: setLocationLocked,
                },
              ] as const).map((chip) => {
                const value = chip.manual !== null ? chip.manual : chip.detected;
                const hasValue = !!value;
                const isEditing = editingChip === chip.key;

                if (isEditing) {
                  const validate = (v: string): string | null => {
                    if (!v) return "";
                    if (chip.key === "date") {
                      const parsed = parseNaturalDate(v);
                      if (parsed) return parsed.label;
                      if (parseDateToISO(v)) return v;
                      return null; // invalid
                    }
                    if (chip.key === "time") {
                      const parsed = parseNaturalTime(v);
                      if (parsed) return parsed;
                      return null; // invalid
                    }
                    return v; // location: accept anything
                  };
                  return (
                    <input
                      key={chip.key}
                      autoFocus
                      placeholder={chip.key === "date" ? "e.g. friday, mar 7" : chip.key === "time" ? "e.g. 7pm, noon" : "e.g. Jollibee"}
                      defaultValue={value ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const result = validate(v);
                        if (result !== null) {
                          chip.setManual(result);
                          setEditingChip(null);
                        } else {
                          // Invalid — flash red then refocus
                          e.target.style.borderColor = "#ff4444";
                          setTimeout(() => {
                            e.target.style.borderColor = color.accent;
                          }, 800);
                          e.target.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === "Escape") {
                          setEditingChip(null);
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        background: "rgba(232,255,90,0.08)",
                        border: `1px solid ${color.accent}`,
                        borderRadius: 8,
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.accent,
                        fontWeight: 600,
                        outline: "none",
                        width: 120,
                        transition: "border-color 0.2s",
                      }}
                    />
                  );
                }

                return (
                  <div
                    key={chip.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 10px",
                      background: "rgba(232,255,90,0.08)",
                      borderRadius: 8,
                      border: "1px solid rgba(232,255,90,0.2)",
                    }}
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        chip.setLocked(!chip.locked);
                      }}
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: hasValue ? color.accent : color.dim,
                        fontWeight: 600,
                        userSelect: "none",
                        cursor: "pointer",
                      }}
                    >
                      {hasValue ? value : chip.placeholder}
                    </span>
                    {!chip.locked && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          chip.setLocked(true);
                        }}
                        style={{
                          padding: "1px 6px",
                          background: "rgba(232,255,90,0.15)",
                          borderRadius: 4,
                          fontFamily: font.mono,
                          fontSize: 9,
                          color: color.accent,
                          cursor: "pointer",
                        }}
                      >
                        flexible
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Movie preview from detected Letterboxd link */}
            {checkMovieLoading && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                padding: "10px 12px",
                background: color.deep,
                borderRadius: 10,
                border: `1px solid ${color.borderLight}`,
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${color.borderMid}`,
                  borderTopColor: color.accent,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                  fetching movie details...
                </span>
              </div>
            )}
            {checkMovie && !checkMovieLoading && (
              <div style={{
                marginBottom: 12,
                padding: 12,
                background: color.deep,
                borderRadius: 12,
                border: `1px solid ${color.borderLight}`,
                animation: "fadeIn 0.3s ease",
              }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {checkMovie.thumbnail && (
                    <img
                      src={checkMovie.thumbnail}
                      alt={checkMovie.title}
                      style={{
                        width: 60,
                        height: 90,
                        objectFit: "cover",
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{
                        fontFamily: font.serif,
                        fontSize: 17,
                        color: color.text,
                        lineHeight: 1.2,
                        marginBottom: 3,
                      }}>
                        {checkMovie.title}
                      </div>
                      <button
                        onClick={() => { setCheckMovie(null); checkMovieUrlRef.current = null; }}
                        style={{
                          background: "none",
                          border: "none",
                          color: color.dim,
                          fontFamily: font.mono,
                          fontSize: 14,
                          cursor: "pointer",
                          padding: "0 2px",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.muted,
                      marginBottom: 4,
                    }}>
                      {checkMovie.year}{checkMovie.director && ` · ${checkMovie.director}`}
                    </div>
                    {checkMovie.vibes && checkMovie.vibes.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {checkMovie.vibes.slice(0, 4).map((v) => (
                          <span
                            key={v}
                            style={{
                              background: "#1f1f1f",
                              color: color.accent,
                              padding: "2px 6px",
                              borderRadius: 12,
                              fontFamily: font.mono,
                              fontSize: 9,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Timer picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Expires in
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "1h", hours: 1 as number | null },
                  { label: "4h", hours: 4 as number | null },
                  { label: "12h", hours: 12 as number | null },
                  { label: "24h", hours: 24 as number | null },
                  { label: "∞", hours: null as number | null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setCheckTimer(opt.hours)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: checkTimer === opt.hours ? color.accent : "transparent",
                      color: checkTimer === opt.hours ? "#000" : color.muted,
                      border: `1px solid ${checkTimer === opt.hours ? color.accent : color.borderMid}`,
                      borderRadius: 10,
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: checkTimer === opt.hours ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Squad size picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Squad size
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "3", value: 3 },
                  { label: "4", value: 4 },
                  { label: "5", value: 5 },
                  { label: "6", value: 6 },
                  { label: "8", value: 8 },
                  { label: "\u221e", value: 0 },
                ].map((opt) => {
                  const disabled = opt.value !== 0 && opt.value < minSquadSize;
                  const selected = squadSize === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => !disabled && setSquadSize(opt.value)}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        background: selected ? color.accent : "transparent",
                        color: disabled ? color.faint : selected ? "#000" : color.muted,
                        border: `1px solid ${selected ? color.accent : disabled ? color.border : color.borderMid}`,
                        borderRadius: 10,
                        fontFamily: font.mono,
                        fontSize: 12,
                        fontWeight: selected ? 700 : 400,
                        cursor: disabled ? "default" : "pointer",
                        opacity: disabled ? 0.4 : 1,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {taggedCoAuthorCount > 0 && (() => {
                const openSlots = squadSize === 0 ? "unlimited" : Math.max(0, squadSize - minSquadSize);
                return (
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginTop: 6 }}>
                    {`you + ${taggedCoAuthorCount} tagged · ${openSlots} open slot${openSlots !== 1 && openSlots !== "unlimited" ? "s" : openSlots === "unlimited" ? "s" : ""}`}
                  </div>
                );
              })()}
            </div>
            <button
              onClick={() => {
                if (idea.trim()) {
                  // Resolve chip values: manual override > auto-detected > null
                  const eventDate = manualDate !== null
                    ? (manualDate ? parseDateToISO(manualDate) : null)
                    : (detectedDate?.iso ?? null);
                  const eventTime = manualTime !== null ? (manualTime || null) : (detectedTime ?? null);
                  // Extract @mentions → friend IDs (match against username or display name)
                  const mentionNames = [...idea.matchAll(/@(\S+)/g)].map(m => m[1].toLowerCase());
                  const taggedIds = (friends ?? [])
                    .filter(f => mentionNames.some(m =>
                      m === (f as { username?: string }).username?.toLowerCase() ||
                      m === f.name.toLowerCase() ||
                      m === f.name.split(' ')[0]?.toLowerCase()
                    ))
                    .map(f => f.id);
                  const title = sanitize(stripDateTimeText(idea), 280);
                  onInterestCheck(title, checkTimer, eventDate, squadSize === 0 ? null : squadSize, checkMovie ?? undefined, eventTime, !dateLocked, !timeLocked, taggedIds.length > 0 ? taggedIds : undefined);
                  close();
                }
              }}
              disabled={!idea.trim()}
              style={{
                width: "100%",
                background: idea.trim() ? color.accent : color.borderMid,
                color: idea.trim() ? "#000" : color.dim,
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: idea.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {checkMovie ? "Send Movie Check →" : "Send Interest Check →"}
            </button>
            <p
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                color: color.faint,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              sent to your friends & their friends{checkTimer ? ` · expires in ${checkTimer}h` : ""}
            </p>
          </>
        )}

        {mode === "manual" && (
          <>
            <div style={{ marginBottom: 16 }}>
              {/* Event / Movie toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["EVENT", "MOVIE"] as const).map((label) => {
                  const active = label === "MOVIE" ? movieMode : !movieMode;
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        const isMovie = label === "MOVIE";
                        setMovieMode(isMovie);
                        if (!isMovie) { setManualMovie(null); setMovieSearching(false); }
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        background: active ? color.accent : "transparent",
                        color: active ? "#000" : color.muted,
                        border: `1px solid ${active ? color.accent : color.borderMid}`,
                        borderRadius: 10,
                        fontFamily: font.mono,
                        fontSize: 11,
                        fontWeight: active ? 700 : 400,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                {movieMode ? "Search for a movie to create a screening event" : "Enter event details manually"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="text"
                  value={manual.title}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 100);
                    setManual({ ...manual, title: val });
                    // Movie search: debounce when in movie mode and 3+ chars
                    if (movieMode) {
                      if (movieSearchTimer.current) clearTimeout(movieSearchTimer.current);
                      if (val.trim().length >= 3) {
                        setMovieSearching(true);
                        movieSearchTimer.current = setTimeout(async () => {
                          try {
                            const res = await fetch("/api/search-letterboxd", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ query: val.trim() }),
                            });
                            const data = await res.json();
                            if (data.found && data.movie) {
                              setManualMovie(data.movie);
                            } else {
                              setManualMovie(null);
                            }
                          } catch {
                            setManualMovie(null);
                          } finally {
                            setMovieSearching(false);
                          }
                        }, 800);
                      } else {
                        setManualMovie(null);
                        setMovieSearching(false);
                      }
                    }
                  }}
                  placeholder={movieMode ? "Movie title (e.g., The Bride)" : "Event name"}
                  maxLength={100}
                  style={{
                    background: color.deep,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                {/* Movie search loading */}
                {movieMode && movieSearching && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: color.deep,
                    borderRadius: 10,
                    border: `1px solid ${color.borderLight}`,
                  }}>
                    <div style={{
                      width: 16,
                      height: 16,
                      border: `2px solid ${color.borderMid}`,
                      borderTopColor: color.accent,
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                      searching letterboxd...
                    </span>
                  </div>
                )}
                {/* Movie match preview */}
                {movieMode && manualMovie && !movieSearching && (
                  <div style={{
                    padding: 12,
                    background: color.deep,
                    borderRadius: 12,
                    border: `1px solid ${color.borderLight}`,
                    animation: "fadeIn 0.3s ease",
                  }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {manualMovie.thumbnail && (
                        <img
                          src={manualMovie.thumbnail}
                          alt={manualMovie.title}
                          style={{
                            width: 60,
                            height: 90,
                            objectFit: "cover",
                            borderRadius: 8,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{
                            fontFamily: font.serif,
                            fontSize: 17,
                            color: color.text,
                            lineHeight: 1.2,
                            marginBottom: 3,
                          }}>
                            {manualMovie.title}
                          </div>
                          <button
                            onClick={() => setManualMovie(null)}
                            style={{
                              background: "none",
                              border: "none",
                              color: color.dim,
                              fontFamily: font.mono,
                              fontSize: 14,
                              cursor: "pointer",
                              padding: "0 2px",
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: color.muted,
                          marginBottom: 4,
                        }}>
                          {manualMovie.year}{manualMovie.director && ` · ${manualMovie.director}`}
                        </div>
                        {manualMovie.vibes && manualMovie.vibes.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {manualMovie.vibes.slice(0, 4).map((v) => (
                              <span
                                key={v}
                                style={{
                                  background: "#1f1f1f",
                                  color: color.accent,
                                  padding: "2px 6px",
                                  borderRadius: 12,
                                  fontFamily: font.mono,
                                  fontSize: 9,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* No match hint */}
                {movieMode && !manualMovie && !movieSearching && manual.title.trim().length >= 3 && (
                  <div style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.faint,
                    padding: "4px 0",
                  }}>
                    No match found — you can still save the event manually
                  </div>
                )}
                <input
                  type="text"
                  value={manual.venue}
                  onChange={(e) => setManual({ ...manual, venue: e.target.value.slice(0, 100) })}
                  placeholder="Venue"
                  maxLength={100}
                  style={{
                    background: color.deep,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={manual.date}
                    onChange={(e) => setManual({ ...manual, date: e.target.value.slice(0, 50) })}
                    placeholder="Date (e.g., Sat, Feb 15)"
                    maxLength={50}
                    style={{
                      flex: 1,
                      background: color.deep,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      color: color.text,
                      fontFamily: font.mono,
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) => setManual({ ...manual, time: e.target.value.slice(0, 50) })}
                    placeholder="Time"
                    maxLength={50}
                    style={{
                      flex: 1,
                      background: color.deep,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      color: color.text,
                      fontFamily: font.mono,
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>
                {!movieMode && (
                  <input
                    type="text"
                    value={manual.vibe}
                    onChange={(e) => setManual({ ...manual, vibe: e.target.value.slice(0, 100) })}
                    placeholder="Vibes (comma separated, e.g., techno, late night)"
                    maxLength={100}
                    style={{
                      background: color.deep,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      color: color.text,
                      fontFamily: font.mono,
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (manual.title.trim()) {
                  const hasMovie = movieMode && manualMovie;
                  onSubmit({
                    type: hasMovie ? "movie" : "event",
                    title: hasMovie ? `${manualMovie.title} screening` : manual.title,
                    venue: manual.venue || "TBD",
                    date: manual.date || "TBD",
                    time: manual.time || "TBD",
                    vibe: hasMovie
                      ? (manualMovie.vibes.length > 0 ? manualMovie.vibes : ["film", "movie night"])
                      : (manual.vibe ? manual.vibe.split(",").map(v => v.trim().toLowerCase()) : ["event"]),
                    igHandle: "",
                    isPublicPost: false,
                    ...(hasMovie ? {
                      movieTitle: manualMovie.title,
                      year: manualMovie.year,
                      director: manualMovie.director,
                      thumbnail: manualMovie.thumbnail,
                      letterboxdUrl: manualMovie.url,
                    } : {}),
                  }, false);
                  close();
                }
              }}
              disabled={!manual.title.trim()}
              style={{
                width: "100%",
                background: manual.title.trim() ? color.accent : color.borderMid,
                color: manual.title.trim() ? "#000" : color.dim,
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: manual.title.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {movieMode && manualMovie ? "Save Movie Night →" : "Save to Calendar →"}
            </button>
            <button
              onClick={() => setMode("paste")}
              style={{
                width: "100%",
                marginTop: 10,
                background: "transparent",
                color: color.dim,
                border: "none",
                padding: "10px",
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ← Back to paste link
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AddModal;
