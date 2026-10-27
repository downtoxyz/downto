// Stores/FeedStore.swift — FeedRaw + display models + FeedStore (ARCHITECTURE §3.5, §4.2–§4.8, §5.2, §7.1, §7.4).
// Raw rows in, display models out. `project(...)` is pure and the only place mystery redaction happens (§9): a view never
// receives a raw author for a masked check. Every mutation is before → optimistic → await → reconcile-or-restore (§4.5).
import Foundation
import Observation
import Supabase
import SwiftUI
import os

/// PostgREST filter value for an ID from a nonisolated context (`async let` children): the `PostgrestFilterValue`
/// conformance in Data/ID+Supabase.swift is main-actor-isolated under the default isolation.
nonisolated func pg<T>(_ id: ID<T>) -> String { id.raw.uuidString.lowercased() }
nonisolated func pg<T>(_ ids: [ID<T>]) -> [String] { ids.map { $0.raw.uuidString.lowercased() } }

// MARK: - Raw (§4.2, §3.9)

nonisolated struct FeedRaw: Codable, Sendable, Equatable {
    var checks: [CheckID: InterestCheck] = [:]
    var responses: [ResponseRowID: CheckResponse] = [:]
    var coAuthors: [CoAuthorRowID: CheckCoAuthor] = [:]
    var hidden: [HiddenRowID: HiddenCheck] = [:]
    var left: [LeftRowID: LeftCheck] = [:]
    var comments: [CheckID: [CheckComment]] = [:]
    var profiles: [UserID: Profile] = [:]
    var fofAnnotations: [CheckID: String] = [:]
    var mySquadMemberships: [CheckID: SquadMembership] = [:]
    var events: [EventID: FriendsEventPayload] = [:]
    var eventDowns: [EventID: [UserID]] = [:]
    var myEventDowns: Set<EventID> = []
    var sharedCheck: SharedCheck?

    init() {}

    func myResponseRow(checkId: CheckID, me: UserID) -> CheckResponse? {
        responses.values.first { $0.checkId == checkId && $0.userId == me }
    }

    var hiddenCheckIds: Set<CheckID> { Set(hidden.values.map(\.checkId)) }
    var leftCheckIds: Set<CheckID> { Set(left.values.map(\.checkId)) }

    func responsesByCheck() -> [CheckID: [CheckResponse]] {
        var out: [CheckID: [CheckResponse]] = [:]
        for r in responses.values { out[r.checkId, default: []].append(r) }
        for k in out.keys { out[k]!.sort { $0.createdAt < $1.createdAt } }
        return out
    }

    func coAuthorsByCheck() -> [CheckID: [CheckCoAuthor]] {
        var out: [CheckID: [CheckCoAuthor]] = [:]
        for c in coAuthors.values { out[c.checkId, default: []].append(c) }
        for k in out.keys { out[k]!.sort { $0.createdAt < $1.createdAt } }
        return out
    }

    /// Every profile id the projection will need. `profiles` is fetched for exactly this set.
    var referencedUserIds: Set<UserID> {
        var ids = Set<UserID>()
        for c in checks.values { ids.insert(c.authorId) }
        for r in responses.values { ids.insert(r.userId) }
        for c in coAuthors.values { ids.insert(c.userId) }
        for cs in comments.values { for c in cs { ids.insert(c.userId) } }
        for ds in eventDowns.values { ids.formUnion(ds) }
        for e in events.values { if let u = e.createdBy { ids.insert(u) } }
        return ids
    }

    // Row-scoped removal helpers used by refreshCheck's merge.
    mutating func removeRows(forCheck id: CheckID) {
        responses = responses.filter { $0.value.checkId != id }
        coAuthors = coAuthors.filter { $0.value.checkId != id }
        comments[id] = nil
    }
}

// MARK: - Display models (§3.5)

nonisolated struct SquadMembership: Hashable, Codable, Sendable {
    let squadId: SquadID
    let role: SquadRole
    init(squadId: SquadID, role: SquadRole) { self.squadId = squadId; self.role = role }
}

nonisolated struct CoAuthorDisplay: Hashable, Sendable {
    let person: Presence
    let status: CoAuthorStatus
    init(person: Presence, status: CoAuthorStatus) { self.person = person; self.status = status }
}

nonisolated enum MysteryState: Hashable, Sendable { case none, unrevealed, revealedToday }

nonisolated struct WhenLine: Hashable, Sendable {
    let dateLabel: String?
    let time: String?
    let dateFlexible: Bool
    let timeFlexible: Bool
    init(dateLabel: String?, time: String?, dateFlexible: Bool = false, timeFlexible: Bool = false) {
        self.dateLabel = dateLabel; self.time = time; self.dateFlexible = dateFlexible; self.timeFlexible = timeFlexible
    }

    /// "fri oct 3", "8pm-ish" parts for `MetaLine` (DESIGN §4.1 #5).
    var parts: [String] {
        var out: [String] = []
        if let d = dateLabel, !d.isEmpty { out.append(dateFlexible ? d.lowercased() + "-ish" : d.lowercased()) }
        if let t = time, !t.isEmpty { out.append(timeFlexible ? t.lowercased() + "-ish" : t.lowercased()) }
        return out
    }
}

nonisolated struct CommentDisplay: Identifiable, Hashable, Sendable {
    let id: CommentID
    let sender: Presence
    let text: AttributedString
    let createdAt: Date
    init(id: CommentID, sender: Presence, text: AttributedString, createdAt: Date) {
        self.id = id; self.sender = sender; self.text = text; self.createdAt = createdAt
    }
}

nonisolated struct FeedCheck: Identifiable, Hashable, Sendable, FeedOrderable {
    let id: CheckID
    let text: String
    let author: Presence
    let coAuthors: [CoAuthorDisplay]
    let via: String?
    let guests: GuestList
    let downCount: Int?
    let when: WhenLine?
    let location: String?
    let mystery: MysteryState
    let expiry: ExpiryState
    let myResponse: ResponseKind?
    let mySquad: SquadMembership?
    let isMine: Bool
    let isCoAuthorPending: Bool
    let isHidden: Bool
    let isNew: Bool
    let isSynthetic: Bool
    let comments: [CommentDisplay]
    let movie: MovieMetadata?
    let letterboxdUrl: String?
    let createdAt: Date
    let eventDate: LocalDate?

    init(id: CheckID, text: String, author: Presence, coAuthors: [CoAuthorDisplay] = [], via: String? = nil, guests: GuestList,
         downCount: Int?, when: WhenLine? = nil, location: String? = nil, mystery: MysteryState = .none, expiry: ExpiryState,
         myResponse: ResponseKind? = nil, mySquad: SquadMembership? = nil, isMine: Bool, isCoAuthorPending: Bool = false,
         isHidden: Bool = false, isNew: Bool = false, isSynthetic: Bool = false, comments: [CommentDisplay] = [],
         movie: MovieMetadata? = nil, letterboxdUrl: String? = nil, createdAt: Date, eventDate: LocalDate? = nil) {
        self.id = id; self.text = text; self.author = author; self.coAuthors = coAuthors; self.via = via; self.guests = guests
        self.downCount = downCount; self.when = when; self.location = location; self.mystery = mystery; self.expiry = expiry
        self.myResponse = myResponse; self.mySquad = mySquad; self.isMine = isMine; self.isCoAuthorPending = isCoAuthorPending
        self.isHidden = isHidden; self.isNew = isNew; self.isSynthetic = isSynthetic; self.comments = comments
        self.movie = movie; self.letterboxdUrl = letterboxdUrl; self.createdAt = createdAt; self.eventDate = eventDate
    }

    /// "fri oct 3 · 8pm-ish · bushwick"
    var whenWhereParts: [String] {
        var out = when?.parts ?? []
        if let l = location, !l.isEmpty { out.append(l) }
        return out
    }

    var downs: [PersonRef] { if case .revealed(let d, _) = guests { d } else { [] } }
    var waitlist: [PersonRef] { if case .revealed(_, let w) = guests { w } else { [] } }

    /// 1-based position on the waitlist when my response is `.waitlist`.
    var waitlistPosition: Int? {
        guard myResponse == .waitlist else { return nil }
        if let i = waitlist.firstIndex(where: \.isMe) { return i + 1 }
        return waitlist.isEmpty ? 1 : waitlist.count
    }
}

