// Stores/FeedStore.swift — FeedRaw + display models + FeedStore (ARCHITECTURE §3.5, §4.2–§4.8, §7.1, §7.4).
// LANE: feed. This file is a SKELETON: the public surface below is the contract the shell and the other stores compile
// against; every `// TODO(feed)` body is the feed lane's to implement. Do not change signatures without updating callers.
import Foundation
import Observation
import Supabase
import os

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
    init(text: String? = nil, eventDate: LocalDate?? = nil, eventDateLabel: String?? = nil, eventTime: String?? = nil,
         location: String?? = nil, dateFlexible: Bool? = nil, timeFlexible: Bool? = nil, coAuthorIds: [UserID]? = nil) {
        self.text = text; self.eventDate = eventDate; self.eventDateLabel = eventDateLabel; self.eventTime = eventTime
        self.location = location; self.dateFlexible = dateFlexible; self.timeFlexible = timeFlexible; self.coAuthorIds = coAuthorIds
    }
}

nonisolated struct CreatePrefill: Hashable, Sendable {
    var text: String?
    var when: String?
    var location: String?
    init(text: String? = nil, when: String? = nil, location: String? = nil) { self.text = text; self.when = when; self.location = location }
}

nonisolated enum CheckRouteOutcome: Hashable, Sendable { case visible, gone(isMine: Bool), outsideNetwork, unreachable }

// MARK: - Store

@Observable final class FeedStore {
    enum SquadOutcome: Hashable, Sendable { case formed, joined }

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
    // raw
    private(set) var raw = FeedRaw()

    var hasChecks: Bool { raw.checks.contains { $0.value.archivedAt == nil } || raw.sharedCheck != nil }

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "feed")

    init(env: AppEnvironment) {
        self.env = env
        sort = Defaults.feedSort
        lastSeenFeedAt = Defaults.lastSeenFeedAt ?? .distantPast
    }

    // MARK: Lifecycle

    /// TODO(feed): TaskGroup of the §4.4 selects → row merge → replay buffer → rebuild. Persist the snapshot via env.cache.
    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); return }
        phase = phase.isSettled ? phase : .loading
        phase = .loaded(at: .now, stale: false)
        rebuild()
    }

    /// TODO(feed): same as hydrate but keeps items until the new raw lands; never assigns raw wholesale (§4.7.1).
    func refresh() async { await hydrate() }

    /// TODO(feed): one check + its 4 sub-tables + missing profiles → merge → rebuild. Silent no-op when RLS returns nothing.
    func refreshCheck(_ id: CheckID) async {}

    /// TODO(feed): §4.10 — re-run get_friends_events + scoped saved_events select, debounced 1 s.
    func refreshEvent(_ id: EventID) async {}

    /// TODO(feed)
    func ensureLoaded(_ id: CheckID) async -> Bool { raw.checks[id] != nil }

    /// §7.4 — the ONE resolution step for every check id that reaches the router. TODO(feed): the getCheckState / inject path.
    func resolveCheckRoute(_ id: CheckID) async -> CheckRouteOutcome {
        if await ensureLoaded(id) { return .visible }
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

    /// §7.1 — rpc.sharedCheck → raw.sharedCheck; persists dt.activeSharedCheckId. TODO(feed): full behaviour.
    func injectSharedCheck(_ id: CheckID) async -> Bool {
        do {
            guard let s = try await env.rpc.sharedCheck(id) else { return false }
            raw.sharedCheck = s
            Defaults.activeSharedCheckId = id
            rebuild()
            return true
        } catch { return false }
    }

    func clearSharedCheck() { raw.sharedCheck = nil; Defaults.activeSharedCheckId = nil; rebuild() }

    // MARK: Mutations — TODO(feed): every one is before → optimistic → await → reconcile-or-restore (§4.5)

    func toggleDown(_ id: CheckID) async {}
    func hide(_ id: CheckID) async {}
    func unhide(_ id: CheckID) async {}
    @discardableResult func archive(_ id: CheckID) async -> Bool { false }
    func revive(_ id: CheckID) async {}
    func acceptTag(_ id: CheckID) async {}
    func declineTag(_ id: CheckID) async {}
    func createCheck(_ draft: CheckDraft) async throws -> CheckID { throw AppError.unknown("not built yet") }
    func updateCheck(_ id: CheckID, _ patch: CheckPatch) async throws {}
    func markShared(_ id: CheckID) async {}
    func addComment(checkId: CheckID, text: String, mentions: [UserID]) async throws {}
    func setEventDown(_ id: EventID, down: Bool) async {}
    func clearSquadOutcome(_ id: CheckID) { squadOutcome[id] = nil }
    /// "N new ↑" tap / return to top (§4.7).
    func releaseHeldInserts() { heldInserts.removeAll(); rebuild() }

    // MARK: Realtime — TODO(feed) (§5.2 delete-by-id rules)

    func apply(_ change: TableChange<InterestCheck>) async {}
    func apply(_ change: TableChange<CheckResponse>) async {}
    func apply(_ change: TableChange<CheckCoAuthor>) async {}
    func apply(_ change: TableChange<CheckComment>) {}

    func isGuestsHidden(_ id: CheckID) -> Bool {
        guard let c = raw.checks[id] else { return false }
        return Mystery.isGuestsHidden(mystery: c.mystery, eventDate: c.eventDate, now: now, calendar: .current)
    }

    // MARK: Projection — TODO(feed): the pure `project(raw:me:now:calendar:sort:lastSeen:)` + FeedOrdering

    func rebuild() {}

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

    func tick() { now = .now; rebuild() }

    private func dayChanged() {
        now = .now
        let before = Set(items.compactMap { $0.check.flatMap { $0.mystery == .unrevealed ? $0.id : nil } })
        rebuild()
        let after = Set(items.compactMap { $0.check.flatMap { $0.mystery == .unrevealed ? $0.id : nil } })
        revealedNow = before.subtracting(after)
    }

    /// Tab leave: bump the NEW watermark.
    func markFeedSeen() { lastSeenFeedAt = .now; Defaults.lastSeenFeedAt = lastSeenFeedAt }

    func reset() {
        stopClock()
        raw = FeedRaw(); items = []; hidden = []; leftChecks = []; phase = .idle; lastError = nil
        revealedNow = []; squadOutcome = [:]; heldInserts = []; lastSeenFeedAt = .distantPast
    }

    /// Fake worlds / snapshots: replace raw wholesale (only legal outside a select — boot, tests, previews).
    func load(raw r: FeedRaw, phase p: LoadPhase) { raw = r; phase = p; rebuild() }
}
