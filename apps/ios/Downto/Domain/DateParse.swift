// Domain/DateParse.swift — function-for-function port of src/lib/dateParse.ts (ARCHITECTURE §10.1).
//
// Same function order and comment headers as the TS so the two files diff side by side. Differences, all deliberate:
//   • `now` and `Calendar` are injected (the TS reads `new Date()` inline; its tests use fake timers). Production passes `.now` / `.current`.
//   • Regexes are Swift `Regex` literals with JS semantics restored via `.js` (ASCII `\b` / `\w` / `\d`, case-insensitive) — the TS
//     lowercases the whole string first; matching case-insensitively on the ORIGINAL keeps span indices valid on the original text.
//   • `new Date(withYear)` ("whatever V8 accepts") in `tryParseSingle` is replaced by the explicit shape list in `parseExplicit` — see there.
//   • Labels are built by hand ("Fri, May 1") instead of `toLocaleDateString("en-US", {weekday:"short", month:"short", day:"numeric"})`.
//   • JS `split(/(?<!\d)\/(?!\d)/)` needs lookbehind, which Swift Regex lacks; `splitSegments` does the same cut by hand.
//
// Timezone notes (load-bearing, same as the TS): all output is a LocalDate computed from the calendar's year/month/day — never from
// an ISO-8601 instant, which would shift dates across UTC midnight. "today"/"tomorrow"/"in N days" are anchored on `now` in `calendar`.
import Foundation

extension Regex {
    /// JS regex semantics: ASCII `\b`, `\w`, `\d`; case-insensitive (the TS lowercases before matching).
    nonisolated var js: Regex<Output> {
        wordBoundaryKind(.simple).asciiOnlyWordCharacters().asciiOnlyDigits().ignoresCase()
    }
}