nonisolated struct FeedEvent: Identifiable, Hashable, Sendable {
    let id: EventID
    let title: String
    let venue: String?
    let dateDisplay: String?
    let timeDisplay: String?
    let vibes: [String]
    let imageUrl: URL?
    let poster: PersonRef
    let downs: [PersonRef]
    let myIsDown: Bool
    let createdAt: Date
    let date: LocalDate?

    init(id: EventID, title: String, venue: String?, dateDisplay: String?, timeDisplay: String?, vibes: [String], imageUrl: URL?,
         poster: PersonRef, downs: [PersonRef], myIsDown: Bool, createdAt: Date, date: LocalDate?) {
        self.id = id; self.title = title; self.venue = venue; self.dateDisplay = dateDisplay; self.timeDisplay = timeDisplay
        self.vibes = vibes; self.imageUrl = imageUrl; self.poster = poster; self.downs = downs; self.myIsDown = myIsDown
        self.createdAt = createdAt; self.date = date
    }
}

nonisolated enum FeedItem: Identifiable, Hashable, Sendable, FeedOrderable {
    case check(FeedCheck)
    case event(FeedEvent)

    var id: String {
        switch self {
        case .check(let c): "c:\(c.id)"
        case .event(let e): "e:\(e.id)"
        }
    }
    var createdAt: Date { switch self { case .check(let c): c.createdAt; case .event(let e): e.createdAt } }
    var eventDate: LocalDate? { switch self { case .check(let c): c.eventDate; case .event(let e): e.date } }
    var expiry: ExpiryState { switch self { case .check(let c): c.expiry; case .event: .open } }
    var isHidden: Bool { switch self { case .check(let c): c.isHidden; case .event: false } }
    var check: FeedCheck? { if case .check(let c) = self { c } else { nil } }
    var event: FeedEvent? { if case .event(let e) = self { e } else { nil } }
}

/// Store inputs (§3.9).
nonisolated struct CheckDraft: Hashable, Sendable {
    var text: String
    var eventDate: LocalDate?
    var eventDateLabel: String?
    var eventTime: String?
    var dateFlexible: Bool
    var timeFlexible: Bool
    var location: String?
    var timerHours: Int?
    var maxSquadSize: Int?
    var mystery: Bool
    var coAuthorIds: [UserID]
    var letterboxdUrl: String?

    init(text: String, eventDate: LocalDate? = nil, eventDateLabel: String? = nil, eventTime: String? = nil, dateFlexible: Bool = false,
         timeFlexible: Bool = false, location: String? = nil, timerHours: Int? = nil, maxSquadSize: Int? = nil, mystery: Bool = false,
         coAuthorIds: [UserID] = [], letterboxdUrl: String? = nil) {
        self.text = text; self.eventDate = eventDate; self.eventDateLabel = eventDateLabel; self.eventTime = eventTime
        self.dateFlexible = dateFlexible; self.timeFlexible = timeFlexible; self.location = location; self.timerHours = timerHours
        self.maxSquadSize = maxSquadSize; self.mystery = mystery; self.coAuthorIds = coAuthorIds; self.letterboxdUrl = letterboxdUrl
    }
}

nonisolated struct CheckPatch: Hashable, Sendable {
    var text: String?
    var eventDate: LocalDate??
    var eventDateLabel: String??
    var eventTime: String??
    var location: String??
    var dateFlexible: Bool?
    var timeFlexible: Bool?
    var coAuthorIds: [UserID]?
    var maxSquadSize: Int??
    init(text: String? = nil, eventDate: LocalDate?? = nil, eventDateLabel: String?? = nil, eventTime: String?? = nil,
         location: String?? = nil, dateFlexible: Bool? = nil, timeFlexible: Bool? = nil, coAuthorIds: [UserID]? = nil, maxSquadSize: Int?? = nil) {
        self.text = text; self.eventDate = eventDate; self.eventDateLabel = eventDateLabel; self.eventTime = eventTime
        self.location = location; self.dateFlexible = dateFlexible; self.timeFlexible = timeFlexible; self.coAuthorIds = coAuthorIds
        self.maxSquadSize = maxSquadSize
    }

    var json: [String: AnyJSON] {
        var o: [String: AnyJSON] = [:]
        if let text { o["text"] = .string(text) }
        if let eventDate { o["event_date"] = eventDate.map { .string($0.description) } ?? .null }
        if let eventDateLabel { o["event_date_label"] = eventDateLabel.map(AnyJSON.string) ?? .null }
        if let eventTime { o["event_time"] = eventTime.map(AnyJSON.string) ?? .null }
        if let location { o["location"] = location.map(AnyJSON.string) ?? .null }
        if let dateFlexible { o["date_flexible"] = .bool(dateFlexible) }
        if let timeFlexible { o["time_flexible"] = .bool(timeFlexible) }
        if let maxSquadSize { o["max_squad_size"] = maxSquadSize.map { .integer($0) } ?? .null }
        return o
    }
}

nonisolated struct CreatePrefill: Hashable, Sendable {
    var text: String?
    var when: String?
    var location: String?
    init(text: String? = nil, when: String? = nil, location: String? = nil) { self.text = text; self.when = when; self.location = location }
}

nonisolated enum CheckRouteOutcome: Hashable, Sendable { case visible, gone(isMine: Bool), outsideNetwork, unreachable }

// MARK: - Pure projection (§4.2 rebuild, §9 redaction)

nonisolated struct FeedProjection: Sendable, Equatable {
    var items: [FeedItem] = []
    var hidden: [FeedCheck] = []
    var left: [FeedCheck] = []
    init() {}
}

