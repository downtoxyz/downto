// Date/time parsing + span helpers + stripDateTimeText now live in
// `@/lib/dateParse`. utils.ts is for everything else: string sanitizers,
// relative-time formatting, and any future general helpers that don't
// have a more specific home.

/** Strip HTML tags and trim whitespace */
export const sanitize = (s: string, maxLen = 200): string =>
  s.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);

/** Sanitize an array of vibe tags */
export const sanitizeVibes = (vibes: string[]): string[] =>
  vibes
    .map((v) => sanitize(v, 30).toLowerCase().replace(/[^a-z0-9 -]/g, ""))
    .filter((v) => v.length > 0)
    .slice(0, 5);

/** Format a date as relative time ago (e.g., "2h", "5m", "now") */
export const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "now";
};
