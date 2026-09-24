// DowntoTests/Domain/DateParseTests.swift — ports all 55 cases of src/lib/dateParse.test.ts (ARCHITECTURE §10.1), one @Test per
// TS `it`, named after it, plus the native extras (DST day, year-end wrap, 12am/12pm, explicit-shape enumeration, fuzz).
//
// Anchors: "today" is FROZEN_NOW = Mon 2026-04-27 14:00 in America/Los_Angeles (the test calendar). Day deltas from that Monday:
// Mon=0d, Tue=1d, Wed=2d, Thu=3d, Fri=4d, Sat=5d, Sun=6d.
import Foundation
import Testing
@testable import Downto

@Suite("DateParse")
struct DateParseTests {
    static let cal = DomainTestSupport.calendar("America/Los_Angeles")
    static let frozenNow = DomainTestSupport.date(2026, 4, 27, 14, 0, 0, calendar: cal)

    static func iso(_ y: Int, _ m: Int, _ d: Int) -> LocalDate { DomainTestSupport.ld(y, m, d) }

    static let TODAY = iso(2026, 4, 27)     // Mon
    static let TOMORROW = iso(2026, 4, 28)
    static let TUE = iso(2026, 4, 28)
    static let WED = iso(2026, 4, 29)
    static let THU = iso(2026, 4, 30)
    static let FRI = iso(2026, 5, 1)
    static let SAT = iso(2026, 5, 2)
    static let SUN = iso(2026, 5, 3)
    static let NEXT_MON = iso(2026, 5, 4)
    static let NEXT_THU = iso(2026, 5, 7)
    static let NEXT_FRI = iso(2026, 5, 8)
    // Existing parser quirk: when "next [day]" matches the current day, it jumps TWO weeks (+diff+7 with diff=7).
    static let NEXT_NEXT_MON = iso(2026, 5, 11)

    func nd(_ s: String, now: Date = frozenNow) -> (label: String, iso: LocalDate)? { DateParse.parseNaturalDate(s, now: now, calendar: Self.cal) }
    func dti(_ s: String, now: Date = frozenNow) -> LocalDate? { DateParse.parseDateToISO(s, now: now, calendar: Self.cal) }
    func when(_ s: String, now: Date = frozenNow) -> DateParse.ParsedWhen { DateParse.parseWhen(s, now: now, calendar: Self.cal) }
    func time(_ s: String) -> String? { DateParse.parseNaturalTime(s) }

    // MARK: toLocalISODate

    @Test("toLocalISODate — formats year/month/day with zero-padding")
    func toLocalISODate_zeroPads() {
        #expect(DateParse.toLocalISODate(DomainTestSupport.date(2026, 1, 5, calendar: Self.cal), calendar: Self.cal).iso == "2026-01-05")
        #expect(DateParse.toLocalISODate(DomainTestSupport.date(2026, 12, 31, calendar: Self.cal), calendar: Self.cal).iso == "2026-12-31")
    }

    @Test("toLocalISODate — does NOT shift across UTC midnight (regression for the .toISOString() trap)")
    func toLocalISODate_noUTCShift() {
        // 23:30 in Los Angeles on Apr 27 is already Apr 28 in UTC.
        let lateNight = DomainTestSupport.date(2026, 4, 27, 23, 30, calendar: Self.cal)
        #expect(DateParse.toLocalISODate(lateNight, calendar: Self.cal).iso == "2026-04-27")
    }

    // MARK: parseNaturalDate — relative anchors

    @Test("parseNaturalDate — today / tonight / tn")
    func today_tonight_tn() {
        #expect(nd("today")?.iso == Self.TODAY)
        #expect(nd("tonight")?.iso == Self.TODAY)
        #expect(nd("tn")?.iso == Self.TODAY)
        #expect(nd("today")?.label == "Today")
    }

    @Test("parseNaturalDate — tomorrow / tmrw / tmr")
    func tomorrow_tmrw_tmr() {
        #expect(nd("tomorrow")?.iso == Self.TOMORROW)
        #expect(nd("tmrw")?.iso == Self.TOMORROW)
        #expect(nd("tmr")?.iso == Self.TOMORROW)
    }

    @Test("parseNaturalDate — this weekend → upcoming Saturday")
    func thisWeekend() {
        #expect(nd("this weekend")?.iso == Self.SAT)
    }

