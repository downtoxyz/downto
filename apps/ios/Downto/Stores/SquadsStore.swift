// Stores/SquadsStore.swift — squad list + unread + per-squad channels (ARCHITECTURE §3.5, §3.9, §4.2, §4.10, §5.5).
// LANE: squads. SKELETON — see the FeedStore header for the rule. `// TODO(squads)` bodies are the squads lane's.
import Foundation
import Observation
import Supabase
import os

nonisolated struct SquadsRaw: Codable, Sendable, Equatable {
    var squads: [SquadID: Squad] = [:]
    var members: [SquadID: [SquadMember]] = [:]
    var profiles: [UserID: Profile] = [:]
    var checks: [SquadID: InterestCheck] = [:]
    var events: [SquadID: SquadEventLite] = [:]
    var readCursors: [SquadID: Date] = [:]
    var lastMessages: [SquadID: Message] = [:]
    init() {}
}

nonisolated struct MessagePreview: Hashable, Sendable {
    let sender: Presence?
    let text: String
    let createdAt: Date
    init(sender: Presence?, text: String, createdAt: Date) { self.sender = sender; self.text = text; self.createdAt = createdAt }
}

nonisolated struct SquadRow: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable { case check(CheckID), event(EventID) }
    let id: SquadID
    let name: String
    let kind: Kind
    let members: [Presence]
    let memberCount: Int
    let myRole: SquadRole
    let eventDate: LocalDate?
    let eventDateLabel: String?
    let eventTime: String?
    let dateStatus: DateStatus?
    let expiresAt: Date?
    let lastMessage: MessagePreview?
    let lastActivityAt: Date?
    let hasUnread: Bool
    let isMystery: Bool

    init(id: SquadID, name: String, kind: Kind, members: [Presence], memberCount: Int, myRole: SquadRole, eventDate: LocalDate?,
         eventDateLabel: String?, eventTime: String?, dateStatus: DateStatus?, expiresAt: Date?, lastMessage: MessagePreview?,
         lastActivityAt: Date?, hasUnread: Bool, isMystery: Bool) {
        self.id = id; self.name = name; self.kind = kind; self.members = members; self.memberCount = memberCount; self.myRole = myRole
        self.eventDate = eventDate; self.eventDateLabel = eventDateLabel; self.eventTime = eventTime; self.dateStatus = dateStatus
        self.expiresAt = expiresAt; self.lastMessage = lastMessage; self.lastActivityAt = lastActivityAt; self.hasUnread = hasUnread
        self.isMystery = isMystery
    }
}

/// §4.10 — what `refreshMembership(checkId:)` tells the feed so CheckEntry plays the right ceremony.
nonisolated struct MembershipOutcome: Hashable, Sendable {
    let squadId: SquadID?
    let role: SquadRole?
    /// I was not a member before.
    let joined: Bool
    /// squad.createdAt ≥ my response's createdAt − 2 s.
    let formedNow: Bool
    init(squadId: SquadID?, role: SquadRole?, joined: Bool, formedNow: Bool) {
        self.squadId = squadId; self.role = role; self.joined = joined; self.formedNow = formedNow
    }
    static let none = MembershipOutcome(squadId: nil, role: nil, joined: false, formedNow: false)
}

nonisolated struct SquadSections: Sendable, Equatable {
    var newMessages: [SquadRow] = []
    var upcoming: [SquadRow] = []
    var fading: [SquadRow] = []
    init() {}
}

@Observable final class SquadsStore {
    private(set) var rows: [SquadRow] = []
    private(set) var sections = SquadSections()
    private(set) var unread: Set<SquadID> = []
    private(set) var readCursors: [SquadID: Date] = [:]
    private(set) var lastMessages: [SquadID: Message] = [:]
    private(set) var phase: LoadPhase = .idle
    var openSquadId: SquadID? { env.router.openSquadId }
    private(set) var raw = SquadsRaw()
    /// Set/cleared by SquadChatView.task(id:) — the hub's squad(id) handler reaches the open chat through this (§4.10).
    weak var openChat: ChatStore?

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "squads")

    init(env: AppEnvironment) { self.env = env }

    /// TODO(squads): realtime.setSquadList with snapshot ids BEFORE the selects (§4.7.1), then the §4.2 selects → merge → rebuild.
    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); return }
        phase = .loaded(at: .now, stale: false)
        rebuild()
    }
    func refresh() async { await hydrate() }
    /// TODO(squads): single squad + members + its check OR event row + last message.
    func refreshSquad(_ id: SquadID) async {}
    /// TODO(squads): refetch squads + squad_members for that check, merge, rebuild → feed.setMySquadMemberships.
    func refreshMembership(checkId: CheckID) async -> MembershipOutcome { .none }
    /// get_unread_squad_ids — server truth wins (§5.5).
    func refreshUnread() async {}
    func role(of userId: UserID, in squadId: SquadID) -> SquadRole? {
        raw.members[squadId]?.first { $0.userId == userId }?.role
    }
    func markUnread(_ id: SquadID) { unread.insert(id); rebuild() }
    /// TODO(squads): local cursor = now first, then upsert squad_read_cursors.
    func markRead(_ id: SquadID) async { unread.remove(id); readCursors[id] = .now; rebuild() }
    /// TODO(squads): last-message preview + unread rule, every subscribed squad; forwards to openChat?.apply (§4.10).
    func apply(_ message: Message) {
        if let openChat, openChat.squadId == message.squadId { Task { await openChat.apply(.insert(message)) } }
    }
    func leave(_ id: SquadID) async {}
    func extend(_ id: SquadID) async {}

    /// TODO(squads): SquadCountdown + unread rule → sections; THEN feed.setMySquadMemberships(…) and realtime.setSquadList (§4.10).
    func rebuild() {
        let me = env.session.state.userId
        var memberships: [CheckID: SquadMembership] = [:]
        if let me {
            for (sid, members) in raw.members {
                guard let mine = members.first(where: { $0.userId == me }), let checkId = raw.squads[sid]?.checkId else { continue }
                memberships[checkId] = SquadMembership(squadId: sid, role: mine.role)
            }
        }
        env.feed.setMySquadMemberships(memberships)
        env.realtime.setSquadList(rows.map(\.id)) { [weak self] m in self?.apply(m) }
    }

    func reset() { rows = []; sections = SquadSections(); unread = []; readCursors = [:]; lastMessages = [:]; raw = SquadsRaw(); phase = .idle; openChat = nil }

    func load(raw r: SquadsRaw, phase p: LoadPhase) { raw = r; phase = p; rebuild() }
}