nonisolated enum FeedProject {
    static func person(_ id: UserID, in profiles: [UserID: Profile], me: UserID) -> PersonRef {
        if let p = profiles[id] {
            return PersonRef(id: id, displayName: p.displayName, username: p.username, avatarLetter: p.avatarLetter, isMe: id == me)
        }
        return PersonRef(id: id, displayName: "someone", username: "", avatarLetter: "?", isMe: id == me)
    }

    static func dateLabel(_ d: LocalDate?, label: String?, calendar: Calendar) -> String? {
        if let label, !label.isEmpty { return label }
        guard let d else { return nil }
        return DateParse.label(d.startOfDay(in: calendar), calendar: calendar)
    }

    static func attributed(_ text: String) -> AttributedString { AttributedString(text) }

    static func project(raw: FeedRaw, me: UserID, now: Date, calendar: Calendar, sort: FeedSort, lastSeen: Date?, seenIds: Set<CheckID>) -> FeedProjection {
        let responses = raw.responsesByCheck()
        let coAuthors = raw.coAuthorsByCheck()
        let hiddenIds = raw.hiddenCheckIds
        let leftIds = raw.leftCheckIds
        let today = Mystery.localToday(now, calendar: calendar)

        func build(_ c: InterestCheck, forceHidden: Bool? = nil) -> FeedCheck {
            let expiry = computeExpiry(expiresAt: c.expiresAt, createdAt: c.createdAt, now: now)
            let cas = coAuthors[c.id] ?? []
            let isAcceptedCoAuthor = cas.contains { $0.userId == me && $0.status == .accepted }
            let isMine = c.authorId == me || isAcceptedCoAuthor
            let unrevealed = Mystery.isUnrevealed(mystery: c.mystery, authorId: c.authorId, eventDate: c.eventDate, viewer: me, now: now, calendar: calendar)
            let guestsHidden = Mystery.isGuestsHidden(mystery: c.mystery, eventDate: c.eventDate, now: now, calendar: calendar)
            let mystery: MysteryState = !c.mystery ? .none : (unrevealed || guestsHidden) ? .unrevealed : (c.eventDate == today ? .revealedToday : .none)
            let author: Presence = unrevealed
                ? .masked(kaomoji: Censor.kaomoji(seed: c.id.description), scramble: Censor.wingdings(seed: c.id.description))
                : .person(person(c.authorId, in: raw.profiles, me: me))
            let rs = responses[c.id] ?? []
            let downs = rs.filter { $0.response == .down }.map { person($0.userId, in: raw.profiles, me: me) }
            let waitlist = rs.filter { $0.response == .waitlist }.map { person($0.userId, in: raw.profiles, me: me) }
            let mine = rs.first { $0.userId == me }
            let comments = (raw.comments[c.id] ?? []).map { k in
                let sender: Presence = (unrevealed && k.userId == c.authorId) ? author : .person(person(k.userId, in: raw.profiles, me: me))
                return CommentDisplay(id: k.id, sender: sender, text: attributed(k.text), createdAt: k.createdAt)
            }
            let coDisplays = cas.filter { $0.status != .declined }.map { ca in
                CoAuthorDisplay(person: unrevealed ? .masked(kaomoji: Censor.kaomojiForUser(threadSeed: c.id.description, userId: ca.userId), scramble: "") : .person(person(ca.userId, in: raw.profiles, me: me)), status: ca.status)
            }
            let hidden = forceHidden ?? hiddenIds.contains(c.id)
            return FeedCheck(
                id: c.id,
                text: unrevealed ? Censor.stripAtMentions(c.text) : c.text,
                author: author,
                coAuthors: coDisplays,
                via: raw.fofAnnotations[c.id],
                guests: guestsHidden ? .hidden : .revealed(downs: downs, waitlist: waitlist),
                downCount: guestsHidden ? nil : downs.count,
                when: (c.eventDate != nil || c.eventTime != nil || c.eventDateLabel != nil)
                    ? WhenLine(dateLabel: dateLabel(c.eventDate, label: c.eventDateLabel, calendar: calendar), time: c.eventTime, dateFlexible: c.dateFlexible, timeFlexible: c.timeFlexible)
                    : nil,
                location: c.location,
                mystery: mystery,
                expiry: expiry,
                myResponse: mine?.response,
                mySquad: raw.mySquadMemberships[c.id],
                isMine: isMine,
                isCoAuthorPending: cas.contains { $0.userId == me && $0.status == .pending },
                isHidden: hidden,
                isNew: FeedOrdering.isNew(createdAt: c.createdAt, lastSeenFeedAt: lastSeen, isMine: isMine) && !seenIds.contains(c.id),
                comments: comments,
                movie: c.movieMetadata,
                letterboxdUrl: c.letterboxdUrl,
                createdAt: c.createdAt,
                eventDate: c.eventDate
            )
        }

        var items: [FeedItem] = []
        for c in raw.checks.values where c.archivedAt == nil {
            items.append(.check(build(c)))
        }

        // §7.1 — the synthetic shared-link card, only while the real row is invisible.
        var synthetic: FeedCheck?
        if let s = raw.sharedCheck, raw.checks[s.id] == nil {
            // The server already NULLs the author while a mystery check is unrevealed; a nil name is therefore masked regardless of the clock.
            let masked = s.authorName == nil
                || Mystery.isUnrevealed(mystery: s.mystery ?? false, authorId: s.authorId, eventDate: s.eventDate, viewer: me, now: now, calendar: calendar)
            let mine = raw.myResponseRow(checkId: s.id, me: me)
            let fc = FeedCheck(
                id: s.id,
                text: masked ? Censor.stripAtMentions(s.text) : s.text,
                author: masked ? .masked(kaomoji: Censor.kaomoji(seed: s.id.description), scramble: Censor.wingdings(seed: s.id.description))
                               : .person(PersonRef(id: s.authorId, displayName: s.authorName ?? "someone", username: "", avatarLetter: s.authorAvatar ?? "?", isMe: false)),
                via: "shared link",
                guests: .countOnly(s.responseCount),
                downCount: s.responseCount,
                when: (s.eventDate != nil || s.eventTime != nil) ? WhenLine(dateLabel: dateLabel(s.eventDate, label: nil, calendar: calendar), time: s.eventTime) : nil,
                location: s.location,
                mystery: masked ? .unrevealed : .none,
                expiry: computeExpiry(expiresAt: s.expiresAt, createdAt: s.createdAt, now: now),
                myResponse: mine?.response,
                mySquad: raw.mySquadMemberships[s.id],
                isMine: false,
                isSynthetic: true,
                createdAt: s.createdAt,
                eventDate: s.eventDate
            )
            synthetic = fc
            if !fc.expiry.isExpired { items.append(.check(fc)) }
        }

        // Read-only events (M1). Past events leave the OPEN section on the next load (DESIGN §4.5 "past").
        for e in raw.events.values {
            if let d = e.date, d < today { continue }
            let posterId = e.createdBy ?? UserID(UUID(uuid: UUID_NULL))
            let poster = PersonRef(id: posterId, displayName: e.creator.displayName ?? raw.profiles[posterId]?.displayName ?? "someone",
                                   username: raw.profiles[posterId]?.username ?? "", avatarLetter: e.creator.avatarLetter ?? raw.profiles[posterId]?.avatarLetter ?? "?",
                                   isMe: posterId == me)
            let downIds = (raw.eventDowns[e.id] ?? []).filter { $0 != posterId }
            items.append(.event(FeedEvent(
                id: e.id, title: e.title, venue: e.venue, dateDisplay: e.dateDisplay, timeDisplay: e.timeDisplay, vibes: e.vibes ?? [],
                imageUrl: e.imageUrl.flatMap(URL.init(string:)), poster: poster,
                downs: downIds.map { person($0, in: raw.profiles, me: me) },
                myIsDown: raw.myEventDowns.contains(e.id), createdAt: e.createdAt, date: e.date
            )))
        }

        let tiers = FeedOrdering.tiers(items, sort: sort)
        var ordered = tiers.pinned
        var chrono = tiers.chrono
        if let s = synthetic, s.expiry.isOpen, let i = chrono.firstIndex(where: { $0.id == "c:\(s.id)" }) {
            let item = chrono.remove(at: i)
            chrono.insert(item, at: 0)   // the reason the user is here goes first (§7.1)
        }
        ordered += chrono

        var out = FeedProjection()
        out.items = ordered
        out.hidden = tiers.hidden.compactMap(\.check)
        out.left = raw.checks.values
            .filter { leftIds.contains($0.id) && $0.archivedAt == nil }
            .filter { c in
                if let d = c.eventDate, d < today { return false }
                return !computeExpiry(expiresAt: c.expiresAt, createdAt: c.createdAt, now: now).isExpired
            }
            .sorted { $0.createdAt > $1.createdAt }
            .map { build($0, forceHidden: false) }
        return out
    }
}

// MARK: - Store

@Observable final class FeedStore {
    nonisolated enum SquadOutcome: Hashable, Sendable { case formed, joined }