    @Test("parseNaturalDate — next weekend → following Saturday")
    func nextWeekend() {
        #expect(nd("next weekend")?.iso == Self.iso(2026, 5, 9))
    }

    @Test("parseNaturalDate — \"in N days\"")
    func inNDays() {
        #expect(nd("in 3 days")?.iso == Self.THU)
        #expect(nd("in 1 day")?.iso == Self.TOMORROW)
    }

    @Test("parseNaturalDate — \"in a week\" / \"next week\"")
    func inAWeek_nextWeek() {
        #expect(nd("in a week")?.iso == Self.NEXT_MON)
        #expect(nd("next week")?.iso == Self.NEXT_MON)
    }

    @Test("parseNaturalDate — \"in N weeks\" — numeric and word forms")
    func inNWeeks() {
        #expect(nd("in 2 weeks")?.iso == Self.iso(2026, 5, 11))
        #expect(nd("in two weeks")?.iso == Self.iso(2026, 5, 11))
        #expect(nd("in three weeks")?.iso == Self.iso(2026, 5, 18))
    }

    @Test("parseNaturalDate — \"next month\" → first of next month")
    func nextMonth() {
        #expect(nd("next month")?.iso == Self.iso(2026, 5, 1))
    }

    @Test("parseNaturalDate — \"in N months\" — numeric and word forms")
    func inNMonths() {
        #expect(nd("in 1 month")?.iso == Self.iso(2026, 5, 1))
        #expect(nd("in two months")?.iso == Self.iso(2026, 6, 1))
        #expect(nd("in three months")?.iso == Self.iso(2026, 7, 1))
    }

    // MARK: parseNaturalDate — day-of-week

    @Test("parseNaturalDate — \"this [day]\" — current day stays today")
    func thisDay_today() {
        #expect(nd("this monday")?.iso == Self.TODAY)
        #expect(nd("this mon")?.iso == Self.TODAY)
    }

    @Test("parseNaturalDate — \"this [day]\" — future days within this week")
    func thisDay_future() {
        #expect(nd("this thursday")?.iso == Self.THU)
        #expect(nd("this fri")?.iso == Self.FRI)
        #expect(nd("this sun")?.iso == Self.SUN)
    }

    @Test("parseNaturalDate — \"next [day]\" — skips this week, and \"next $today\" jumps two weeks")
    func nextDay() {
        #expect(nd("next thu")?.iso == Self.NEXT_THU)
        #expect(nd("next thurs")?.iso == Self.NEXT_THU)
        #expect(nd("next fri")?.iso == Self.NEXT_FRI)
        // Quirk pinned on purpose (diff===0 → 7, plus the universal +7).
        #expect(nd("next monday")?.iso == Self.NEXT_NEXT_MON)
    }

    @Test("parseNaturalDate — informal day spellings (thurs, tues, weds) parse the same as canonical forms")
    func informalDaySpellings() {
        #expect(nd("thurs")?.iso == Self.THU)
        #expect(nd("tues")?.iso == Self.TUE)
        #expect(nd("weds")?.iso == Self.WED)
    }

    @Test("parseNaturalDate — bare day name — current day stays today")
    func bareDay_today() {
        #expect(nd("monday")?.iso == Self.TODAY)
        #expect(nd("mon")?.iso == Self.TODAY)
    }

    @Test("parseNaturalDate — bare day name — future day in current week")
    func bareDay_future() {
        #expect(nd("thursday")?.iso == Self.THU)
        #expect(nd("friday")?.iso == Self.FRI)
    }

    @Test("parseNaturalDate — false-sun: \"the sun\" is not Sunday")
    func falseSun() {
        #expect(nd("watch the sun rise") == nil)
        #expect(nd("a sun") == nil)
    }

    // MARK: parseNaturalDate — explicit dates

    @Test("parseNaturalDate — month name + day (\"feb 20\", \"february 20th\")")
    func monthNameDay() {
        #expect(nd("dec 25")?.iso == Self.iso(2026, 12, 25))
        #expect(nd("december 25")?.iso == Self.iso(2026, 12, 25))
        #expect(nd("dec 25th")?.iso == Self.iso(2026, 12, 25))
    }

    @Test("parseNaturalDate — rolls a past date forward to next year (>14 days back)")
    func rollsPastDateForward() {
        #expect(nd("march 1")?.iso == Self.iso(2027, 3, 1))
    }