nonisolated enum DateParse {
    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// Format a Date as YYYY-MM-DD in the calendar's time zone (avoids UTC date-shift).
    static func toLocalISODate(_ d: Date, calendar: Calendar) -> LocalDate {
        LocalDate(d, calendar: calendar)
    }

    static let dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    /// 1-based months (the TS map is 0-based for `new Date(y, m, d)`; LocalDate is 1-based).
    static let monthNames: [String: Int] = [
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
        "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8,
        "sep": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    ]
    static let shortDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    static let shortMonthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// JS `getDay()`: 0 = Sunday.
    private static func weekday(_ d: Date, _ cal: Calendar) -> Int { cal.component(.weekday, from: d) - 1 }

    /// JS `d.setDate(d.getDate() + n)`: same wall-clock time, n calendar days later.
    private static func addDays(_ n: Int, to d: Date, _ cal: Calendar) -> Date {
        cal.date(byAdding: .day, value: n, to: d) ?? d.addingTimeInterval(TimeInterval(n) * 86_400)
    }

    /// JS `d.setMonth(d.getMonth() + n, 1)`: first of the month n months on, same wall-clock time; month overflow rolls the year.
    private static func addMonthsToFirst(_ n: Int, of d: Date, _ cal: Calendar) -> Date {
        var c = cal.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: d)
        let m0 = (c.month ?? 1) - 1 + n
        c.year = (c.year ?? 1970) + Int((Double(m0) / 12).rounded(.down))
        c.month = ((m0 % 12) + 12) % 12 + 1
        c.day = 1
        return cal.date(from: c) ?? d
    }

    /// JS `new Date(year, month, day)`: local midnight, with day overflow rolling into the next month (Feb 31 → Mar 3).
    private static func localMidnight(year: Int, month: Int, day: Int, _ cal: Calendar) -> Date {
        let first = LocalDate(year: year, month: month, day: 1).startOfDay(in: cal)
        return addDays(day - 1, to: first, cal)
    }

    /// JS `d.setFullYear(y)`: same month/day/time in another year (Feb 29 rolls to Mar 1, like JS).
    private static func setYear(_ year: Int, of d: Date, _ cal: Calendar) -> Date {
        var c = cal.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: d)
        c.year = year
        return cal.date(from: c) ?? d
    }

    /// `toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })` → "Fri, May 1".
    static func label(_ d: Date, calendar cal: Calendar) -> String {
        let c = cal.dateComponents([.month, .day], from: d)
        return "\(shortDayLabels[weekday(d, cal)]), \(shortMonthLabels[(c.month ?? 1) - 1]) \(c.day ?? 1)"
    }

    // ── Single-date parsers (verbatim from utils.ts, behavior-preserving) ──────

    /// The explicit shapes `tryParseSingle` accepts, in order (ARCHITECTURE §10.1). Documented here; `DateParseTests` enumerates them.
    /// An optional weekday prefix ("Sat, " / "Sat ") is skipped and never validated — V8 ignores a mismatched weekday too.
    /// Shapes without a year take `year` and are rolled forward by the caller's 2-month rule; `M/d/yy` is 2000+yy below 50, else 1900+yy.
    static let explicitShapes = ["MMM d yyyy", "MMMM d yyyy", "EEE, MMM d yyyy", "EEE MMM d yyyy", "M/d/yyyy", "M/d/yy", "MMM d", "MMMM d", "M/d"]

    private static func monthNumber(_ name: String) -> Int? {
        let n = name.lowercased()
        if let m = monthNames[n] { return m }
        guard n.count >= 3 else { return nil }
        return monthNames.first { $0.key.count > 3 && $0.key.hasPrefix(n) }?.value   // "sept", "febr", …
    }

    /// Replaces `new Date(withYear)`. Returns the local-midnight instant and whether the input carried its own year.
    private static func parseExplicit(_ input: String, year: Int, _ cal: Calendar) -> (date: Date, explicitYear: Bool)? {
        let s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        // "Feb 15", "February 15", "Sat, Feb 15", "Sat Feb 15", "Feb 15 2027", "Feb 15, 2027"
        let named = /^(?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+)?([a-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.js
        if let m = s.wholeMatch(of: named), let month = monthNumber(String(m.1)), let day = Int(m.2), (1...31).contains(day) {
            let y = m.3.flatMap { Int($0) }
            return (localMidnight(year: y ?? year, month: month, day: day, cal), y != nil)
        }
        // "2/15", "3/19", "2/15/26", "2/15/2026"
        let slashed = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.js
        if let m = s.wholeMatch(of: slashed), let month = Int(m.1), let day = Int(m.2), (1...12).contains(month), (1...31).contains(day) {
            var y: Int? = m.3.flatMap { Int($0) }
            if let yy = y, m.3?.count == 2 { y = yy < 50 ? 2000 + yy : 1900 + yy }
            return (localMidnight(year: y ?? year, month: month, day: day, cal), y != nil)
        }
        return nil
    }

    /// Try to parse a human date string like "Sat, Feb 15" or "tonight" into YYYY-MM-DD.
    static func parseDateToISO(_ display: String, now: Date, calendar cal: Calendar) -> LocalDate? {
        if display.isEmpty || display == "TBD" { return nil }
        let lower = display.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let today = now

        if lower == "tonight" || lower == "today" || lower == "tn" {
            return toLocalISODate(today, calendar: cal)
        }
        if lower == "tomorrow" {
            return toLocalISODate(addDays(1, to: today, cal), calendar: cal)
        }

        // Try "Feb 15", "February 15", "Sat, Feb 15", "2/15", "3/19", etc.
        let year = cal.component(.year, from: today)

        func tryParseSingle(_ input: String) -> LocalDate? {
            // Strip ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
            let cleaned = input.replacing(/(\d+)(st|nd|rd|th)\b/.js) { String($0.1) }
            guard let r = parseExplicit(cleaned, year: year, cal) else { return nil }
            var d = r.date
            let explicitYear = r.explicitYear
            // If the date is more than 2 months in the past, assume next year
            let twoMonthsAgo = cal.date(byAdding: .month, value: -2, to: today) ?? today.addingTimeInterval(-61 * 86_400)
            if !explicitYear && d < twoMonthsAgo {
                d = setYear(year + 1, of: d, cal)
            }
            return toLocalISODate(d, calendar: cal)
        }

        // Try the full string first
        if let direct = tryParseSingle(display) { return direct }

        // Handle date ranges: "Mar 25 – Mar 28", "Feb 14 - Feb 16", "3/25 – 3/28"
        let parts = display.split(separator: /\s*[–—-]\s*/, omittingEmptySubsequences: false)
        if parts.count >= 2 {
            if let first = tryParseSingle(String(parts[0]).trimmingCharacters(in: .whitespaces)) { return first }
        }

        return nil
    }

    /// Todoist-style: scan free text for date phrases, return (label, iso) or nil.
    static func parseNaturalDate(_ text: String, now: Date, calendar cal: Calendar) -> (label: String, iso: LocalDate)? {
        let lower = text
        let today = now
        let todayDay = weekday(today, cal)

        func fmt(_ d: Date) -> LocalDate { toLocalISODate(d, calendar: cal) }
        func lbl(_ d: Date) -> String { label(d, calendar: cal) }
        func result(_ d: Date) -> (label: String, iso: LocalDate) { (lbl(d), fmt(d)) }

        // "tonight" / "today" / "tn"
        if lower.contains(/\b(tonight|today|tn)\b/.js) {
            return ("Today", fmt(today))
        }
        // "tomorrow" / "tmrw" / "tmr"
        if lower.contains(/\b(tomorrow|tmrw|tmr)\b/.js) {
            return result(addDays(1, to: today, cal))
        }
        // "this weekend"
        if lower.contains(/\bthis weekend\b/.js) {
            var daysToSat = (6 - todayDay + 7) % 7
            if daysToSat == 0 { daysToSat = 7 }
            return result(addDays(todayDay == 6 ? 0 : daysToSat, to: today, cal))
        }
        // "next weekend"
        if lower.contains(/\bnext weekend\b/.js) {
            var daysToSat = (6 - todayDay + 7) % 7
            if daysToSat == 0 { daysToSat = 7 }
            var d = addDays(daysToSat + (todayDay <= 0 ? 6 : 0), to: today, cal)
            if d.timeIntervalSince(today) < 7 * 86_400 { d = addDays(7, to: d, cal) }
            return result(d)
        }
        // "in N days"
        if let m = lower.firstMatch(of: /\bin (\d+) days?\b/.js), let n = Int(m.1) {
            return result(addDays(n, to: today, cal))
        }
        // "in a week" / "next week"
        if lower.contains(/\b(in a week|next week)\b/.js) {
            return result(addDays(7, to: today, cal))
        }
        // "in N weeks" / "in two weeks" etc.
        if let m = lower.firstMatch(of: /\bin (\d+|two|three|four) weeks?\b/.js) {
            let wordToNum = ["two": 2, "three": 3, "four": 4]
            let n = wordToNum[String(m.1).lowercased()] ?? Int(m.1) ?? 0
            if n > 0 {
                return result(addDays(n * 7, to: today, cal))
            }
        }
        // "next month"
        if lower.contains(/\bnext month\b/.js) {
            return result(addMonthsToFirst(1, of: today, cal))
        }
        // "in N months"
        if let m = lower.firstMatch(of: /\bin (\d+|two|three) months?\b/.js) {
            let wordToNum = ["two": 2, "three": 3]
            let n = wordToNum[String(m.1).lowercased()] ?? Int(m.1) ?? 0
            if n > 0 {
                return result(addMonthsToFirst(n, of: today, cal))
            }
        }
        // "next [day]" — skip this week
        if let m = lower.firstMatch(of: /\bnext (mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js) {
            let key = String(m.1).lowercased().prefix(3)
            if let targetDay = dayNames.firstIndex(where: { $0.hasPrefix(key) }) {
                var diff = (targetDay - todayDay + 7) % 7
                if diff == 0 { diff = 7 }
                return result(addDays(diff + 7, to: today, cal))
            }
        }
        // "this [day]" — if today matches, interpret as today
        if let m = lower.firstMatch(of: /\bthis (mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js) {
            let key = String(m.1).lowercased().prefix(3)
            if let targetDay = dayNames.firstIndex(where: { $0.hasPrefix(key) }) {
                let diff = (targetDay - todayDay + 7) % 7
                return result(addDays(diff, to: today, cal))
            }
        }
        // Explicit numeric dates — checked BEFORE bare day name so "thurs 4/16" uses 4/16 not "thurs"
        // "feb 20" / "february 20th" / "mar 5"
        if let m = lower.firstMatch(of: /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/.js) {
            let month = monthNames[String(String(m.1).lowercased().prefix(3))]
            let day = Int(m.2) ?? 0
            if let month, day >= 1, day <= 31 {
                var d = localMidnight(year: cal.component(.year, from: today), month: month, day: day, cal)
                if d.timeIntervalSince(today) < -14 * 86_400 { d = setYear(cal.component(.year, from: d) + 1, of: d, cal) }
                return result(d)
            }
        }
        // "1/20" / "2/14" / "12/25" — NOT "1/20/2026" time-like patterns etc.
        if let m = lower.firstMatch(of: /\b(\d{1,2})\/(\d{1,2})\b/.js) {
            let month = (Int(m.1) ?? 0)
            let day = Int(m.2) ?? 0
            if month >= 1, month <= 12, day >= 1, day <= 31 {
                var d = localMidnight(year: cal.component(.year, from: today), month: month, day: day, cal)
                if d.timeIntervalSince(today) < -14 * 86_400 { d = setYear(cal.component(.year, from: d) + 1, of: d, cal) }
                return result(d)
            }
        }
        // Bare day name — "friday", "sat", "sun", etc. (today if matches, else next occurrence)
        if let m = lower.firstMatch(of: /\b(mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js) {
            // Skip "the sun" / "a sun" — article + "sun" isn't referring to Sunday
            let before = lower[..<m.range.lowerBound]
            let isFalseSun = String(m.1).lowercased() == "sun" && before.contains(/\b(the|a)\s+$/.js)
            if !isFalseSun {
                let key = String(m.1).lowercased().prefix(3)
                if let targetDay = dayNames.firstIndex(where: { $0.hasPrefix(key) }) {
                    let diff = (targetDay - todayDay + 7) % 7
                    return result(addDays(diff, to: today, cal))
                }
            }
        }
        return nil
    }

    /// Scan free text for time phrases, return display string like "7pm" or nil.
    static func parseNaturalTime(_ text: String) -> String? {
        let lower = text

        // "noon"
        if lower.contains(/\bnoon\b/.js) { return "12pm" }
        // "midnight"
        if lower.contains(/\bmidnight\b/.js) { return "12am" }

        // "at 7", "at 7pm", "at 7 pm", "at 7:30", "at 7:30pm" — "at" prefix makes it a time
        if let m = lower.firstMatch(of: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.js) {
            return formatTimeMatch(Int(m.1) ?? 0, m.2.map { String($0) }, m.3.map { String($0).lowercased() })
        }

        // "420pm", "730am", "1230pm" — compact H(H)MM format, no colon
        if let m = lower.firstMatch(of: /\b(\d{1,2})(\d{2})\s*(am|pm)\b/.js) {
            let hour = Int(m.1) ?? 0
            let minutes = String(m.2)
            if hour >= 1, hour <= 12, (Int(minutes) ?? 60) < 60 {
                return formatTimeMatch(hour, minutes, String(m.3).lowercased())
            }
        }

        // "7pm", "7 pm", "7:30pm", "7:30 pm" — requires explicit am/pm (no false positives on dates)
        if let m = lower.firstMatch(of: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.js) {
            return formatTimeMatch(Int(m.1) ?? 0, m.2.map { String($0) }, String(m.3).lowercased())
        }

        return nil
    }

    private static func formatTimeMatch(_ rawHour: Int, _ minutes: String?, _ meridiem: String?) -> String? {
        if rawHour == 0 || rawHour > 12 { return nil }
        let suffix = meridiem ?? "pm"
        if let minutes, minutes != "00" { return "\(rawHour):\(minutes)\(suffix)" }
        return "\(rawHour)\(suffix)"
    }

    // ── Multi-date orchestrator ─────────────────────────────────────────────────

    nonisolated struct ParsedWhen: Hashable, Sendable {
        /// Every date the user implied, in input order, deduped.
        var dates: [LocalDate]
        /// Display time like "7pm" / "12am". Single value — applies to all dates.
        var time: String?
        /// Original input (trimmed) for echoing back in chips/UI.
        var label: String?

        init(dates: [LocalDate] = [], time: String? = nil, label: String? = nil) {
            self.dates = dates
            self.time = time
            self.label = label
        }
    }

    /// JS `dateText.split(/\s+or\s+|\s+\/\s+|(?<!\d)\/(?!\d)/i)`, cut by hand (no lookbehind in Swift Regex):
    /// 1. `\s+or\s+` — "thurs or fri"; 2. `\s+/\s+` — "5/9 / 6/7"; 3. a bare "/" with no digit on either side — "thurs/fri" (never "5/9").
    static func splitSegments(_ s: String) -> [String] {
        var segments: [String] = []
        var cursor = s.startIndex
        for m in s.matches(of: /\s+or\s+|\s+\/\s+|\//.js) {
            if m.output == "/" {
                let prev = m.range.lowerBound > s.startIndex ? s[s.index(before: m.range.lowerBound)] : nil
                let next = m.range.upperBound < s.endIndex ? s[m.range.upperBound] : nil
                if prev?.isASCIIDigit == true || next?.isASCIIDigit == true { continue }
            }
            segments.append(String(s[cursor..<m.range.lowerBound]))
            cursor = m.range.upperBound
        }
        segments.append(String(s[cursor...]))
        return segments
    }

    /// Splits compound inputs ("thurs or fri", "thurs/fri") and parses each segment as a date. Time is parsed from the whole
    /// string since "thurs or fri at 7pm" applies the time to both. Falls back to the stricter parseDateToISO on segments that
    /// parseNaturalDate doesn't catch (e.g. "Sat, Feb 15"). Empty `dates` = "no date".
    static func parseWhen(_ input: String, now: Date, calendar cal: Calendar) -> ParsedWhen {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return ParsedWhen(dates: [], time: nil, label: nil) }

        let time = parseNaturalTime(trimmed)

        // Strip the time portion before splitting so a stray "at 7pm" segment doesn't get fed to the date parser as its own
        // chunk. Only the first match — same scope parseNaturalTime uses.
        var dateText = trimmed
        let timeStripPatterns: [Regex<Substring>] = [
            /\b(?:at\s+)?(?:noon|midnight)\b/.js,
            /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/.js,
            /\b\d{1,2}\d{2}\s*(?:am|pm)\b/.js,           // "420pm"
            /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.js,     // "7pm" / "7:30pm"
        ]
        for re in timeStripPatterns {
            if let m = dateText.firstMatch(of: re) {
                dateText = (String(dateText[..<m.range.lowerBound]) + String(dateText[m.range.upperBound...])).trimmingCharacters(in: .whitespacesAndNewlines)
                break
            }
        }

        // Split on " or " and "/". Comma is NOT a separator — it collides with "Sat, Feb 15" where the comma is structural.
        let segments = splitSegments(dateText)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var seen = Set<LocalDate>()
        var dates: [LocalDate] = []
        let hasDigit = /\d/.js
        for seg in segments {
            var isoDate = parseNaturalDate(seg, now: now, calendar: cal)?.iso
            // Only fall back to parseDateToISO when the segment has at least one digit (the TS guards V8's loose Date
            // constructor this way; the Swift parseDateToISO is strict anyway, but the guard is kept for parity).
            if isoDate == nil, seg.contains(hasDigit) {
                isoDate = parseDateToISO(seg, now: now, calendar: cal)
            }
            if let isoDate, !seen.contains(isoDate) {
                seen.insert(isoDate)
                dates.append(isoDate)
            }
        }

        // If nothing parsed segment-wise, take one more pass on the whole string — covers "Sat, Feb 15".
        if dates.isEmpty {
            var whole = parseNaturalDate(trimmed, now: now, calendar: cal)?.iso
            if whole == nil, trimmed.contains(hasDigit) {
                whole = parseDateToISO(trimmed, now: now, calendar: cal)
            }
            if let whole { dates.append(whole) }
        }

        return ParsedWhen(dates: dates, time: time, label: trimmed.isEmpty ? nil : trimmed)
    }

    // ── Span-finding helpers (for inline highlighting) ─────────────────────────

    nonisolated struct TextSpan: Equatable, Sendable {
        nonisolated enum Kind: Hashable, Sendable { case date, time, location }
        let range: Range<String.Index>
        let kind: Kind

        init(range: Range<String.Index>, kind: Kind) {
            self.range = range
            self.kind = kind
        }
    }

    /// Parse a location from text, e.g. "dinner at Jollibee" → "Jollibee". Disabled: parsing not reliable yet (returns nil, parity).
    static func parseNaturalLocation(_ text: String) -> String? {
        nil
    }

    /// Find the position of the first date phrase in text (mirrors parseNaturalDate priority).
    static func findDateSpan(_ text: String, now: Date, calendar cal: Calendar) -> TextSpan? {
        let lower = text

        // Order matches parseNaturalDate priority; day regex matches the parser's (includes thurs/tues/weds informal forms).
        let patterns: [Regex<Substring>] = [
            /\b(?:tonight|today|tn)\b/.js,
            /\b(?:tomorrow|tmrw|tmr)\b/.js,
            /\bthis weekend\b/.js,
            /\bnext weekend\b/.js,
            /\bin \d+ days?\b/.js,
            /\b(?:in a week|next week)\b/.js,
            /\bin (?:\d+|two|three|four) weeks?\b/.js,
            /\bnext month\b/.js,
            /\bin (?:\d+|two|three) months?\b/.js,
            /\bnext (?:mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js,
            /\bthis (?:mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js,
            /\b(?:mon|tue|tues|wed|weds|thu|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.js,
            /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/.js,
            /\b\d{1,2}\/\d{1,2}\b/.js,
        ]

        for pattern in patterns {
            if let m = lower.firstMatch(of: pattern) {
                // Verify parseNaturalDate would actually parse this
                if parseNaturalDate(text, now: now, calendar: cal) != nil {
                    return TextSpan(range: m.range, kind: .date)
                }
            }
        }
        return nil
    }

    /// Find the position of the first time phrase in text (mirrors parseNaturalTime priority).
    static func findTimeSpan(_ text: String) -> TextSpan? {
        let lower = text

        // "noon" / "midnight" — include "at " prefix if present
        if let m = lower.firstMatch(of: /\bat\s+noon\b|\bnoon\b/.js) {
            return TextSpan(range: m.range, kind: .time)
        }
        if let m = lower.firstMatch(of: /\bat\s+midnight\b|\bmidnight\b/.js) {
            return TextSpan(range: m.range, kind: .time)
        }

        // "at 7", "at 7pm", "at 7:30pm"
        if let m = lower.firstMatch(of: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.js) {
            let hour = Int(m.1) ?? 0
            if hour >= 1, hour <= 12 {
                return TextSpan(range: m.range, kind: .time)
            }
        }

        // "420pm", "730am", "1230pm" — compact H(H)MM format
        if let m = lower.firstMatch(of: /\b(\d{1,2})(\d{2})\s*(am|pm)\b/.js) {
            let hour = Int(m.1) ?? 0
            let mins = Int(m.2) ?? 60
            if hour >= 1, hour <= 12, mins < 60 {
                return TextSpan(range: m.range, kind: .time)
            }
        }

        // "7pm", "7:30pm"
        if let m = lower.firstMatch(of: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.js) {
            let hour = Int(m.1) ?? 0
            if hour >= 1, hour <= 12 {
                return TextSpan(range: m.range, kind: .time)
            }
        }

        return nil
    }

    /// Find the position of the "at {location}" phrase in text (mirrors parseNaturalLocation — nil while that is disabled).
    static func findLocationSpan(_ text: String) -> TextSpan? {
        guard parseNaturalLocation(text) != nil else { return nil }

        let lower = text
        let timeWords = /^(noon|midnight|night|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/.js
        let atRe = /\bat\s+(.+?)(?:\s*[·|,]|\s+(?:on|at|around|from|with)\s|\s*$)/.js
        guard let m = lower.firstMatch(of: atRe) else { return nil }

        let candidate = String(m.1).trimmingCharacters(in: .whitespacesAndNewlines)
        if candidate.contains(timeWords) { return nil }
        if candidate.count < 2 { return nil }

        guard let atPrefix = lower[m.range.lowerBound...].prefixMatch(of: /at\s+/.js) else { return nil }
        let start = m.range.lowerBound
        let end = lower.index(atPrefix.range.upperBound, offsetBy: candidate.count, limitedBy: lower.endIndex) ?? lower.endIndex
        return TextSpan(range: start..<end, kind: .location)
    }

    /// Find all date/time/location spans in text, sorted by position.
    static func findDateTimeSpans(_ text: String, now: Date, calendar cal: Calendar) -> [TextSpan] {
        var spans: [TextSpan] = []
        if let dateSpan = findDateSpan(text, now: now, calendar: cal) { spans.append(dateSpan) }
        if let timeSpan = findTimeSpan(text) { spans.append(timeSpan) }
        // Remove overlaps between date and time: keep the first (date has priority)
        if spans.count == 2 {
            let (a, b) = (spans[0], spans[1])
            if a.range.lowerBound < b.range.upperBound, b.range.lowerBound < a.range.upperBound {
                spans.removeLast()
            }
        }
        // Add location span, trimming any overlap with date/time spans
        if let locSpan = findLocationSpan(text) {
            var start = locSpan.range.lowerBound
            var end = locSpan.range.upperBound
            for s in spans {
                if start < s.range.upperBound, s.range.lowerBound < end {
                    // Date/time span overlaps — trim location to end before it
                    if s.range.lowerBound > start {
                        end = s.range.lowerBound
                    } else {
                        start = end // fully overlapped, discard
                    }
                }
            }
            // Trim trailing whitespace from adjusted span
            let slice = text[start..<end]
            let trimmedEnd = slice.lastIndex(where: { !$0.isWhitespace }).map { text.index(after: $0) } ?? start
            end = trimmedEnd
            if end > start, text[start..<end].count >= 3 {
                spans.append(TextSpan(range: start..<end, kind: .location))
            }
        }
        return spans.sorted { $0.range.lowerBound < $1.range.lowerBound }
    }

    /// Strip detected date/time phrases from text, collapse whitespace.
    static func stripDateTimeText(_ text: String, now: Date, calendar cal: Calendar) -> String {
        let spans = findDateTimeSpans(text, now: now, calendar: cal)
        if spans.isEmpty { return text }
        // Remove spans from right to left to preserve indices
        var result = text
        for span in spans.reversed() {
            result.removeSubrange(span.range)
        }
        return result.replacing(/\s{2,}/, with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension Character {
    nonisolated var isASCIIDigit: Bool { isASCII && isNumber }
}
