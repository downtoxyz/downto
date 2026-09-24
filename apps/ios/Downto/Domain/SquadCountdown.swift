// Domain/SquadCountdown.swift — port of GroupsView.tsx's countdown / sort / fading rules (ARCHITECTURE §10.4).
import Foundation

nonisolated enum SquadCountdown {
    static let day: TimeInterval = 24 * 60 * 60

    /// "2026-04-20" + "7:20pm" → that local instant. Date-only → 23:59:59.999 local, so ENDED/PAST don't kick in at local midnight
    /// on the event day itself. (The web parses `T00:00:00` as LOCAL midnight, never `new Date("2026-04-20")` UTC.)
    static func eventStart(date: LocalDate?, time: String?, calendar: Calendar) -> Date? {
        guard let date else { return nil }
        let midnight = date.startOfDay(in: calendar)
        if let time, let m = time.trimmingCharacters(in: .whitespaces).lowercased().wholeMatch(of: /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/) {
            var h = Int(m.1) ?? 0
            let mins = m.2.flatMap { Int($0) } ?? 0
            if m.3 == "pm", h < 12 { h += 12 } else if m.3 == "am", h == 12 { h = 0 }
            return calendar.date(bySettingHour: h, minute: mins, second: 0, of: midnight) ?? midnight.addingTimeInterval(TimeInterval(h * 3600 + mins * 60))
        }
        let endOfDay = calendar.date(bySettingHour: 23, minute: 59, second: 59, of: midnight) ?? midnight.addingTimeInterval(day - 1)
        return endOfDay.addingTimeInterval(0.999)
    }

    /// eventStart ?? lastActivityAt ?? .distantFuture (web: Number.MAX_SAFE_INTEGER).
    static func sortKey(eventStart: Date?, lastActivityAt: Date?) -> Date {
        eventStart ?? lastActivityAt ?? .distantFuture
    }

    /// FADING ✶: it has been more than 24 h since the event time, or the squad is within 24 h of its own expiry.
    static func isFading(eventStart: Date?, expiresAt: Date?, now: Date) -> Bool {
        if let eventStart, now.timeIntervalSince(eventStart) > day { return true }
        if let expiresAt, expiresAt.timeIntervalSince(now) < day { return true }
        return false
    }

    nonisolated struct Countdown: Hashable, Sendable {
        let label: String
        let sub: String?
        let urgent: Bool

        init(label: String, sub: String?, urgent: Bool) {
            self.label = label
            self.sub = sub
            self.urgent = urgent
        }
    }

    /// JS `Math.round`: half rounds toward +∞ (only ever applied to non-negative values here, but kept exact anyway).
    static func jsRound(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

    /// nil start → nil; past && status != .locked → nil (a flexible check's placeholder date is not a commitment);
    /// < −24 h → PAST; < 0 → ENDED; < 1 h → "{max(1, min)}m · from now" urgent; < 24 h → "{h}h · from now" urgent if h < 6;
    /// < 7 d → "{d}d" sub "tomorrow"/"away"; < 30 d → "{w}w · away"; else "{mo}mo · away" — all Math.round.
    static func countdown(eventStart: Date?, dateStatus: DateStatus?, now: Date) -> Countdown? {
        guard let eventStart else { return nil }
        let diff = eventStart.timeIntervalSince(now)
        let diffMin = jsRound(diff / 60)
        let diffHr = jsRound(diff / 3600)
        let diffDay = jsRound(diff / day)

        if diff < 0 && dateStatus != .locked { return nil }
        if diff < -day { return Countdown(label: "PAST", sub: nil, urgent: false) }
        if diff < 0 { return Countdown(label: "ENDED", sub: nil, urgent: false) }
        if diffHr < 1 { return Countdown(label: "\(max(1, diffMin))m", sub: "from now", urgent: true) }
        if diffHr < 24 { return Countdown(label: "\(diffHr)h", sub: "from now", urgent: diffHr < 6) }
        if diffDay < 7 { return Countdown(label: "\(diffDay)d", sub: diffDay == 1 ? "tomorrow" : "away", urgent: false) }
        if diffDay < 30 { return Countdown(label: "\(jsRound(Double(diffDay) / 7))w", sub: "away", urgent: false) }
        return Countdown(label: "\(jsRound(Double(diffDay) / 30))mo", sub: "away", urgent: false)
    }

    // MARK: Sections (GroupsView: NEW MESSAGES / UPCOMING / FADING ✶)

    nonisolated struct Sections<Row: Sendable>: Sendable {
        let newMessages: [Row]
        let upcoming: [Row]
        let fading: [Row]

        /// Headers are drawn only when at least two buckets are non-empty (parity).
        var showHeaders: Bool {
            [newMessages, upcoming, fading].filter { !$0.isEmpty }.count > 1
        }
    }

    /// hasUnread → NEW MESSAGES; else isFading → FADING; else UPCOMING; each sorted by `sortKey` ascending (stable).
    static func sections<Row: Sendable>(
        _ rows: [Row],
        now: Date,
        hasUnread: (Row) -> Bool,
        eventStart: (Row) -> Date?,
        lastActivityAt: (Row) -> Date?,
        expiresAt: (Row) -> Date?
    ) -> Sections<Row> {
        var newMessages: [Row] = [], fading: [Row] = [], upcoming: [Row] = []
        for r in rows {
            if hasUnread(r) { newMessages.append(r) }
            else if isFading(eventStart: eventStart(r), expiresAt: expiresAt(r), now: now) { fading.append(r) }
            else { upcoming.append(r) }
        }
        func key(_ r: Row) -> Date { sortKey(eventStart: eventStart(r), lastActivityAt: lastActivityAt(r)) }
        return Sections(newMessages: newMessages.sorted { key($0) < key($1) },
                        upcoming: upcoming.sorted { key($0) < key($1) },
                        fading: fading.sorted { key($0) < key($1) })
    }
}