    @Test("parseNaturalDate — numeric \"M/D\"")
    func numericMD() {
        #expect(nd("12/25")?.iso == Self.iso(2026, 12, 25))
        #expect(nd("5/9")?.iso == Self.iso(2026, 5, 9))
    }

    @Test("parseNaturalDate — explicit numeric beats the bare day name")
    func explicitBeatsBareDay() {
        #expect(nd("thurs 12/25")?.iso == Self.iso(2026, 12, 25))
    }

    @Test("parseNaturalDate — returns null on garbage")
    func naturalDateGarbage() {
        #expect(nd("nothing here") == nil)
        #expect(nd("") == nil)
    }

    // MARK: parseDateToISO — display-format parser

    @Test("parseDateToISO — today / tonight / tn / tomorrow")
    func dti_relative() {
        #expect(dti("today") == Self.TODAY)
        #expect(dti("tonight") == Self.TODAY)
        #expect(dti("tn") == Self.TODAY)
        #expect(dti("tomorrow") == Self.TOMORROW)
    }

    @Test("parseDateToISO — \"Sat, Feb 15\" display format")
    func dti_displayFormat() {
        // The next Feb 15 from a frozen Apr 27 2026 is Feb 15 2027.
        #expect(dti("Sat, Feb 15") == Self.iso(2027, 2, 15))
    }

    @Test("parseDateToISO — date range — picks the first half (raw year, no rollforward when in same year)")
    func dti_range() {
        // Mar 25 is ~1 month back — under the 2-month rollforward threshold, so stays in the current year.
        #expect(dti("Mar 25 – Mar 28") == Self.iso(2026, 3, 25))
        #expect(dti("Feb 14 - Feb 16") == Self.iso(2027, 2, 14))
    }

    @Test("parseDateToISO — \"M/D\" format")
    func dti_md() {
        #expect(dti("12/25") == Self.iso(2026, 12, 25))
        #expect(dti("5/9") == Self.iso(2026, 5, 9))
    }

    @Test("parseDateToISO — returns null on TBD / empty")
    func dti_tbdEmpty() {
        #expect(dti("TBD") == nil)
        #expect(dti("") == nil)
    }

    @Test("parseDateToISO — KNOWN LOOSENESS: the TS accepts arbitrary strings via V8's Date constructor — the port does not")
    func dti_strictWhereV8WasLoose() {
        // The TS test pins `parseDateToISO("nothing here") !== null` (V8 parses "nothing here 2026" as Jan 1). That looseness was
        // a V8 artifact that parseWhen had to guard against with a digit check; the Swift port's explicit shape list is strict.
        #expect(dti("nothing here") == nil)
    }

    // MARK: parseNaturalTime

    @Test("parseNaturalTime — noon / midnight")
    func time_noonMidnight() {
        #expect(time("noon") == "12pm")
        #expect(time("midnight") == "12am")
        #expect(time("at noon") == "12pm")
    }

    @Test("parseNaturalTime — \"at N\" defaults to pm when no meridiem")
    func time_atN() {
        #expect(time("at 7") == "7pm")
        #expect(time("at 7pm") == "7pm")
        #expect(time("at 7am") == "7am")
        #expect(time("at 7:30") == "7:30pm")
        #expect(time("at 7:30pm") == "7:30pm")
    }

    @Test("parseNaturalTime — compact H(H)MM with meridiem")
    func time_compact() {
        #expect(time("420pm") == "4:20pm")
        #expect(time("730am") == "7:30am")
        #expect(time("1230pm") == "12:30pm")
    }

    @Test("parseNaturalTime — standalone meridiem time")
    func time_standalone() {
        #expect(time("dinner at 7pm") == "7pm")
        #expect(time("7:30pm") == "7:30pm")
        #expect(time("11 pm") == "11pm")
    }

    @Test("parseNaturalTime — drops the \":00\" suffix")
    func time_dropsZeroMinutes() {
        #expect(time("7:00pm") == "7pm")
    }

    @Test("parseNaturalTime — returns null on garbage")
    func time_garbage() {
        #expect(time("") == nil)
        #expect(time("nothing") == nil)
        #expect(time("13pm") == nil)
    }

    // MARK: parseWhen — single-date inputs

