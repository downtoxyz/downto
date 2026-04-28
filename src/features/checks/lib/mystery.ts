/**
 * Mystery-check reveal logic, factored out of transformCheck so it can be
 * unit-tested without dragging in React. Mirrors the spec encoded in the
 * 20260427000001_mystery_checks.sql migration:
 *
 *   - mystery=false → never redacted (existing checks behave unchanged)
 *   - mystery=true → two redactions, both lifted at reveal time:
 *       • author identity hidden from non-authors (isMysteryUnrevealed)
 *       • responder list hidden from EVERYONE incl. the author
 *         (isMysteryGuestsHidden) — total ritual; the host doesn't get to
 *         peek at who's in before reveal.
 *   - the author of a mystery check always sees their own NAME unredacted,
 *     but still can't see who's down until reveal.
 */

/** YYYY-MM-DD in the viewer's local tz; matches how event_date is stored. */
export function localTodayISO(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export interface MysteryRevealInput {
  mystery: boolean;
  authorId: string;
  /** YYYY-MM-DD or null. Mystery=true rows always have this set per the DB
   *  CHECK constraint, but we still tolerate null defensively. */
  eventDate: string | null;
}

/**
 * Should this check be shown in redacted form to the given viewer right now?
 *
 * Returns true iff the check is mystery, the viewer is not the author, and
 * the event date is still in the future (in the viewer's local tz). The
 * author always sees their own check unredacted regardless of date.
 *
 * `userId` may be null for logged-out viewers — they're treated as
 * non-authors, so unrevealed mystery checks stay redacted.
 */
export function isMysteryUnrevealed(
  check: MysteryRevealInput,
  userId: string | null,
  now: Date,
): boolean {
  if (!check.mystery) return false;
  if (userId !== null && check.authorId === userId) return false;
  if (!check.eventDate) return true;
  return check.eventDate > localTodayISO(now);
}

/**
 * Should the responder list be hidden right now, even from the author?
 *
 * Returns true while a mystery check is pre-reveal, regardless of who's
 * viewing. The host doesn't get to peek at who's down before the day-of —
 * everyone (including them) finds out at the same moment. This is the
 * "total ritual" knob; `isMysteryUnrevealed` only governs author identity.
 */
export function isMysteryGuestsHidden(
  check: Pick<MysteryRevealInput, 'mystery' | 'eventDate'>,
  now: Date,
): boolean {
  if (!check.mystery) return false;
  if (!check.eventDate) return true;
  return check.eventDate > localTodayISO(now);
}