    // rendered
    private(set) var items: [FeedItem] = []
    private(set) var hidden: [FeedCheck] = []
    private(set) var leftChecks: [FeedCheck] = []
    var sort: FeedSort { didSet { Defaults.feedSort = sort; rebuild() } }
    private(set) var phase: LoadPhase = .idle
    private(set) var lastError: AppError?
    private(set) var revealedNow: Set<CheckID> = []
    private(set) var squadOutcome: [CheckID: SquadOutcome] = [:]
    private(set) var heldInserts: [FeedItem] = []
    var lastSeenFeedAt: Date
    private(set) var now: Date = .now
    /// Checks with a mutation in flight — DownToggle renders `.pending` (§4.5 one mutation per check).
    private(set) var inflightIds: Set<CheckID> = []
    /// The reader is scrolled deep: realtime inserts are held (§4.7). Set by FeedView from scroll geometry.
    var isScrolledDeep = false
    /// Ids whose NEW flag the reader has seen for ≥ 1.5 s (DESIGN §4.1 seen-tracking); persisted.
    private(set) var seenIds: Set<CheckID> = Defaults.seenIds
    /// The last successfully posted check — CreateOverlay's flight target.
    private(set) var lastCreatedId: CheckID?
    // raw
    private(set) var raw = FeedRaw()