    @Test("parseWhen — single day")
    func when_singleDay() {
        let r = when("thursday")
        #expect(r.dates == [Self.THU])
        #expect(r.time == nil)
        #expect(r.label == "thursday")
    }

    @Test("parseWhen — single day + time")
    func when_singleDayTime() {
        let r = when("thursday at 7pm")
        #expect(r.dates == [Self.THU])
        #expect(r.time == "7pm")
    }

    @Test("parseWhen — relative phrase + time")
    func when_relativeTime() {
        let r = when("tomorrow at noon")
        #expect(r.dates == [Self.TOMORROW])
        #expect(r.time == "12pm")
    }

    @Test("parseWhen — explicit numeric date alone")
    func when_numeric() {
        #expect(when("12/25").dates == [Self.iso(2026, 12, 25)])
    }

    @Test("parseWhen — comma-separated display ('Sat, Feb 15') stays one date")
    func when_commaDisplay() {
        #expect(when("Sat, Feb 15").dates == [Self.iso(2027, 2, 15)])
    }

    @Test("parseWhen — empty / whitespace input")
    func when_empty() {
        #expect(when("").dates == [])
        #expect(when("   ").dates == [])
        #expect(when("   ").label == nil)
    }

    @Test("parseWhen — garbage input parses to no dates")
    func when_garbage() {
        #expect(when("nothing here").dates == [])
    }

    // MARK: parseWhen — "or" / "/" splits

    @Test("parseWhen — \"thurs or fri\"")
    func when_thursOrFri() {
        #expect(when("thurs or fri").dates == [Self.THU, Self.FRI])
    }

    @Test("parseWhen — \"next thurs or next fri\" — the motivating example")
    func when_nextThursOrNextFri() {
        #expect(when("next thurs or next fri").dates == [Self.NEXT_THU, Self.NEXT_FRI])
    }

    @Test("parseWhen — slash separator — 'thurs/fri'")
    func when_slash() {
        #expect(when("thurs/fri").dates == [Self.THU, Self.FRI])
        #expect(when("thu / fri").dates == [Self.THU, Self.FRI])
    }

    @Test("parseWhen — three-way 'or'")
    func when_threeWay() {
        #expect(when("wed or thu or fri").dates == [Self.WED, Self.THU, Self.FRI])
    }

    @Test("parseWhen — time applies to all dates (\"thurs or fri at 7pm\")")
    func when_timeAppliesToAll() {
        let r = when("thurs or fri at 7pm")
        #expect(r.dates == [Self.THU, Self.FRI])
        #expect(r.time == "7pm")
    }

    @Test("parseWhen — dedupes identical dates")
    func when_dedupes() {
        #expect(when("thursday or thu").dates == [Self.THU])
    }

    @Test("parseWhen — preserves order in the output")
    func when_preservesOrder() {
        #expect(when("fri or thurs").dates == [Self.FRI, Self.THU])
    }

    @Test("parseWhen — mixes valid + invalid segments — keeps the valid ones")
    func when_mixedValidity() {
        #expect(when("thurs or blahblah").dates == [Self.THU])
    }

    @Test("parseWhen — mixes natural + numeric (\"tomorrow or 5/9\")")
    func when_naturalPlusNumeric() {
        #expect(when("tomorrow or 5/9").dates == [Self.TOMORROW, Self.iso(2026, 5, 9)])
    }

    @Test("parseWhen — \"next thurs or next fri at 7:30pm\"")
    func when_nextThursOrNextFriAt730() {
        let r = when("next thurs or next fri at 7:30pm")
        #expect(r.dates == [Self.NEXT_THU, Self.NEXT_FRI])
        #expect(r.time == "7:30pm")
    }

    @Test("parseWhen — preserves the original input as the label")
    func when_label() {
        #expect(when("next thurs or next fri").label == "next thurs or next fri")
    }

    // MARK: parseWhen — local timezone invariants

    @Test("parseWhen — \"today\" returns the local YYYY-MM-DD even at late local hours")
    func when_todayLate() {
        #expect(when("today").dates.first == Self.TODAY)
        let late = DomainTestSupport.date(2026, 4, 27, 23, 45, calendar: Self.cal)   // already Apr 28 in UTC
        #expect(when("today", now: late).dates.first == Self.TODAY)
    }

