'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useModalTransition } from '@/shared/hooks/useModalTransition';
import type { ScrapedEvent } from '@/lib/ui-types';
import { parseNaturalDate, parseNaturalTime, sanitize } from '@/lib/utils';
import { logError, logWarn } from '@/lib/logger';
import * as db from '@/lib/db';
import { API_BASE } from '@/lib/db';
import cn from '@/lib/tailwindMerge';

interface CheckMovie {
  title: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  vibes?: string[];
  letterboxdUrl: string;
}

const CHECK_PLACEHOLDERS = [
  'park hang w me and @kat ^.^',
  'dinner at 7 tomorrow?',
  'need to touch grass asap',
  'someone come thrift w me',
  'get molly tea or heytea tn??',
  "beach day this weekend who's in",
  'late night ramen?',
  'gonna go on a walk, join me',
  'movie marathon at mine tonight',
  'farmers market tmrw morning?',
  'who wants to be productive at a cafe',
  'spontaneous road trip this wknd??',
  "karaoke night let's goooo",
  'sunrise hike anyone?',
  'cooking dinner tonight need taste testers',
  'someone pls come to this concert w me',
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
  onSubmit: (e: ScrapedEvent, visibility: 'public' | 'friends') => void;
  onInterestCheck: (
    idea: string,
    expiresInHours: number | null,
    eventDate: string | null,
    maxSquadSize: number | null,
    movieData?: CheckMovie,
    eventTime?: string | null,
    dateFlexible?: boolean,
    timeFlexible?: boolean,
    taggedFriendIds?: string[],
    location?: string | null
  ) => void;
  defaultMode?: 'paste' | 'idea' | 'manual' | null;
  friends?: { id: string; name: string; avatar: string }[];
}) => {
  const { visible, entering, closing, close } = useModalTransition(
    open,
    onClose
  );
  const checkPlaceholder = useMemo(
    () =>
      CHECK_PLACEHOLDERS[Math.floor(Math.random() * CHECK_PLACEHOLDERS.length)],
    []
  );
  const [mode, setMode] = useState<'paste' | 'idea' | 'manual'>('idea');
  const [url, setUrl] = useState('');
  const [idea, setIdea] = useState('');
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [squadSize, setSquadSize] = useState(5);

  // Count tagged co-authors from @mentions in idea text
  const taggedCoAuthorCount = (() => {
    const mentionNames = [...idea.matchAll(/@(\S+)/g)].map((m) =>
      m[1].toLowerCase()
    );
    if (mentionNames.length === 0) return 0;
    return (friends ?? []).filter((f) =>
      mentionNames.some(
        (m) =>
          m === (f as { username?: string }).username?.toLowerCase() ||
          m === f.name.toLowerCase() ||
          m === f.name.split(' ')[0]?.toLowerCase()
      )
    ).length;
  })();
  const minSquadSize = 1 + taggedCoAuthorCount; // author + co-authors

  // Auto-bump squad size if current selection is impossible
  useEffect(() => {
    if (squadSize !== 0 && squadSize < minSquadSize) {
      const options = [3, 4, 5, 6, 8];
      const nextValid = options.find((n) => n >= minSquadSize);
      setSquadSize(nextValid ?? 0);
    }
  }, [minSquadSize, squadSize]);

  // When/where inputs for date+time and location
  const [whenInput, setWhenInput] = useState('');
  const [whereInput, setWhereInput] = useState('');

  // Live-parse the "when" input for date and time
  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;
  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(' ');
  })();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1); // cursor position of @
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState<ScrapedEvent | null>(null);
  const [eventVisibility, setEventVisibility] = useState<'public' | 'friends'>('public');
  const [note, setNote] = useState('');
  const [manual, setManual] = useState({
    title: '',
    venue: '',
    date: '',
    time: '',
    vibe: '',
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const dragging = useRef(false);
  const [socialSignal, setSocialSignal] = useState<{
    totalDown: number;
    friendsDown: number;
  } | null>(null);
  const [checkMovie, setCheckMovie] = useState<CheckMovie | null>(null);
  const [checkMovieLoading, setCheckMovieLoading] = useState(false);
  const checkMovieUrlRef = useRef<string | null>(null);
  const checkMovieLoadingRef = useRef(false);

  // Manual mode: movie search
  const [movieMode, setMovieMode] = useState(false);
  const [manualMovie, setManualMovie] = useState<{
    title: string;
    year: string;
    director: string;
    thumbnail: string;
    url: string;
    vibes: string[];
  } | null>(null);
  const [movieSearching, setMovieSearching] = useState(false);
  const movieSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (defaultMode) setMode(defaultMode);
      if (modalRef.current) {
        modalRef.current.style.transform = 'translateY(0)';
      }
      setTimeout(() => {
        if ((defaultMode || mode) === 'paste') inputRef.current?.focus();
        else ideaRef.current?.focus();
      }, 200);
    }
    if (!open) {
      setUrl('');
      setIdea('');
      setWhenInput('');
      setWhereInput('');
      setLoading(false);
      setScraped(null);
      setEventVisibility('public');
      setNote('');
      setMode('idea');
      setError(null);
      setManual({ title: '', venue: '', date: '', time: '', vibe: '' });
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
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [visible]);

  const [error, setError] = useState<string | null>(null);

  const handlePull = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to scrape post');
        setLoading(false);
        return;
      }

      setScraped({
        title: data.title,
        venue: data.venue,
        date: data.date,
        time: data.time,
        vibe: data.vibe,
        igHandle: data.igHandle || '',
        isPublicPost: data.isPublicPost || false,
        igUrl: data.igUrl,
        diceUrl: data.diceUrl,
        raUrl: data.raUrl,
        thumbnail: data.thumbnail,
      });
      setEventVisibility(data.isPublicPost ? 'public' : 'public');

      // Check for existing event with this IG/Dice URL → social signal
      if (data.igUrl || data.diceUrl || data.raUrl) {
        try {
          const existingEvent = data.igUrl
            ? await db.findEventByIgUrl(data.igUrl)
            : data.diceUrl
              ? await db.findEventByDiceUrl(data.diceUrl)
              : data.raUrl
                ? await db.findEventByRaUrl(data.raUrl)
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
      logError('scrapeEvent', err, { url });
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center">
      <div
        onClick={close}
        className="absolute inset-0 transition-all duration-300 ease-in-out"
        style={{
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: entering || closing ? 'blur(0px)' : 'blur(8px)',
          WebkitBackdropFilter: entering || closing ? 'blur(0px)' : 'blur(8px)',
          opacity: entering || closing ? 0 : 1,
        }}
      />
      <div
        ref={modalRef}
        className="relative w-full bg-surface overflow-y-auto overscroll-contain"
        style={{
          borderRadius: '24px 24px 0 0',
          maxWidth: 420,
          maxHeight: '85dvh',
          WebkitOverflowScrolling: 'touch',
          padding: '0 24px calc(24px + env(safe-area-inset-bottom, 0px))',
          animation: closing ? 'none' : 'slideUp 0.3s ease-out',
          transform: closing ? 'translateY(100%)' : undefined,
          transition: closing
            ? 'transform 0.2s ease-in'
            : dragging.current
              ? 'none'
              : 'transform 0.2s ease-out',
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
              modalRef.current.style.transition = 'none';
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
                modalRef.current.style.transition = 'transform 0.2s ease-out';
                modalRef.current.style.transform = 'translateY(0)';
              }
            }
          }}
          className="pt-5 pb-3 touch-none cursor-grab"
        >
          <div className="w-10 h-1 bg-faint rounded-sm mx-auto" />
        </div>
        {/* Mode toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode('idea')}
            className={cn(
              'flex-1 rounded-lg p-2.5 font-mono text-xs uppercase cursor-pointer',
              mode === 'idea'
                ? 'bg-dt text-on-accent border-none font-bold'
                : 'bg-transparent text-dim border border-border-mid'
            )}
            style={{ letterSpacing: '0.08em' }}
          >
            Interest Check
          </button>
          <button
            onClick={() => setMode('paste')}
            className={cn(
              'flex-1 rounded-lg p-2.5 font-mono text-xs uppercase cursor-pointer',
              mode === 'paste' || mode === 'manual'
                ? 'bg-dt text-on-accent border-none font-bold'
                : 'bg-transparent text-dim border border-border-mid'
            )}
            style={{ letterSpacing: '0.08em' }}
          >
            Save Event
          </button>
        </div>

        {mode === 'paste' && (
          <>
            <div className="flex gap-2 mb-5">
              <textarea
                ref={inputRef}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handlePull();
                  }
                }}
                placeholder="paste link"
                rows={1}
                className="flex-1 min-w-0 bg-deep border border-border-mid rounded-xl px-4 py-3.5 text-primary font-mono text-sm leading-snug outline-none transition-colors duration-200 resize-none overflow-hidden"
                style={{ maxHeight: 100 }}
              />
              <button
                onClick={handlePull}
                className="bg-dt text-on-accent border-none rounded-xl px-5 py-3.5 font-mono text-sm font-bold cursor-pointer"
              >
                {loading ? '...' : 'Pull'}
              </button>
            </div>

            {!loading && !scraped && !error && (
              <div className="p-3 bg-deep rounded-lg mb-3.5 border border-border-light">
                <div className="font-mono text-xs text-muted leading-normal">
                  Paste an Instagram or Dice link to pull event details.
                </div>
              </div>
            )}

            {loading && (
              <div className="text-center p-5 text-dim font-mono text-xs">
                <div
                  className="mx-auto mb-3 rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    border: '2px solid #333',
                    borderTopColor: '#e8ff5a',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                {url.includes('dice.fm')
                  ? 'fetching event details...'
                  : 'scraping event details...'}
              </div>
            )}

            {error && (
              <div
                className="rounded-xl px-4 py-3.5 mb-4"
                style={{
                  background: 'rgba(255,100,100,0.1)',
                  border: '1px solid rgba(255,100,100,0.3)',
                }}
              >
                <div className="font-mono text-xs text-danger mb-2.5">
                  {error}
                </div>
                <button
                  onClick={() => {
                    setMode('manual');
                    setError(null);
                  }}
                  className="bg-transparent text-dt border border-dt rounded-lg px-3.5 py-2 font-mono text-xs cursor-pointer"
                >
                  Enter manually instead
                </button>
              </div>
            )}

            {scraped && (
              <div className="bg-deep rounded-2xl p-5 border border-border-light animate-fade-in">
                <input
                  type="text"
                  value={scraped.title}
                  onChange={(e) =>
                    setScraped({ ...scraped, title: e.target.value })
                  }
                  className="w-full box-border bg-transparent border-none border-b border-b-border-mid rounded-none py-1 px-0 font-serif text-2xl text-primary mb-2 outline-none"
                />
                <div className="flex flex-col gap-2 mb-3">
                  <input
                    type="text"
                    value={scraped.venue === 'TBD' ? '' : scraped.venue}
                    onChange={(e) =>
                      setScraped({ ...scraped, venue: e.target.value })
                    }
                    placeholder="Venue"
                    className="bg-surface border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono text-xs outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={scraped.date === 'TBD' ? '' : scraped.date}
                      onChange={(e) =>
                        setScraped({ ...scraped, date: e.target.value })
                      }
                      placeholder="Date"
                      className="flex-1 min-w-0 bg-surface border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono text-xs outline-none box-border"
                    />
                    <input
                      type="text"
                      value={scraped.time === 'TBD' ? '' : scraped.time}
                      onChange={(e) =>
                        setScraped({ ...scraped, time: e.target.value })
                      }
                      placeholder="Time"
                      className="flex-1 min-w-0 bg-surface border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono text-xs outline-none box-border"
                    />
                  </div>
                  <input
                    type="text"
                    value={scraped.vibe.join(', ')}
                    onChange={(e) =>
                      setScraped({
                        ...scraped,
                        vibe: e.target.value
                          .split(',')
                          .map((v) => v.trim().toLowerCase())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Vibes (comma separated)"
                    className="bg-surface border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono text-xs outline-none"
                  />
                </div>
                {/* Social signal — shows when existing event has people down */}
                {socialSignal && (
                  <div
                    className="flex items-center gap-2 py-2.5 px-3.5 rounded-lg mb-3.5 border border-border"
                    style={{ background: 'rgba(232,255,90,0.06)' }}
                  >
                    <span className="text-sm">👥</span>
                    <span className="font-mono text-xs text-primary">
                      {socialSignal.totalDown}{' '}
                      {socialSignal.totalDown === 1 ? 'person' : 'people'} down
                      {socialSignal.friendsDown > 0 && (
                        <span className="text-dt">
                          {' '}
                          · {socialSignal.friendsDown}{' '}
                          {socialSignal.friendsDown === 1
                            ? 'friend'
                            : 'friends'}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {/* Visibility selector */}
                <div className="flex rounded-lg border border-border-mid overflow-hidden mb-3.5">
                  {([
                    { value: 'public' as const, label: 'Public', desc: 'Everyone on down to' },
                    { value: 'friends' as const, label: 'Friends', desc: 'Friends & friends of friends' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setEventVisibility(opt.value)}
                      className={cn(
                        'flex-1 py-2.5 px-2 border-none cursor-pointer text-center',
                        eventVisibility === opt.value ? 'bg-transparent' : 'bg-transparent',
                        opt.value === 'public' ? 'border-r border-r-border-mid' : ''
                      )}
                      style={{
                        background: eventVisibility === opt.value ? 'rgba(232,255,90,0.08)' : 'transparent',
                        borderRight: opt.value === 'public' ? '1px solid #333' : 'none',
                      }}
                    >
                      <div className={cn(
                        'font-mono text-xs font-bold mb-0.5',
                        eventVisibility === opt.value ? 'text-dt' : 'text-dim'
                      )}>
                        {opt.label}
                      </div>
                      <div className="font-mono text-faint" style={{ fontSize: 9 }}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
                {/* Note input */}
                <input
                  type="text"
                  placeholder="Add a note (e.g. DJ set starts at midnight)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="w-full box-border bg-deep text-primary border border-border-mid rounded-lg py-2.5 px-3 font-mono text-xs mb-3.5 outline-none"
                />
                <button
                  onClick={async () => {
                    const submitted = {
                      ...scraped,
                      note: note.trim() || undefined,
                    };
                    await onSubmit(submitted, eventVisibility);
                    close();
                  }}
                  className="w-full bg-dt text-on-accent border-none rounded-xl py-3.5 font-mono text-sm font-bold cursor-pointer uppercase"
                  style={{ letterSpacing: '0.1em' }}
                >
                  {eventVisibility === 'public'
                    ? 'Save & Share Publicly →'
                    : 'Save & Share with Friends →'}
                </button>
                {(() => {
                  const scrapedDateStr = scraped.date && scraped.date !== 'TBD' ? scraped.date : null;
                  const scrapedParsedDate = scrapedDateStr ? parseNaturalDate(scrapedDateStr) : null;
                  return (
                    <button
                      onClick={() => {
                        if (!scrapedParsedDate) return;
                        const title = scraped.title || 'Event';
                        const timeStr = scraped.time && scraped.time !== 'TBD' ? scraped.time : null;
                        onInterestCheck(
                          sanitize(title, 280),
                          24,
                          scrapedParsedDate.iso,
                          5,
                          undefined,
                          timeStr
                        );
                        close();
                      }}
                      disabled={!scrapedParsedDate}
                      className={cn(
                        'w-full bg-transparent rounded-xl py-3.5 font-mono text-sm font-bold uppercase mt-2',
                        scrapedParsedDate
                          ? 'text-dt border border-dt cursor-pointer'
                          : 'text-dim border border-border-mid cursor-not-allowed'
                      )}
                      style={{ letterSpacing: '0.1em' }}
                    >
                      {scrapedParsedDate ? 'Send as Interest Check →' : 'No date found — can\u2019t send as check'}
                    </button>
                  );
                })()}
                <p className="font-mono text-tiny text-faint mt-2 text-center">
                  sent to your friends & their friends
                </p>
              </div>
            )}
          </>
        )}

        {mode === 'idea' && (
          <>
            <div className="mb-4">
              <p className="font-mono text-xs text-dim mb-3" style={{ lineHeight: 1.6 }}>
                Got an idea? See if your friends are down.
              </p>
              <textarea
                ref={ideaRef}
                value={idea}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 280);
                  setIdea(val);
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
                  const lbMatch =
                    val.match(
                      /https?:\/\/(www\.)?letterboxd\.com\/film\/[a-z0-9-]+\/?/i
                    ) || val.match(/https?:\/\/boxd\.it\/[a-zA-Z0-9]+\/?/i);
                  const detectedUrl = lbMatch ? lbMatch[0] : null;
                  if (
                    detectedUrl &&
                    detectedUrl !== checkMovieUrlRef.current &&
                    !checkMovieLoadingRef.current
                  ) {
                    checkMovieUrlRef.current = detectedUrl;
                    checkMovieLoadingRef.current = true;
                    setCheckMovieLoading(true);
                    const urlToReplace = detectedUrl;
                    fetch(`${API_BASE}/api/scrape`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
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
                          setIdea((prev) =>
                            prev.replace(urlToReplace, '').trim()
                          );
                        }
                      })
                      .catch((err) =>
                        logWarn('checkMovieFetch', 'Failed', { error: err })
                      )
                      .finally(() => {
                        setCheckMovieLoading(false);
                        checkMovieLoadingRef.current = false;
                      });
                  } else if (!detectedUrl && !checkMovie) {
                    checkMovieUrlRef.current = null;
                  }
                }}
                onKeyDown={(e) => {
                  if (mentionQuery !== null && e.key === 'Escape') {
                    setMentionQuery(null);
                    setMentionIdx(-1);
                  }
                }}
                maxLength={280}
                placeholder={checkPlaceholder}
                className="w-full bg-deep border border-border-mid rounded-xl px-4 py-3.5 text-primary font-mono text-sm outline-none resize-none leading-normal box-border"
                style={{ height: 72 }}
              />
              {/* @mention autocomplete dropdown */}
              {mentionQuery !== null &&
                friends &&
                friends.length > 0 &&
                (() => {
                  const filtered = friends.filter((f) =>
                    f.name.toLowerCase().includes(mentionQuery)
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <div className="bg-deep border border-border-mid rounded-lg mt-1 max-h-36 overflow-y-auto">
                      {filtered.slice(0, 6).map((f) => (
                        <button
                          key={f.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            // Replace @query with @Name
                            const before = idea.slice(0, mentionIdx);
                            const after = idea.slice(
                              mentionIdx + 1 + (mentionQuery?.length ?? 0)
                            );
                            setIdea(before + '@' + f.name + ' ' + after);
                            setMentionQuery(null);
                            setMentionIdx(-1);
                            ideaRef.current?.focus();
                          }}
                          className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none cursor-pointer border-b border-b-border"
                        >
                          <div className="w-6 h-6 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-tiny font-bold">
                            {f.avatar}
                          </div>
                          <span className="font-mono text-xs text-primary">
                            {f.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
            </div>
            {/* When / Where inputs */}
            <div className="flex gap-2 mb-1 items-end">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-tiny uppercase text-dim mb-1" style={{ letterSpacing: "0.15em" }}>Date/Time</div>
                <input
                  type="text"
                  placeholder="e.g. tmr 7pm"
                  value={whenInput}
                  onChange={(e) => setWhenInput(e.target.value)}
                  className="w-full py-2.5 px-3 bg-deep rounded-lg font-mono text-xs text-primary outline-none box-border"
                  style={{
                    border: `1px solid ${idea.trim() && !parsedDate ? '#ff6b6b44' : '#333'}`,
                  }}
                />
              </div>
              <div className="min-w-0" style={{ flex: 0.6 }}>
                <div className="font-mono text-tiny uppercase text-dim mb-1" style={{ letterSpacing: "0.15em" }}>Where</div>
                <input
                  type="text"
                  placeholder="location"
                  value={whereInput}
                  onChange={(e) => setWhereInput(e.target.value)}
                  className="w-full py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
                />
              </div>
            </div>
            {whenPreview && (
              <div className="font-mono text-tiny text-dim mb-2" style={{ paddingLeft: 2 }}>
                {whenPreview}
              </div>
            )}
            {!whenPreview && idea.trim() && !parsedDate && (
              <div className="font-mono text-tiny text-danger mb-2" style={{ paddingLeft: 2 }}>
                add a date (e.g. &quot;fri&quot;, &quot;3/14&quot;, &quot;next sat&quot;)
              </div>
            )}
            {!whenPreview && (!idea.trim() || parsedDate) && <div className="mb-2" />}
            {/* Movie preview from detected Letterboxd link */}
            {checkMovieLoading && (
              <div className="flex items-center gap-2 mb-3 py-2.5 px-3 bg-deep rounded-lg border border-border-light">
                <div
                  className="rounded-full shrink-0"
                  style={{
                    width: 16,
                    height: 16,
                    border: '2px solid #333',
                    borderTopColor: '#e8ff5a',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span className="font-mono text-xs text-dim">
                  fetching movie details...
                </span>
              </div>
            )}
            {checkMovie && !checkMovieLoading && (
              <div className="mb-3 p-3 bg-deep rounded-xl border border-border-light animate-fade-in">
                <div className="flex gap-3">
                  {checkMovie.thumbnail && (
                    <img
                      src={checkMovie.thumbnail}
                      alt={checkMovie.title}
                      className="object-cover rounded-lg shrink-0"
                      style={{ width: 60, height: 90 }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="font-serif text-primary leading-tight mb-0.5" style={{ fontSize: 17 }}>
                        {checkMovie.title}
                      </div>
                      <button
                        onClick={() => {
                          setCheckMovie(null);
                          checkMovieUrlRef.current = null;
                        }}
                        className="bg-none border-none text-dim font-mono text-sm cursor-pointer px-0.5 leading-none shrink-0"
                      >
                        ×
                      </button>
                    </div>
                    <div className="font-mono text-xs text-muted mb-1">
                      {checkMovie.year}
                      {checkMovie.director && ` · ${checkMovie.director}`}
                    </div>
                    {checkMovie.vibes && checkMovie.vibes.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {checkMovie.vibes.slice(0, 4).map((v) => (
                          <span
                            key={v}
                            className="text-dt px-1.5 py-0.5 rounded-xl font-mono uppercase"
                            style={{
                              background: '#1f1f1f',
                              fontSize: 9,
                              letterSpacing: '0.08em',
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
            <div className="mb-4">
              <div className="font-mono text-tiny text-dim mb-2 uppercase" style={{ letterSpacing: '0.15em' }}>
                Expires in
              </div>
              <div className="flex gap-2">
                {[
                  { label: '1h', hours: 1 as number | null },
                  { label: '4h', hours: 4 as number | null },
                  { label: '12h', hours: 12 as number | null },
                  { label: '24h', hours: 24 as number | null },
                  { label: '∞', hours: null as number | null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setCheckTimer(opt.hours)}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg font-mono text-xs cursor-pointer transition-all duration-150 ease-in-out',
                      checkTimer === opt.hours
                        ? 'bg-dt text-on-accent border border-dt font-bold'
                        : 'bg-transparent text-muted border border-border-mid'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Squad size picker */}
            <div className="mb-4">
              <div className="font-mono text-tiny text-dim mb-2 uppercase" style={{ letterSpacing: '0.15em' }}>
                Squad size
              </div>
              <div className="flex gap-2">
                {[
                  { label: '3', value: 3 },
                  { label: '4', value: 4 },
                  { label: '5', value: 5 },
                  { label: '6', value: 6 },
                  { label: '8', value: 8 },
                  { label: '\u221e', value: 0 },
                ].map((opt) => {
                  const disabled = opt.value !== 0 && opt.value < minSquadSize;
                  const selected = squadSize === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => !disabled && setSquadSize(opt.value)}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg font-mono text-xs transition-all duration-150 ease-in-out',
                        selected
                          ? 'bg-dt text-on-accent border border-dt font-bold'
                          : disabled
                            ? 'bg-transparent text-faint border border-border cursor-default opacity-40'
                            : 'bg-transparent text-muted border border-border-mid cursor-pointer'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {taggedCoAuthorCount > 0 &&
                (() => {
                  const openSlots =
                    squadSize === 0
                      ? 'unlimited'
                      : Math.max(0, squadSize - minSquadSize);
                  return (
                    <div className="font-mono text-tiny text-dim mt-1.5">
                      {`you + ${taggedCoAuthorCount} tagged · ${openSlots} open slot${openSlots !== 1 && openSlots !== 'unlimited' ? 's' : openSlots === 'unlimited' ? 's' : ''}`}
                    </div>
                  );
                })()}
            </div>
            <button
              onClick={() => {
                if (idea.trim()) {
                  // Parse when input for date and time
                  const eventDate = parsedDate?.iso ?? null;
                  const eventTime = parsedTime ?? null;
                  const location = whereInput.trim() || null;
                  // Extract @mentions → friend IDs (match against username or display name)
                  const mentionNames = [...idea.matchAll(/@(\S+)/g)].map((m) =>
                    m[1].toLowerCase()
                  );
                  const taggedIds = (friends ?? [])
                    .filter((f) =>
                      mentionNames.some(
                        (m) =>
                          m ===
                            (
                              f as { username?: string }
                            ).username?.toLowerCase() ||
                          m === f.name.toLowerCase() ||
                          m === f.name.split(' ')[0]?.toLowerCase()
                      )
                    )
                    .map((f) => f.id);
                  const title = sanitize(idea, 280);
                  onInterestCheck(
                    title,
                    checkTimer,
                    eventDate,
                    squadSize === 0 ? null : squadSize,
                    checkMovie ?? undefined,
                    eventTime,
                    true,
                    true,
                    taggedIds.length > 0 ? taggedIds : undefined,
                    location
                  );
                  close();
                }
              }}
              disabled={!idea.trim() || !parsedDate}
              className={cn(
                'w-full border-none rounded-xl py-3.5 font-mono text-sm font-bold uppercase',
                idea.trim() && parsedDate
                  ? 'bg-dt text-on-accent cursor-pointer'
                  : 'bg-border-mid text-dim cursor-not-allowed'
              )}
              style={{ letterSpacing: '0.1em' }}
            >
              {checkMovie ? 'Send Movie Check →' : 'Send Interest Check →'}
            </button>
            <p className="font-mono text-tiny text-faint mt-3 text-center">
              sent to your friends & their friends
              {checkTimer ? ` · expires in ${checkTimer}h` : ''}
            </p>
          </>
        )}

        {mode === 'manual' && (
          <>
            <div className="mb-4">
              {/* Event / Movie toggle */}
              <div className="flex gap-1.5 mb-3.5">
                {(['EVENT', 'MOVIE'] as const).map((label) => {
                  const active = label === 'MOVIE' ? movieMode : !movieMode;
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        const isMovie = label === 'MOVIE';
                        setMovieMode(isMovie);
                        if (!isMovie) {
                          setManualMovie(null);
                          setMovieSearching(false);
                        }
                      }}
                      className={cn(
                        'flex-1 py-2 rounded-lg font-mono text-xs uppercase cursor-pointer transition-all duration-150 ease-in-out',
                        active
                          ? 'bg-dt text-on-accent border border-dt font-bold'
                          : 'bg-transparent text-muted border border-border-mid'
                      )}
                      style={{ letterSpacing: '0.08em' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="font-mono text-xs text-dim mb-4" style={{ lineHeight: 1.6 }}>
                {movieMode
                  ? 'Search for a movie to create a screening event'
                  : 'Enter event details manually'}
              </p>
              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  value={manual.title}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 100);
                    setManual({ ...manual, title: val });
                    // Movie search: debounce when in movie mode and 3+ chars
                    if (movieMode) {
                      if (movieSearchTimer.current)
                        clearTimeout(movieSearchTimer.current);
                      if (val.trim().length >= 3) {
                        setMovieSearching(true);
                        movieSearchTimer.current = setTimeout(async () => {
                          try {
                            const res = await fetch(`${API_BASE}/api/search-letterboxd`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
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
                  placeholder={
                    movieMode ? 'Movie title (e.g., The Bride)' : 'Event name'
                  }
                  maxLength={100}
                  className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none"
                />
                {/* Movie search loading */}
                {movieMode && movieSearching && (
                  <div className="flex items-center gap-2 py-2.5 px-3 bg-deep rounded-lg border border-border-light">
                    <div
                      className="rounded-full shrink-0"
                      style={{
                        width: 16,
                        height: 16,
                        border: '2px solid #333',
                        borderTopColor: '#e8ff5a',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    <span className="font-mono text-xs text-dim">
                      searching letterboxd...
                    </span>
                  </div>
                )}
                {/* Movie match preview */}
                {movieMode && manualMovie && !movieSearching && (
                  <div className="p-3 bg-deep rounded-xl border border-border-light animate-fade-in">
                    <div className="flex gap-3">
                      {manualMovie.thumbnail && (
                        <img
                          src={manualMovie.thumbnail}
                          alt={manualMovie.title}
                          className="object-cover rounded-lg shrink-0"
                          style={{ width: 60, height: 90 }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="font-serif text-primary leading-tight mb-0.5" style={{ fontSize: 17 }}>
                            {manualMovie.title}
                          </div>
                          <button
                            onClick={() => setManualMovie(null)}
                            className="bg-none border-none text-dim font-mono text-sm cursor-pointer px-0.5 leading-none shrink-0"
                          >
                            ×
                          </button>
                        </div>
                        <div className="font-mono text-xs text-muted mb-1">
                          {manualMovie.year}
                          {manualMovie.director && ` · ${manualMovie.director}`}
                        </div>
                        {manualMovie.vibes && manualMovie.vibes.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {manualMovie.vibes.slice(0, 4).map((v) => (
                              <span
                                key={v}
                                className="text-dt px-1.5 py-0.5 rounded-xl font-mono uppercase"
                                style={{
                                  background: '#1f1f1f',
                                  fontSize: 9,
                                  letterSpacing: '0.08em',
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
                {movieMode &&
                  !manualMovie &&
                  !movieSearching &&
                  manual.title.trim().length >= 3 && (
                    <div className="font-mono text-tiny text-faint py-1 px-0">
                      No match found — you can still save the event manually
                    </div>
                  )}
                <input
                  type="text"
                  value={manual.venue}
                  onChange={(e) =>
                    setManual({
                      ...manual,
                      venue: e.target.value.slice(0, 100),
                    })
                  }
                  placeholder="Venue"
                  maxLength={100}
                  className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none"
                />
                <div className="flex gap-2.5">
                  <input
                    type="text"
                    value={manual.date}
                    onChange={(e) =>
                      setManual({
                        ...manual,
                        date: e.target.value.slice(0, 50),
                      })
                    }
                    placeholder="Date (e.g., Sat, Feb 15)"
                    maxLength={50}
                    className="flex-1 bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none"
                  />
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) =>
                      setManual({
                        ...manual,
                        time: e.target.value.slice(0, 50),
                      })
                    }
                    placeholder="Time"
                    maxLength={50}
                    className="flex-1 bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none"
                  />
                </div>
                {!movieMode && (
                  <input
                    type="text"
                    value={manual.vibe}
                    onChange={(e) =>
                      setManual({
                        ...manual,
                        vibe: e.target.value.slice(0, 100),
                      })
                    }
                    placeholder="Vibes (comma separated, e.g., techno, late night)"
                    maxLength={100}
                    className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none"
                  />
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (manual.title.trim()) {
                  const hasMovie = movieMode && manualMovie;
                  onSubmit(
                    {
                      type: hasMovie ? 'movie' : 'event',
                      title: hasMovie
                        ? `${manualMovie.title} screening`
                        : manual.title,
                      venue: manual.venue || 'TBD',
                      date: manual.date || 'TBD',
                      time: manual.time || 'TBD',
                      vibe: hasMovie
                        ? manualMovie.vibes.length > 0
                          ? manualMovie.vibes
                          : ['film', 'movie night']
                        : manual.vibe
                          ? manual.vibe
                              .split(',')
                              .map((v) => v.trim().toLowerCase())
                          : ['event'],
                      igHandle: '',
                      isPublicPost: false,
                      ...(hasMovie
                        ? {
                            movieTitle: manualMovie.title,
                            year: manualMovie.year,
                            director: manualMovie.director,
                            thumbnail: manualMovie.thumbnail,
                            letterboxdUrl: manualMovie.url,
                          }
                        : {}),
                    },
                    'public'
                  );
                  close();
                }
              }}
              disabled={!manual.title.trim()}
              className={cn(
                'w-full border-none rounded-xl py-3.5 font-mono text-sm font-bold uppercase',
                manual.title.trim()
                  ? 'bg-dt text-on-accent cursor-pointer'
                  : 'bg-border-mid text-dim cursor-not-allowed'
              )}
              style={{ letterSpacing: '0.1em' }}
            >
              {movieMode && manualMovie
                ? 'Save Movie Night →'
                : 'Save to Calendar →'}
            </button>
            <button
              onClick={() => setMode('paste')}
              className="w-full mt-2.5 bg-transparent text-dim border-none p-2.5 font-mono text-xs cursor-pointer"
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