    var hasChecks: Bool { raw.checks.contains { $0.value.archivedAt == nil } || raw.sharedCheck != nil }

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "feed")
    private var buffer = ChangeBuffer<FeedRaw>()
    private var inflight: [CheckID: Task<Void, Never>] = [:]
    private var refreshingChecks: Set<CheckID> = []
    private var eventRefresh: Task<Void, Never>?
    private var hydrateTask: Task<Void, Never>?
    private var profileFetches: Set<UserID> = []

    init(env: AppEnvironment) {
        self.env = env
        sort = Defaults.feedSort
        lastSeenFeedAt = Defaults.lastSeenFeedAt ?? .distantPast
    }

    private var me: UserID? { env.session.state.userId }
    private var client: SupabaseClient { env.supabase }

    // MARK: Lifecycle

    /// Full load: §4.4 selects in a TaskGroup → row merge → buffer replay → rebuild → snapshot.
    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); return }
        if let t = hydrateTask { await t.value; return }
        let t = Task { await load() }
        hydrateTask = t
        await t.value
        hydrateTask = nil
    }

    /// Same as hydrate but keeps items until new raw arrives; never assigns raw wholesale (§4.7.1).
    func refresh() async { await hydrate() }

    private func load() async {
        guard let me else { return }
        if !phase.isSettled { phase = .loading }
        let gen = buffer.beginSelect()
        do {
            let fetched = try await fetchAll(me: me)
            buffer.endSelect(gen, merge: { raw in
                raw.checks = fetched.checks
                raw.responses = fetched.responses
                raw.coAuthors = fetched.coAuthors
                raw.hidden = fetched.hidden
                raw.left = fetched.left
                raw.comments = fetched.comments
                raw.profiles.merge(fetched.profiles) { _, new in new }
                raw.fofAnnotations = fetched.fofAnnotations
                raw.events = fetched.events
                raw.eventDowns = fetched.eventDowns
                raw.myEventDowns = fetched.myEventDowns
                if let s = fetched.sharedCheck { raw.sharedCheck = s } else if Defaults.activeSharedCheckId == nil { raw.sharedCheck = nil }
            }, into: &raw)
            // Re-injection stops once the real row is visible (§7.1).
            if let active = Defaults.activeSharedCheckId, raw.checks[active] != nil { raw.sharedCheck = nil; Defaults.activeSharedCheckId = nil }
            phase = .loaded(at: .now, stale: false)
            lastError = nil
            rebuild()
            let snapshot = raw
            Task { try? await self.env.cache.save(snapshot, name: "feed", userId: me) }
        } catch {
            buffer.abortSelect(gen)
            let e = AppError(error)
            guard e != .cancelled else { return }
            log.error("hydrate: \(String(describing: error), privacy: .public)")
            lastError = e
            phase = .failed(e, hadSnapshot: !raw.checks.isEmpty)
            rebuild()
        }
    }

    private struct Fetched: Sendable {
        var checks: [CheckID: InterestCheck] = [:]
        var responses: [ResponseRowID: CheckResponse] = [:]
        var coAuthors: [CoAuthorRowID: CheckCoAuthor] = [:]
        var hidden: [HiddenRowID: HiddenCheck] = [:]
        var left: [LeftRowID: LeftCheck] = [:]
        var comments: [CheckID: [CheckComment]] = [:]
        var profiles: [UserID: Profile] = [:]
        var fofAnnotations: [CheckID: String] = [:]
        var events: [EventID: FriendsEventPayload] = [:]
        var eventDowns: [EventID: [UserID]] = [:]
        var myEventDowns: Set<EventID> = []
        var sharedCheck: SharedCheck?
    }

    private func fetchAll(me: UserID) async throws -> Fetched {
        var f = Fetched()
        let client = self.client
        let rpc = env.rpc
        // Pass 1: the independent selects.
        async let checksQ: [InterestCheck] = client.from("interest_checks").select().order("created_at", ascending: false).execute().value
        let meS = pg(me)
        async let hiddenQ: [HiddenCheck] = client.from("hidden_checks").select().eq("user_id", value: meS).execute().value
        async let leftQ: [LeftCheck] = client.from("left_checks").select().eq("user_id", value: meS).execute().value
        async let fofQ: [CheckID: String] = rpc.fofAnnotations()
        async let eventsQ: [FriendsEventPayload] = rpc.friendsEvents()
        let checks = try await checksQ
        f.checks = Dictionary(checks.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
        f.hidden = Dictionary(try await hiddenQ.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
        f.left = Dictionary(try await leftQ.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
        f.fofAnnotations = (try? await fofQ) ?? [:]
        let events = (try? await eventsQ) ?? []
        f.events = Dictionary(events.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })

        // Pass 2: everything keyed by the check / event ids we now know.
        let checkIds = pg(Array(f.checks.keys) + Array(f.left.values.map(\.checkId)))
        let eventIds = pg(Array(f.events.keys))
        let active = Defaults.activeSharedCheckId
        let needsShared: CheckID? = active.flatMap { f.checks[$0] == nil ? $0 : nil }
        async let responsesQ: [CheckResponse] = checkIds.isEmpty ? [] : client.from("check_responses").select().in("check_id", values: checkIds).execute().value
        async let coAuthorsQ: [CheckCoAuthor] = checkIds.isEmpty ? [] : client.from("check_co_authors").select().in("check_id", values: checkIds).execute().value
        async let commentsQ: [CheckComment] = checkIds.isEmpty ? [] : client.from("check_comments").select().in("check_id", values: checkIds).order("created_at", ascending: true).execute().value
        async let savedQ: [SavedEvent] = eventIds.isEmpty ? [] : client.from("saved_events").select().in("event_id", values: eventIds).eq("is_down", value: true).execute().value
        async let sharedQ: SharedCheck? = {
            if let needsShared { return try? await rpc.sharedCheck(needsShared) }
            return nil
        }()
        f.responses = Dictionary(try await responsesQ.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
        f.coAuthors = Dictionary(try await coAuthorsQ.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
        for c in try await commentsQ { if let id = c.checkId { f.comments[id, default: []].append(c) } }
        for s in (try? await savedQ) ?? [] {
            f.eventDowns[s.eventId, default: []].append(s.userId)
            if s.userId == me { f.myEventDowns.insert(s.eventId) }
        }
        f.sharedCheck = await sharedQ

        // Pass 3: profiles for every referenced id, chunked by 100.
        var ids = Set<UserID>()
        for c in f.checks.values { ids.insert(c.authorId) }
        for r in f.responses.values { ids.insert(r.userId) }
        for c in f.coAuthors.values { ids.insert(c.userId) }
        for cs in f.comments.values { for c in cs { ids.insert(c.userId) } }
        for ds in f.eventDowns.values { ids.formUnion(ds) }
        for e in f.events.values { if let u = e.createdBy { ids.insert(u) } }
        ids.insert(me)
        f.profiles = try await fetchProfiles(Array(ids))
        return f
    }

    private func fetchProfiles(_ ids: [UserID]) async throws -> [UserID: Profile] {
        guard !ids.isEmpty else { return [:] }
        let client = self.client
        return try await withThrowingTaskGroup(of: [Profile].self) { g in
            for chunk in stride(from: 0, to: ids.count, by: 100).map({ Array(ids[$0..<min($0 + 100, ids.count)]) }) {
                let ids = pg(chunk)
                g.addTask { try await client.from("profiles").select().in("id", values: ids).execute().value }
            }
            var out: [UserID: Profile] = [:]
            for try await rows in g { for p in rows { out[p.id] = p } }
            return out
        }
    }

    /// One check + its sub-tables + missing profiles → scoped merge → rebuild. A no-row result (RLS) is a silent no-op. Coalesced per id.
    func refreshCheck(_ id: CheckID) async {
        guard !env.isFake, me != nil, !refreshingChecks.contains(id) else { return }
        refreshingChecks.insert(id)
        defer { refreshingChecks.remove(id) }
        let gen = buffer.beginSelect()
        do {
            let client = self.client
            let idS = pg(id)
            async let checkQ: [InterestCheck] = client.from("interest_checks").select().eq("id", value: idS).limit(1).execute().value
            async let responsesQ: [CheckResponse] = client.from("check_responses").select().eq("check_id", value: idS).execute().value
            async let coAuthorsQ: [CheckCoAuthor] = client.from("check_co_authors").select().eq("check_id", value: idS).execute().value
            async let commentsQ: [CheckComment] = client.from("check_comments").select().eq("check_id", value: idS).order("created_at", ascending: true).execute().value
            let check = try await checkQ.first
            let responses = try await responsesQ
            let coAuthors = try await coAuthorsQ
            let comments = try await commentsQ
            var ids = Set<UserID>()
            if let check { ids.insert(check.authorId) }
            for r in responses { ids.insert(r.userId) }
            for c in coAuthors { ids.insert(c.userId) }
            for c in comments { ids.insert(c.userId) }
            let missing = ids.filter { raw.profiles[$0] == nil }
            let profiles = try await fetchProfiles(Array(missing))
            buffer.endSelect(gen, merge: { raw in
                raw.removeRows(forCheck: id)
                if let check { raw.checks[check.id] = check } else { raw.checks[id] = nil }
                for r in responses { raw.responses[r.id] = r }
                for c in coAuthors { raw.coAuthors[c.id] = c }
                if !comments.isEmpty { raw.comments[id] = comments }
                raw.profiles.merge(profiles) { _, new in new }
                if check != nil, raw.sharedCheck?.id == id { raw.sharedCheck = nil }
            }, into: &raw)
            if check != nil, Defaults.activeSharedCheckId == id { Defaults.activeSharedCheckId = nil }
            rebuild()
        } catch {
            buffer.abortSelect(gen)
            log.error("refreshCheck: \(String(describing: error), privacy: .public)")
        }
    }

    /// §4.10 — no per-event RPC: re-run get_friends_events + a scoped saved_events select, debounced 1 s.
    func refreshEvent(_ id: EventID) async {
        guard !env.isFake else { return }
        eventRefresh?.cancel()
        eventRefresh = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled, let self, let me = self.me else { return }
            let gen = self.buffer.beginSelect()
            do {
                let events = try await self.env.rpc.friendsEvents()
                let ids = events.map(\.id)
                let saved: [SavedEvent] = ids.isEmpty ? [] : try await self.client.from("saved_events").select().in("event_id", values: pg(ids)).eq("is_down", value: true).execute().value
                var downs: [EventID: [UserID]] = [:]
                var mine = Set<EventID>()
                for s in saved { downs[s.eventId, default: []].append(s.userId); if s.userId == me { mine.insert(s.eventId) } }
                let missing = Set(saved.map(\.userId)).filter { self.raw.profiles[$0] == nil }
                let profiles = try await self.fetchProfiles(Array(missing))
                self.buffer.endSelect(gen, merge: { raw in
                    raw.events = Dictionary(events.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
                    raw.eventDowns = downs
                    raw.myEventDowns = mine
                    raw.profiles.merge(profiles) { _, new in new }
                }, into: &self.raw)
                self.rebuild()
            } catch {
                self.buffer.abortSelect(gen)
            }
        }
        await eventRefresh?.value
    }

    /// Deep link: in raw? else refreshCheck; false if RLS returns nothing.
    func ensureLoaded(_ id: CheckID) async -> Bool {
        if raw.checks[id] != nil { return true }
        await refreshCheck(id)
        return raw.checks[id] != nil
    }

    /// §7.4 — the ONE resolution step for every check id that reaches the router.
    func resolveCheckRoute(_ id: CheckID) async -> CheckRouteOutcome {
        if await ensureLoaded(id) { return .visible }
        if raw.sharedCheck?.id == id { return .outsideNetwork }
        do {
            let s = try await env.rpc.getCheckState(id)
            if !s.active { return .gone(isMine: s.isMine) }
            return await injectSharedCheck(id) ? .outsideNetwork : .gone(isMine: false)
        } catch { return .unreachable }
    }

    /// The only external write into raw — SquadsStore.rebuild() (§4.10).
    func setMySquadMemberships(_ m: [CheckID: SquadMembership]) {
        guard raw.mySquadMemberships != m else { return }
        raw.mySquadMemberships = m
        rebuild()
    }

    /// §7.1 — rpc.sharedCheck → raw.sharedCheck; persists dt.activeSharedCheckId. false when the RPC returns no row.
    func injectSharedCheck(_ id: CheckID) async -> Bool {
        do {
            guard let s = try await env.rpc.sharedCheck(id) else {
                if raw.sharedCheck?.id == id { clearSharedCheck(); env.toasts.show("press f — that check is gone") }
                return false
            }
            raw.sharedCheck = s
            Defaults.activeSharedCheckId = id
            rebuild()
            return true
        } catch { return false }
    }

    func clearSharedCheck() { raw.sharedCheck = nil; Defaults.activeSharedCheckId = nil; rebuild() }

    // MARK: Mutations (§4.5)

    private struct NewResponse: Encodable, Sendable { let checkId: CheckID; let userId: UserID; let response: String }
    private struct NewHidden: Encodable, Sendable { let userId: UserID; let checkId: CheckID }
    private struct NewComment: Encodable, Sendable { let checkId: CheckID; let userId: UserID; let text: String; let mentions: [UserID] }
    private struct NewCoAuthor: Encodable, Sendable { let checkId: CheckID; let userId: UserID; let invitedBy: UserID }
    private struct NewSaved: Encodable, Sendable { let userId: UserID; let eventId: EventID; let isDown: Bool }

    func toggleDown(_ id: CheckID) async {
        guard let me, inflight[id] == nil else { return }
        if raw.sharedCheck?.id == id && raw.checks[id] == nil { return await respondToSharedCard(id) }
        if env.isFake { fakeToggle(id, me: me); return }
        let before = raw
        let mine = raw.myResponseRow(checkId: id, me: me)
        let tempId = ResponseRowID(UUID())
        withAnimation(DTSpring.settle) {
            if let mine { raw.responses.removeValue(forKey: mine.id) }
            else { raw.responses[tempId] = CheckResponse(id: tempId, checkId: id, userId: me, response: .down, createdAt: .now) }
            inflightIds.insert(id)
            rebuild()
        }
        let task = Task { [self] in
            do {
                if let mine {
                    try await client.from("check_responses").delete().eq("id", value: mine.id).execute()
                    if raw.left.values.contains(where: { $0.checkId == id }) == false {
                        // leaving the squad is the DB's job (triggers); refresh membership so the link disappears
                    }
                    _ = await env.squads.refreshMembership(checkId: id)
                } else {
                    if let leftRow = raw.left.values.first(where: { $0.checkId == id }) {
                        _ = try? await client.from("left_checks").delete().eq("id", value: leftRow.id).execute()
                        raw.left[leftRow.id] = nil
                    }
                    let inserted: CheckResponse = try await client.from("check_responses")
                        .insert(NewResponse(checkId: id, userId: me, response: "down")).select().single().execute().value
                    raw.responses.removeValue(forKey: tempId)
                    raw.responses[inserted.id] = inserted
                    rebuild()
                    if inserted.response == .waitlist {
                        let pos = items.compactMap(\.check).first { $0.id == id }?.waitlistPosition ?? 1
                        env.toasts.show("check is full — you're #\(pos) on the waitlist", key: "squad:\(id)")
                    }
                    let membership = await env.squads.refreshMembership(checkId: id)
                    squadOutcome[id] = membership.formedNow ? .formed : membership.joined ? .joined : nil
                }
            } catch {
                withAnimation(DTSpring.settle) { raw = before; rebuild() }
                let e = AppError(error)
                if e == .rlsDenied { env.toasts.show("press f — that check is gone", style: .error); removeCheck(id) }
                else if e != .cancelled { env.toasts.show(e.toastCopy, style: .error) }
            }
            inflight[id] = nil
            inflightIds.remove(id)
            rebuild()
        }
        inflight[id] = task
        await task.value
    }

    private func fakeToggle(_ id: CheckID, me: UserID) {
        withAnimation(DTSpring.settle) {
            if let mine = raw.myResponseRow(checkId: id, me: me) { raw.responses.removeValue(forKey: mine.id) }
            else { let rid = ResponseRowID(UUID()); raw.responses[rid] = CheckResponse(id: rid, checkId: id, userId: me, response: .down, createdAt: .now) }
            rebuild()
        }
    }

    /// §7.1 — DOWN on the synthetic card goes through /api/checks/respond-shared (RLS can't see the row).
    private func respondToSharedCard(_ id: CheckID) async {
        guard let me, inflight[id] == nil else { return }
        let before = raw
        let mine = raw.myResponseRow(checkId: id, me: me)
        let tempId = ResponseRowID(UUID())
        withAnimation(DTSpring.settle) {
            if let mine { raw.responses.removeValue(forKey: mine.id) }
            else { raw.responses[tempId] = CheckResponse(id: tempId, checkId: id, userId: me, response: .down, createdAt: .now) }
            inflightIds.insert(id)
            rebuild()
        }
        let task = Task { [self] in
            do {
                if let mine {
                    try await client.from("check_responses").delete().eq("id", value: mine.id).execute()
                } else {
                    try await env.api.respondShared(checkId: id)
                    let rows: [CheckResponse] = (try? await client.from("check_responses").select().eq("check_id", value: id).eq("user_id", value: me).execute().value) ?? []
                    raw.responses.removeValue(forKey: tempId)
                    for r in rows { raw.responses[r.id] = r }
                }
                _ = await injectSharedCheck(id)
                let membership = await env.squads.refreshMembership(checkId: id)
                if mine == nil { squadOutcome[id] = membership.formedNow ? .formed : membership.joined ? .joined : nil }
            } catch {
                withAnimation(DTSpring.settle) { raw = before; rebuild() }
                let e = AppError(error)
                if e != .cancelled { env.toasts.show(e.toastCopy, style: .error) }
            }
            inflight[id] = nil
            inflightIds.remove(id)
            rebuild()
        }
        inflight[id] = task
        await task.value
    }

    func hide(_ id: CheckID) async {
        guard let me else { return }
        let before = raw
        let tempId = HiddenRowID(UUID())
        withAnimation(DTSpring.settle) { raw.hidden[tempId] = HiddenCheck(id: tempId, userId: me, checkId: id, hiddenAt: .now); rebuild() }
        guard !env.isFake else { return }
        do {
            let rows: [HiddenCheck] = try await client.from("hidden_checks").insert(NewHidden(userId: me, checkId: id)).select().execute().value
            raw.hidden[tempId] = nil
            for r in rows { raw.hidden[r.id] = r }
            rebuild()
        } catch {
            let e = AppError(error)
            if case .postgrest("23505", _) = e { return }   // already hidden
            withAnimation(DTSpring.settle) { raw = before; rebuild() }
            env.toasts.show(e.toastCopy, style: .error)
        }
    }

    func unhide(_ id: CheckID) async {
        let before = raw
        withAnimation(DTSpring.settle) { raw.hidden = raw.hidden.filter { $0.value.checkId != id }; rebuild() }
        guard !env.isFake, let me else { return }
        do {
            try await client.from("hidden_checks").delete().eq("user_id", value: me).eq("check_id", value: id).execute()
        } catch {
            withAnimation(DTSpring.settle) { raw = before; rebuild() }
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }

    /// Author delete: archive_interest_check (also archives the squad) + "check removed — undo?" slip.
    @discardableResult
    func archive(_ id: CheckID) async -> Bool {
        let before = raw
        guard var c = raw.checks[id] else { return false }
        c.archivedAt = .now
        withAnimation(DTSpring.settle) { raw.checks[id] = c; rebuild() }
        if !env.isFake {
            do { try await env.rpc.archiveCheck(id) } catch {
                withAnimation(DTSpring.settle) { raw = before; rebuild() }
                env.toasts.show(AppError(error).toastCopy, style: .error)
                return false
            }
        }
        env.toasts.show("check removed — undo?", action: .undoArchive(id), countdown: true)
        return true
    }

    func revive(_ id: CheckID) async {
        if !env.isFake {
            do { try await env.rpc.reviveCheck(id) } catch { env.toasts.show(AppError(error).toastCopy, style: .error); return }
            await refreshCheck(id)
        } else if var c = raw.checks[id] {
            c.archivedAt = nil
            withAnimation(DTSpring.settle) { raw.checks[id] = c; rebuild() }
        }
    }

    func acceptTag(_ id: CheckID) async { await respondTag(id, accept: true) }
    func declineTag(_ id: CheckID) async { await respondTag(id, accept: false) }

    private func respondTag(_ id: CheckID, accept: Bool) async {
        guard let me, let row = raw.coAuthors.values.first(where: { $0.checkId == id && $0.userId == me }) else { return }
        let before = raw
        var updated = row
        updated.status = accept ? .accepted : .declined
        withAnimation(DTSpring.settle) { raw.coAuthors[row.id] = updated; rebuild() }
        guard !env.isFake else { return }
        do {
            try await client.from("check_co_authors").update(["status": AnyJSON.string(accept ? "accepted" : "declined")])
                .eq("check_id", value: id).eq("user_id", value: me).execute()
            if accept {
                // auto_down_on_coauthor_accept inserts my response + joins the squad server-side (§4.10).
                await refreshCheck(id)
                _ = await env.squads.refreshMembership(checkId: id)
            }
        } catch {
            withAnimation(DTSpring.settle) { raw = before; rebuild() }
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }

    private struct NewCheck: Encodable, Sendable {
        let authorId: UserID
        let text: String
        let expiresAt: Date?
        let eventDate: LocalDate?
        let eventDateLabel: String?
        let eventTime: String?
        let eventTz: String
        let dateFlexible: Bool
        let timeFlexible: Bool
        let maxSquadSize: Int?
        let location: String?
        let mystery: Bool
        let letterboxdUrl: String?
    }

    func createCheck(_ draft: CheckDraft) async throws -> CheckID {
        guard let me else { throw AppError.unauthenticated }
        let text = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw AppError.unknown("say something first") }
        let expiresAt = draft.timerHours.map { Date.now.addingTimeInterval(TimeInterval($0) * 3600) }
        if env.isFake {
            let id = CheckID(UUID())
            raw.checks[id] = InterestCheck(id: id, authorId: me, text: text, expiresAt: expiresAt, eventDate: draft.eventDate, eventDateLabel: draft.eventDateLabel,
                                           eventTime: draft.eventTime, eventTz: TimeZone.current.identifier, dateFlexible: draft.dateFlexible, timeFlexible: draft.timeFlexible,
                                           location: draft.location, maxSquadSize: draft.maxSquadSize, mystery: draft.mystery, letterboxdUrl: draft.letterboxdUrl,
                                           movieMetadata: nil, sharedAt: nil, archivedAt: nil, lastRalliedAt: nil, createdAt: .now)
            lastCreatedId = id
            Defaults.showAddGlow = false
            withAnimation(DTSpring.page) { rebuild() }
            return id
        }
        let body = NewCheck(authorId: me, text: text, expiresAt: expiresAt, eventDate: draft.eventDate, eventDateLabel: draft.eventDateLabel,
                            eventTime: draft.eventTime, eventTz: TimeZone.current.identifier, dateFlexible: draft.dateFlexible, timeFlexible: draft.timeFlexible,
                            maxSquadSize: draft.maxSquadSize, location: draft.location?.isEmpty == true ? nil : draft.location, mystery: draft.mystery,
                            letterboxdUrl: draft.letterboxdUrl)
        do {
            let created: InterestCheck = try await client.from("interest_checks").insert(body).select().single().execute().value
            if !draft.coAuthorIds.isEmpty {
                let rows = draft.coAuthorIds.map { NewCoAuthor(checkId: created.id, userId: $0, invitedBy: me) }
                let inserted: [CheckCoAuthor] = (try? await client.from("check_co_authors").insert(rows).select().execute().value) ?? []
                for c in inserted { raw.coAuthors[c.id] = c }
            }
            raw.checks[created.id] = created
            if raw.profiles[me] == nil, let p = env.profile.me { raw.profiles[me] = p }
            lastCreatedId = created.id
            Defaults.showAddGlow = false
            withAnimation(DTSpring.page) { rebuild() }
            return created.id
        } catch {
            throw AppError(error)
        }
    }

    func updateCheck(_ id: CheckID, _ patch: CheckPatch) async throws {
        guard let me, var c = raw.checks[id] else { return }
        let before = raw
        if let t = patch.text { c.text = t }
        if let d = patch.eventDate { c.eventDate = d }
        if let l = patch.eventDateLabel { c.eventDateLabel = l }
        if let t = patch.eventTime { c.eventTime = t }
        if let l = patch.location { c.location = l }
        if let f = patch.dateFlexible { c.dateFlexible = f }
        if let f = patch.timeFlexible { c.timeFlexible = f }
        if let m = patch.maxSquadSize { c.maxSquadSize = m }
        withAnimation(DTSpring.settle) { raw.checks[id] = c; rebuild() }
        guard !env.isFake else { return }
        do {
            let json = patch.json
            if !json.isEmpty { try await client.from("interest_checks").update(json).eq("id", value: id).execute() }
            if let wanted = patch.coAuthorIds {
                let current = raw.coAuthors.values.filter { $0.checkId == id }
                let currentIds = Set(current.map(\.userId))
                let add = wanted.filter { !currentIds.contains($0) }
                let remove = current.filter { !wanted.contains($0.userId) }
                if !add.isEmpty { try await client.from("check_co_authors").insert(add.map { NewCoAuthor(checkId: id, userId: $0, invitedBy: me) }).execute() }
                for r in remove { try await client.from("check_co_authors").delete().eq("id", value: r.id).execute() }
            }
            await refreshCheck(id)
        } catch {
            withAnimation(DTSpring.settle) { raw = before; rebuild() }
            throw AppError(error)
        }
    }

    func markShared(_ id: CheckID) async {
        guard var c = raw.checks[id], c.sharedAt == nil else { return }
        c.sharedAt = .now
        raw.checks[id] = c
        guard !env.isFake else { return }
        _ = try? await client.from("interest_checks").update(["shared_at": AnyJSON.string(PostgresTimestamp.format(.now))]).eq("id", value: id).is("shared_at", value: nil).execute()
    }

    func addComment(checkId: CheckID, text: String, mentions: [UserID]) async throws {
        guard let me else { throw AppError.unauthenticated }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if env.isFake {
            raw.comments[checkId, default: []].append(CheckComment(id: CommentID(UUID()), checkId: checkId, eventId: nil, userId: me, text: trimmed, mentions: mentions, createdAt: .now))
            withAnimation(DTSpring.page) { rebuild() }
            return
        }
        do {
            let inserted: CheckComment = try await client.from("check_comments").insert(NewComment(checkId: checkId, userId: me, text: trimmed, mentions: mentions)).select().single().execute().value
            if !(raw.comments[checkId] ?? []).contains(where: { $0.id == inserted.id }) {
                raw.comments[checkId, default: []].append(inserted)
            }
            withAnimation(DTSpring.page) { rebuild() }
        } catch { throw AppError(error) }
    }

    /// M1 read-only events: the only mutation allowed — saved_events.is_down.
    func setEventDown(_ id: EventID, down: Bool) async {
        guard let me else { return }
        let before = raw
        withAnimation(DTSpring.settle) {
            if down { raw.myEventDowns.insert(id); if !(raw.eventDowns[id] ?? []).contains(me) { raw.eventDowns[id, default: []].append(me) } }
            else { raw.myEventDowns.remove(id); raw.eventDowns[id]?.removeAll { $0 == me } }
            rebuild()
        }
        guard !env.isFake else { return }
        do {
            try await client.from("saved_events").upsert(NewSaved(userId: me, eventId: id, isDown: down), onConflict: "user_id,event_id").execute()
        } catch {
            withAnimation(DTSpring.settle) { raw = before; rebuild() }
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }

    func clearSquadOutcome(_ id: CheckID) { squadOutcome[id] = nil }

    /// "N new ↑" tap / return to top (§4.7).
    func releaseHeldInserts() {
        guard !heldInserts.isEmpty else { return }
        withAnimation(DTSpring.page) { heldInserts.removeAll(); rebuild() }
    }

    /// `removeCheck` side effect (§5.3) and the rlsDenied path.
    func removeCheck(_ id: CheckID) {
        withAnimation(DTSpring.settle) {
            raw.checks[id] = nil
            raw.removeRows(forCheck: id)
            if raw.sharedCheck?.id == id { raw.sharedCheck = nil; Defaults.activeSharedCheckId = nil }
            rebuild()
        }
    }

    /// DESIGN §4.1 seen-tracking: the reader had the NEW entry ≥ 60 % visible for 1.5 s.
    func markSeen(_ id: CheckID) {
        guard !seenIds.contains(id) else { return }
        seenIds.insert(id)
        Defaults.seenIds = seenIds
        // Flags are not removed while the user is on the feed; the next rebuild (tab leave / load) settles them.
    }

    // MARK: Realtime (§5.2 — deletes carry only `{id}`)

    private func record(_ f: @escaping (inout FeedRaw) -> Void) { buffer.record(f, into: &raw) }

    func apply(_ change: TableChange<InterestCheck>) async {
        switch change {
        case .insert(let c):
            guard raw.checks[c.id] == nil else { record { $0.checks[c.id] = c }; rebuild(); return }
            await ensureProfile(c.authorId)
            record { $0.checks[c.id] = c }
            if c.authorId != me, isScrolledDeep {
                // Held behind the "N new ↑" pill: compute the entry but do not surface it until release (§4.7).
                let projected = project()
                if let item = projected.items.first(where: { $0.id == "c:\(c.id)" }) { heldInserts.append(item) }
                return
            }
            withAnimation(DTSpring.page) { rebuild() }
            if c.authorId != me { Task { [weak self] in if let a = try? await self?.env.rpc.fofAnnotations() { self?.record { $0.fofAnnotations = a }; self?.rebuild() } } }
        case .update(let c, _):
            record { $0.checks[c.id] = c }
            withAnimation(DTSpring.settle) { rebuild() }
        case .delete(_, _):
            guard let id = change.deletedID(CheckID.self), raw.checks[id] != nil else { return }
            record { $0.checks[id] = nil; $0.removeRows(forCheck: id) }
            withAnimation(DTSpring.settle) { rebuild() }
        }
    }

    func apply(_ change: TableChange<CheckResponse>) async {
        switch change {
        case .insert(let r), .update(let r, _):
            guard raw.checks[r.checkId] != nil || raw.sharedCheck?.id == r.checkId else { await refreshCheck(r.checkId); return }
            await ensureProfile(r.userId)
            let me = self.me
            record { raw in
                if r.userId == me {
                    // The echo of my own INSERT: drop any placeholder for (checkId, me) whose id is not the server's (§4.5 invariant 2).
                    for (k, v) in raw.responses where v.checkId == r.checkId && v.userId == me && k != r.id { raw.responses[k] = nil }
                }
                raw.responses[r.id] = r
            }
            withAnimation(DTSpring.page) { rebuild() }
            if r.userId == me, case .update = change { _ = await env.squads.refreshMembership(checkId: r.checkId) }   // waitlist → down promotion (§5.6 path 1)
        case .delete(_, _):
            guard let id = change.deletedID(ResponseRowID.self), let row = raw.responses[id] else { return }
            record { $0.responses[id] = nil }
            withAnimation(DTSpring.settle) { rebuild() }
            if row.userId == me { _ = await env.squads.refreshMembership(checkId: row.checkId) }
        }
    }

    func apply(_ change: TableChange<CheckCoAuthor>) async {
        switch change {
        case .insert(let c), .update(let c, _):
            guard raw.checks[c.checkId] != nil else { await refreshCheck(c.checkId); return }
            await ensureProfile(c.userId)
            record { $0.coAuthors[c.id] = c }
            withAnimation(DTSpring.page) { rebuild() }
        case .delete(_, _):
            guard let id = change.deletedID(CoAuthorRowID.self), raw.coAuthors[id] != nil else { return }
            record { $0.coAuthors[id] = nil }
            withAnimation(DTSpring.settle) { rebuild() }
        }
    }

    func apply(_ change: TableChange<CheckComment>) {
        switch change {
        case .insert(let c), .update(let c, _):
            guard let checkId = c.checkId else { return }   // event comment → M1 drops it (§4.10)
            guard raw.checks[checkId] != nil else { Task { await self.refreshCheck(checkId) }; return }
            if raw.profiles[c.userId] == nil { Task { await self.ensureProfile(c.userId); self.rebuild() } }
            record { raw in
                var list = raw.comments[checkId] ?? []
                if let i = list.firstIndex(where: { $0.id == c.id }) { list[i] = c } else { list.append(c); list.sort { $0.createdAt < $1.createdAt } }
                raw.comments[checkId] = list
            }
            withAnimation(DTSpring.page) { rebuild() }
        case .delete(_, _):
            guard let id = change.deletedID(CommentID.self) else { return }
            record { raw in for (k, v) in raw.comments where v.contains(where: { $0.id == id }) { raw.comments[k] = v.filter { $0.id != id } } }
            withAnimation(DTSpring.settle) { rebuild() }
        }
    }

    /// Fetch one profile the raw tables reference but do not have (new FoF / co-author). One fetch per id.
    private func ensureProfile(_ id: UserID) async {
        guard raw.profiles[id] == nil, !profileFetches.contains(id), !env.isFake else { return }
        profileFetches.insert(id)
        defer { profileFetches.remove(id) }
        if let p = try? await fetchProfiles([id]).values.first { record { $0.profiles[id] = p } }
    }

    func isGuestsHidden(_ id: CheckID) -> Bool {
        guard let c = raw.checks[id] else { return false }
        return Mystery.isGuestsHidden(mystery: c.mystery, eventDate: c.eventDate, now: now, calendar: .current)
    }

    // MARK: Projection

    private func project() -> FeedProjection {
        guard let me else { return FeedProjection() }
        return FeedProject.project(raw: raw, me: me, now: now, calendar: .current, sort: sort,
                                   lastSeen: lastSeenFeedAt == .distantPast ? nil : lastSeenFeedAt, seenIds: seenIds)
    }

    func rebuild() {
        var p = project()
        if !heldInserts.isEmpty {
            let held = Set(heldInserts.map(\.id))
            p.items.removeAll { held.contains($0.id) }
        }
        if items != p.items { items = p.items }
        if hidden != p.hidden { hidden = p.hidden }
        if leftChecks != p.left { leftChecks = p.left }
    }

    // MARK: Clock (§4.8)

    private var clockTask: Task<Void, Never>?
    private var dayTask: Task<Void, Never>?
    private var tzTask: Task<Void, Never>?

    func startClock() {
        stopClock()
        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30), tolerance: .seconds(5), clock: .continuous)
                guard !Task.isCancelled else { break }
                self?.tick()
            }
        }
        dayTask = Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) { self?.dayChanged() }
        }
        tzTask = Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: .NSSystemTimeZoneDidChange) {
                self?.dayChanged()
                await self?.env.profile.syncTimezoneIfNeeded()
            }
        }
        tick()
    }

    func stopClock() { clockTask?.cancel(); dayTask?.cancel(); tzTask?.cancel(); clockTask = nil; dayTask = nil; tzTask = nil }

    func tick() { guard !env.isFake else { return }; now = .now; rebuild() }   // fake worlds keep the fixture clock

    private func dayChanged() {
        now = .now
        let before = Set(items.compactMap { $0.check.flatMap { $0.mystery == .unrevealed ? $0.id : nil } })
        rebuild()
        let after = Set(items.compactMap { $0.check.flatMap { $0.mystery == .unrevealed ? $0.id : nil } })
        revealedNow = before.subtracting(after)
    }

    /// Tab leave: bump the NEW watermark (and let seen flags settle).
    func markFeedSeen() {
        lastSeenFeedAt = .now
        Defaults.lastSeenFeedAt = lastSeenFeedAt
    }

    func reset() {
        stopClock()
        inflight.values.forEach { $0.cancel() }
        inflight = [:]; inflightIds = []
        raw = FeedRaw(); items = []; hidden = []; leftChecks = []; phase = .idle; lastError = nil
        revealedNow = []; squadOutcome = [:]; heldInserts = []; lastSeenFeedAt = .distantPast; seenIds = []; lastCreatedId = nil
        buffer = ChangeBuffer<FeedRaw>()
    }

    /// Fake worlds / snapshots: replace raw wholesale (only legal outside a select — boot, tests, previews).
    func load(raw r: FeedRaw, phase p: LoadPhase, now clock: Date? = nil) {
        raw = r
        phase = p
        if let clock { now = clock }
        rebuild()
    }

    /// Tests: apply a raw edit as if it were a realtime change (goes through the buffer).
    func applyRaw(_ f: @escaping (inout FeedRaw) -> Void) { record(f); rebuild() }
}