    @Test("parseWhen — explicit dates round-trip through local Date construction without drift")
    func when_explicitNoDrift() {
        #expect(when("12/25").dates.first?.iso == "2026-12-25")
    }

    // MARK: Native extras (ARCHITECTURE §10.1)

    @Test("extra — DST transition day: tomorrow / in 1 day / bare day are the next calendar day, not 23 h later")
    func dstTransitionDay() {
        // DST starts 2026-03-08 in Los Angeles (02:00 → 03:00).
        let satBefore = DomainTestSupport.date(2026, 3, 7, 14, 0, calendar: Self.cal)
        #expect(nd("tomorrow", now: satBefore)?.iso == Self.iso(2026, 3, 8))
        #expect(nd("in 1 day", now: satBefore)?.iso == Self.iso(2026, 3, 8))
        #expect(nd("sunday", now: satBefore)?.iso == Self.iso(2026, 3, 8))
        #expect(nd("in a week", now: satBefore)?.iso == Self.iso(2026, 3, 14))
        // Late evening on the day DST ends (2026-11-01): "tomorrow" is still Nov 2.
        let fallBack = DomainTestSupport.date(2026, 11, 1, 23, 30, calendar: Self.cal)
        #expect(nd("tomorrow", now: fallBack)?.iso == Self.iso(2026, 11, 2))
        #expect(nd("tomorrow", now: fallBack)?.label == "Mon, Nov 2")
    }

    @Test("extra — year-end week wrap")
    func yearEndWrap() {
        let tueDec29 = DomainTestSupport.date(2026, 12, 29, 10, 0, calendar: Self.cal)
        #expect(nd("friday", now: tueDec29)?.iso == Self.iso(2027, 1, 1))
        #expect(nd("in a week", now: tueDec29)?.iso == Self.iso(2027, 1, 5))
        #expect(nd("next month", now: tueDec29)?.iso == Self.iso(2027, 1, 1))
        #expect(nd("this weekend", now: tueDec29)?.iso == Self.iso(2027, 1, 2))
        #expect(nd("friday", now: tueDec29)?.label == "Fri, Jan 1")
        #expect(nd("jan 3", now: tueDec29)?.iso == Self.iso(2027, 1, 3))
    }

    @Test("extra — 12am / 12pm")
    func twelveAmPm() {
        #expect(time("12am") == "12am")
        #expect(time("12pm") == "12pm")
        #expect(time("at 12") == "12pm")
        #expect(time("12:30am") == "12:30am")
        #expect(time("1200pm") == "12pm")
        #expect(time("at 0") == nil)
        #expect(time("0am") == nil)
    }

    @Test("extra — labels match toLocaleDateString(\"en-US\", {weekday:\"short\", month:\"short\", day:\"numeric\"})")
    func labels() {
        #expect(nd("friday")?.label == "Fri, May 1")
        #expect(nd("tomorrow")?.label == "Tue, Apr 28")
        #expect(nd("dec 25")?.label == "Fri, Dec 25")
    }

    @Test("extra — parseDateToISO accepts exactly the documented explicit shapes", arguments: [
        ("Feb 15", "2027-02-15"), ("February 15", "2027-02-15"), ("Sat, Feb 15", "2027-02-15"), ("Sat Feb 15", "2027-02-15"),
        ("Feb 15 2027", "2027-02-15"), ("February 15 2027", "2027-02-15"), ("Sat, Feb 15 2027", "2027-02-15"), ("Sat Feb 15 2027", "2027-02-15"),
        ("May 1, 2026", "2026-05-01"), ("2/15/2027", "2027-02-15"), ("2/15/27", "2027-02-15"), ("2/15", "2027-02-15"),
        ("Feb 15th", "2027-02-15"), ("Sept 5", "2026-09-05"), ("5/9", "2026-05-09"), ("3/19", "2026-03-19"),
    ])
    func explicitShapes(_ input: String, _ expected: String) {
        #expect(dti(input)?.iso == expected)
        #expect(DateParse.explicitShapes.count == 9)
    }

    @Test("extra — parseDateToISO rejects what V8 would have guessed at", arguments: ["nothing here", "13/1", "Feb", "15", "2/30/", "thurs", "at 7pm"])
    func explicitShapesReject(_ input: String) {
        #expect(dti(input) == nil)
    }

