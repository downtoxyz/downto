// Domain/Mystery.swift — exact port of src/features/checks/lib/mystery.ts (ARCHITECTURE §9.1).
//
//   - mystery=false → never redacted
//   - mystery=true  → author identity hidden from non-authors (isUnrevealed) and the responder list hidden from EVERYONE,
//                     the author included (isGuestsHidden) — both lifted at local midnight of `event_date`.
// Reveal happens ON the event date (`>` not `>=`), in the viewer's local calendar.
import Foundation

nonisolated enum Mystery {
    /// YYYY-MM-DD in the viewer's local calendar; mirrors `localTodayISO(now)` (getFullYear/getMonth/getDate, never toISOString).
    static func localToday(_ now: Date, calendar: Calendar) -> LocalDate {
        LocalDate(now, calendar: calendar)
    }

    /// Should this check be shown in redacted form to `viewer` right now?
    /// `viewer == nil` is a logged-out viewer — by definition not the author, so an unrevealed mystery check stays redacted.
    /// A missing `eventDate` on a mystery row (unreachable under the DB CHECK) fails safe: still hidden.
    static func isUnrevealed(mystery: Bool, authorId: UserID, eventDate: LocalDate?, viewer: UserID?, now: Date, calendar: Calendar) -> Bool {
        if !mystery { return false }
        if let viewer, viewer == authorId { return false }
        guard let eventDate else { return true }
        return eventDate > localToday(now, calendar: calendar)
    }

    /// Should the responder list be hidden right now, even from the author? ("guests revealed on the day")
    static func isGuestsHidden(mystery: Bool, eventDate: LocalDate?, now: Date, calendar: Calendar) -> Bool {
        if !mystery { return false }
        guard let eventDate else { return true }
        return eventDate > localToday(now, calendar: calendar)
    }
}
