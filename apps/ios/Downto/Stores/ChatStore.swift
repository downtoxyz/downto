// Stores/ChatStore.swift — one instance per open squad chat (ARCHITECTURE §3.5, §3.9, §4.2, §7.6, §9.3).
// LANE: squads. SKELETON — `// TODO(squads)` bodies belong to the squads lane.
import Foundation
import Observation
import Supabase
import os

nonisolated struct ChatRaw: Codable, Sendable, Equatable {
    var squad: Squad?
    var check: InterestCheck?
    var event: SquadEventLite?
    var members: [SquadMember] = []
    var profiles: [UserID: Profile] = [:]
    var messages: [MessageID: Message] = [:]
    var polls: [PollID: SquadPoll] = [:]
    var votes: [PollID: [SquadPollVote]] = [:]
    var confirms: [ConfirmRowID: SquadDateConfirm] = [:]
    var joinRequests: [SquadJoinRequest] = []
    var oldestLoadedAt: Date?
    init() {}
}

/// Opaque row key: "u:<uuid>" unmasked, "k:<hex>" masked (one-way) — §3.5.
nonisolated struct MemberKey: Hashable, Sendable, CustomStringConvertible {
    let description: String
    init(_ s: String) { description = s }
}

nonisolated struct MemberDisplay: Identifiable, Hashable, Sendable {
    let id: MemberKey
    let presence: Presence
    let role: SquadRole
    let joinedAt: Date
    init(id: MemberKey, presence: Presence, role: SquadRole, joinedAt: Date) { self.id = id; self.presence = presence; self.role = role; self.joinedAt = joinedAt }
}

nonisolated struct ConfirmEntry: Hashable, Sendable {
    let person: Presence
    let response: ConfirmResponse?
    init(person: Presence, response: ConfirmResponse?) { self.person = person; self.response = response }
}

nonisolated struct ChatMessageDisplay: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case text(AttributedString)
        case system(String)
        case image(path: String, width: Int, height: Int)
        case dateConfirm(date: LocalDate, time: String?, responses: [ConfirmEntry])
        case pollPlaceholder(question: String)
        case unknown
    }
    let id: MessageID
    let sender: Presence?
    let kind: Kind
    let createdAt: Date
    let isMine: Bool
    /// First row of a sender group (same sender within 2 min) — §7.6 item 1.
    let isGroupStart: Bool
    init(id: MessageID, sender: Presence?, kind: Kind, createdAt: Date, isMine: Bool, isGroupStart: Bool) {
        self.id = id; self.sender = sender; self.kind = kind; self.createdAt = createdAt; self.isMine = isMine; self.isGroupStart = isGroupStart
    }
}

nonisolated struct ChatScrollState: Hashable, Sendable {
    var isAtBottom = true
    var unseenCount = 0
    var anchor: MessageID?
    init() {}
}

nonisolated struct DateConfirmPrompt: Hashable, Sendable {
    let messageId: MessageID
    let date: LocalDate
    let time: String?
    let answered: ConfirmResponse?
    init(messageId: MessageID, date: LocalDate, time: String?, answered: ConfirmResponse?) { self.messageId = messageId; self.date = date; self.time = time; self.answered = answered }
}

nonisolated struct PendingSend: Hashable, Sendable {
    let clientId: MessageID
    let text: String?
    let imageData: Data?
    let startedAt: Date
    var failed: Bool
    init(clientId: MessageID, text: String?, imageData: Data?, startedAt: Date, failed: Bool = false) { self.clientId = clientId; self.text = text; self.imageData = imageData; self.startedAt = startedAt; self.failed = failed }
}

@Observable final class ChatStore {
    let squadId: SquadID
    private(set) var squad: Squad?
    private(set) var members: [MemberDisplay] = []
    private(set) var messages: [ChatMessageDisplay] = []
    private(set) var polls: [PollID: SquadPoll] = [:]
    private(set) var votes: [PollID: [SquadPollVote]] = [:]
    private(set) var confirms: [SquadDateConfirm] = []
    private(set) var joinRequests: [SquadJoinRequest] = []
    var scroll = ChatScrollState()
    private(set) var myRole: SquadRole?
    private(set) var pendingConfirm: DateConfirmPrompt?
    private(set) var isMysteryLocked = false
    private(set) var phase: LoadPhase = .idle
    var draft: String { didSet { Defaults.setDraft(draft, squadId) } }
    private(set) var sending: [MessageID: PendingSend] = [:]
    private(set) var raw = ChatRaw()
    private var memberKeys: [MemberKey: UserID] = [:]

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "chat")

    init(squadId: SquadID, env: AppEnvironment) {
        self.squadId = squadId
        self.env = env
        draft = Defaults.draft(squadId)
    }

    func userId(for key: MemberKey) -> UserID? { isMysteryLocked ? nil : memberKeys[key] }

    /// TODO(squads): registers as squads.openChat + subscribes dateConfirms BEFORE the selects (§4.7.1), then selects → rebuild.
    func hydrate() async { env.squads.openChat = self; phase = .loaded(at: .now, stale: false); rebuild() }
    func send(text: String, mentions: [UserID]) async {}
    func sendImage(_ data: Data) async {}
    func retry(_ id: MessageID) async {}
    func discard(_ id: MessageID) {}
    func markRead() async { await env.squads.markRead(squadId); await env.push.clearDelivered(for: squadId) }
    func confirmDate(_ r: ConfirmResponse) async {}
    func respondJoinRequest(_ id: JoinRequestID, accept: Bool) async {}
    func leave() async {}
    func apply(_ change: TableChange<Message>) async {}
    func apply(_ change: TableChange<SquadPollVote>) {}
    func apply(_ change: TableChange<SquadDateConfirm>) {}
    /// Returns rows prepended so the scroll controller can anchor (§7.6); no-op while a page is in flight.
    func loadOlder() async -> Int { 0 }
    func reloadSideTables() async {}
    /// TODO(squads): raw → members/messages via Presence (§9); computes isGroupStart.
    func rebuild() {}

    func load(raw r: ChatRaw) { raw = r; phase = .loaded(at: .now, stale: false); rebuild() }
}