    @Test("extra — explicit year is respected and never rolled forward")
    func explicitYearKept() {
        #expect(dti("Jan 3 2026") == Self.iso(2026, 1, 3))     // > 2 months back, but the year was given
        #expect(dti("1/3/2026") == Self.iso(2026, 1, 3))
    }

    // MARK: Span helpers

    @Test("spans — findDateTimeSpans / stripDateTimeText")
    func spans() {
        let cal = Self.cal
        let now = Self.frozenNow
        let text = "dinner thursday at 7pm downtown"
        let spans = DateParse.findDateTimeSpans(text, now: now, calendar: cal)
        #expect(spans.map(\.kind) == [.date, .time])
        #expect(spans.map { String(text[$0.range]) } == ["thursday", "at 7pm"])
        #expect(DateParse.stripDateTimeText(text, now: now, calendar: cal) == "dinner downtown")
        #expect(DateParse.stripDateTimeText("movie night?", now: now, calendar: cal) == "movie night?")
        #expect(DateParse.findTimeSpan("meet at noon").map { String("meet at noon"[$0.range]) } == "at noon")
        #expect(DateParse.findTimeSpan("13pm") == nil)
        #expect(DateParse.findDateSpan("watch the sun rise", now: now, calendar: cal) == nil)
        #expect(DateParse.findLocationSpan("dinner at Jollibee") == nil)    // parseNaturalLocation is disabled (parity)
        #expect(DateParse.parseNaturalLocation("dinner at Jollibee") == nil)
        // Mixed case + a date phrase later in the string: span indices are on the ORIGINAL text.
        let mixed = "Karaoke Next Fri at 8PM"
        let ms = DateParse.findDateTimeSpans(mixed, now: now, calendar: cal)
        #expect(ms.map { String(mixed[$0.range]) } == ["Next Fri", "at 8PM"])
        #expect(DateParse.parseWhen(mixed, now: now, calendar: cal).dates == [Self.NEXT_FRI])
        #expect(DateParse.parseWhen(mixed, now: now, calendar: cal).time == "8pm")
    }

    @Test("spans — overlapping date/time keeps the date")
    func spansOverlap() {
        // "5/9" is a date; the time regex would also see "9" — the date span wins and no time span is emitted for the overlap.
        let text = "sat 5/9"
        let spans = DateParse.findDateTimeSpans(text, now: Self.frozenNow, calendar: Self.cal)
        #expect(spans.count == 1)
        #expect(spans.first?.kind == .date)
    }

    // MARK: Fuzz

    @Test("fuzz — parseWhen never traps on 10k random strings and never returns a date more than ~2 months in the past")
    func fuzz() {
        struct LCG { var s: UInt64; mutating func next() -> UInt64 { s = s &* 6364136223846793005 &+ 1442695040888963407; return s >> 33 } }
        var rng = LCG(s: 0x5EED)
        let atoms = ["next", "this", "thurs", "fri", "sun", "the", "a", "in", "3", "two", "weeks", "days", "months", "or", "/", "at", "7", "7:30", "pm", "am",
                     "noon", "midnight", "tomorrow", "tn", "weekend", "month", "week", "12/25", "2/30", "13/1", "feb", "31st", "0", "99", "–", "-", ",", "", " ", "🎉", "ß", "İ", "@", "\n", "1230pm", "at 0", "13pm"]
        let floor = Self.frozenNow.addingTimeInterval(-70 * 86_400)
        var parsedSome = 0
        for _ in 0..<10_000 {
            let n = Int(rng.next() % 6) + 1
            var parts: [String] = []
            for _ in 0..<n { parts.append(atoms[Int(rng.next() % UInt64(atoms.count))]) }
            let input = parts.joined(separator: rng.next() % 3 == 0 ? "" : " ")
            let r = DateParse.parseWhen(input, now: Self.frozenNow, calendar: Self.cal)
            if !r.dates.isEmpty { parsedSome += 1 }
            for d in r.dates {
                #expect(d.startOfDay(in: Self.cal) >= floor, "\(input) → \(d)")
            }
            _ = DateParse.findDateTimeSpans(input, now: Self.frozenNow, calendar: Self.cal)
            _ = DateParse.stripDateTimeText(input, now: Self.frozenNow, calendar: Self.cal)
        }
        #expect(parsedSome > 1000)
    }
}
