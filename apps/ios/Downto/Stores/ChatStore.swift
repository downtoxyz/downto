// Stores/ChatStore.swift — one instance per open squad chat (ARCHITECTURE §3.5, §3.9, §4.2, §4.7.1, §7.6, §9.3).
// LANE: squads. `hydrate()` registers as `squads.openChat` and subscribes `dateConfirms` BEFORE its selects; `rebuild()` is
// the single place raw rows become display (drop-then-mask under the mystery lock, §9.3).
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
    static func unmasked(_ id: UserID) -> MemberKey { MemberKey("u:\(id)") }
    static func masked(squadId: SquadID, userId: UserID) -> MemberKey {
        MemberKey("k:" + String(Censor.hashSeed("\(squadId)::\(userId)"), radix: 16))
    }
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
    /// @usernames mentioned (resolved from `messages.mentions`), for LinkifiedText.
    var mentionNames: Set<String> = []
    /// Optimistic send state (nil once acked).
    var delivery: Delivery = .sent
    nonisolated enum Delivery: Hashable, Sendable { case sent, sending, failed }

    init(id: MessageID, sender: Presence?, kind: Kind, createdAt: Date, isMine: Bool, isGroupStart: Bool,
         mentionNames: Set<String> = [], delivery: Delivery = .sent) {
        self.id = id; self.sender = sender; self.kind = kind; self.createdAt = createdAt; self.isMine = isMine; self.isGroupStart = isGroupStart
        self.mentionNames = mentionNames; self.delivery = delivery
    }

    var plainText: String? { if case .text(let a) = kind { String(a.characters) } else { nil } }
    var isSystem: Bool { if case .system = kind { true } else { false } }
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

/// The server state the composer slot switches on (DESIGN §4.10 lifecycle table).
nonisolated enum SquadLifecycle: Hashable, Sendable {
    case live, grace, expiringSoon, ended, purged, notMember
}

@Observable final class ChatStore {
    static let pageSize = 100
    static let initialPage = 200

    let squadId: SquadID
    private(set) var squad: Squad?
    private(set) var check: InterestCheck?
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
    private(set) var lifecycle: SquadLifecycle = .live
    /// The clock every projection reads (tests drive it; the view ticks it every 30 s; day change resets it).
    private(set) var now: Date = .now
    /// Active poll, for the header chip (M1: scrolls to the placeholder row).
    private(set) var activePollMessageId: MessageID?
    private(set) var activePollQuestion: String?
    /// The id of the last message I sent — the view always scrolls to it (§7.6 item 2).
    private(set) var lastOwnSendId: MessageID?
    /// True while a page of older rows is being fetched (the 24 pt shimmer rule at the top).
    private(set) var isPaging = false
    private(set) var hasMoreHistory = true
    private var fakeBacklog: [Message] = []
    var draft: String { didSet { Defaults.setDraft(draft, squadId) } }
    private(set) var sending: [MessageID: PendingSend] = [:]
    /// Local bytes for optimistic image rows (`path == "local:<id>"`).
    private(set) var localImages: [MessageID: Data] = [:]
    private(set) var raw = ChatRaw()
    private var memberKeys: [MemberKey: UserID] = [:]
    private var confirmTask: Task<Void, Never>?
    private var dayTask: Task<Void, Never>?

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "chat")

    init(squadId: SquadID, env: AppEnvironment) {
        self.squadId = squadId
        self.env = env
        draft = Defaults.draft(squadId)
    }

    private var me: UserID? { env.session.state.userId }
    private var db: SupabaseClient { env.supabase }

    func userId(for key: MemberKey) -> UserID? { isMysteryLocked ? nil : memberKeys[key] }

    /// Display name → UserID for @mention resolution (empty while locked).
    var mentionable: [(username: String, displayName: String, id: UserID)] {
        guard !isMysteryLocked else { return [] }
        return raw.members.compactMap { m in
            guard m.userId != me, let p = raw.profiles[m.userId] else { return nil }
            return (p.username, p.displayName, m.userId)
        }
    }

    // MARK: Lifecycle

    /// Registers as squads.openChat + subscribes dateConfirms BEFORE the selects (§4.7.1), then selects → rebuild.
    func hydrate() async {
        env.squads.openChat = self
        if dayTask == nil {
            dayTask = Task { [weak self] in
                for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) { self?.tick() }
            }
        }
        if env.isFake {
            if let r = env.fakeChats[squadId] { raw = r }
            now = env.feed.now
            // Fake paging: keep the newest `initialPage` rows, park the rest so loadOlder() can prepend them like the server would.
            let sorted = raw.messages.values.sorted { $0.createdAt < $1.createdAt }
            if sorted.count > Self.initialPage {
                fakeBacklog = Array(sorted.prefix(sorted.count - Self.initialPage))
                for m in fakeBacklog { raw.messages[m.id] = nil }
                raw.oldestLoadedAt = sorted[sorted.count - Self.initialPage].createdAt
                hasMoreHistory = true
            }
            phase = .loaded(at: .now, stale: false); rebuild(); return
        }
        if confirmTask == nil {
            confirmTask = env.realtime.subscribeDateConfirms(squadId: squadId) { [weak self] change in self?.apply(change) }
        }
        if !phase.isSettled { phase = .loading }
        do {
            let squads: [Squad] = try await db.from("squads").select().eq("id", value: squadId).limit(1).execute().value
            guard let s = squads.first else {
                raw.squad = nil
                phase = .failed(.checkGone(isMine: false), hadSnapshot: false)
                lifecycle = .purged
                return
            }
            raw.squad = s
            async let membersReq: [SquadMember] = db.from("squad_members").select().eq("squad_id", value: squadId.raw).execute().value
            async let messagesReq: [Message] = db.from("messages").select().eq("squad_id", value: squadId.raw).order("created_at", ascending: false).limit(Self.initialPage).execute().value
            async let pollsReq: [SquadPoll] = db.from("squad_polls").select().eq("squad_id", value: squadId.raw).execute().value
            async let confirmsReq: [SquadDateConfirm] = db.from("squad_date_confirms").select().eq("squad_id", value: squadId.raw).execute().value
            async let requestsReq: [SquadJoinRequest] = db.from("squad_join_requests").select().eq("squad_id", value: squadId.raw).eq("status", value: "pending").execute().value
            if let c = s.checkId {
                let rows: [InterestCheck] = (try? await db.from("interest_checks").select().eq("id", value: c).limit(1).execute().value) ?? []
                raw.check = rows.first
            }
            if let e = s.eventId {
                let rows: [SquadEventLite] = (try? await db.from("events").select("id,title,date,date_display,time_display,venue").eq("id", value: e).limit(1).execute().value) ?? []
                raw.event = rows.first
            }
            raw.members = try await membersReq
            let page = try await messagesReq
            for m in page { raw.messages[m.id] = m }
            hasMoreHistory = page.count >= Self.initialPage
            raw.oldestLoadedAt = page.last?.createdAt ?? raw.oldestLoadedAt
            let polls = try await pollsReq
            raw.polls = Dictionary(uniqueKeysWithValues: polls.map { ($0.id, $0) })
            if !polls.isEmpty {
                let votes: [SquadPollVote] = (try? await db.from("squad_poll_votes").select().in("poll_id", values: polls.map(\.id.raw)).execute().value) ?? []
                raw.votes = Dictionary(grouping: votes, by: \.pollId)
            }
            raw.confirms = Dictionary(uniqueKeysWithValues: (try await confirmsReq).map { ($0.id, $0) })
            raw.joinRequests = try await requestsReq
            await fetchMissingProfiles()
            phase = .loaded(at: .now, stale: false)
            rebuild()
        } catch {
            log.error("chat hydrate: \(String(describing: error), privacy: .public)")
            phase = .failed(AppError(error), hadSnapshot: !raw.messages.isEmpty)
            rebuild()
        }
    }

    /// The view's `.task(id:)` cancellation handler.
    func teardown() {
        confirmTask?.cancel(); confirmTask = nil
        dayTask?.cancel(); dayTask = nil
        if env.squads.openChat === self { env.squads.openChat = nil }
    }

    private func fetchMissingProfiles() async {
        var ids = Set(raw.members.map(\.userId)).union(raw.messages.values.compactMap(\.senderId)).union(raw.joinRequests.map(\.userId))
        ids.subtract(raw.profiles.keys)
        guard !ids.isEmpty, !env.isFake else { return }
        if let ps: [Profile] = try? await db.from("profiles").select().in("id", values: ids.map(\.raw)).execute().value {
            for p in ps { raw.profiles[p.id] = p }
        }
    }

    // MARK: Sends (§4.5 shape: optimistic → await → reconcile-or-mark-failed)

    func send(text: String, mentions: [UserID]) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let me else { return }
        let id = MessageID(UUID())
        let optimistic = Message(id: id, squadId: squadId, senderId: me, text: trimmed, isSystem: false, messageType: .text, mentions: mentions,
                                 imagePath: nil, imageWidth: nil, imageHeight: nil, createdAt: .now)
        raw.messages[id] = optimistic
        sending[id] = PendingSend(clientId: id, text: trimmed, imageData: nil, startedAt: .now)
        lastOwnSendId = id
        draft = ""
        rebuild()
        if env.isFake { sending[id] = nil; rebuild(); return }
        do {
            let row = MessageInsert(id: id, squadId: squadId, senderId: me, text: trimmed, mentions: mentions, imagePath: nil, imageWidth: nil, imageHeight: nil)
            let inserted: Message = try await db.from("messages").insert(row).select().single().execute().value
            raw.messages[id] = inserted
            sending[id] = nil
            rebuild()
        } catch {
            log.error("send: \(String(describing: error), privacy: .public)")
            sending[id]?.failed = true
            if AppError(error) == .rlsDenied { await reloadSideTables() }
            rebuild()
        }
    }

    func sendImage(_ data: Data) async {
        guard let me else { return }
        let id = MessageID(UUID())
        let resized: ImageResizer.Resized
        do {
            resized = try await Task.detached(priority: .userInitiated) { try ImageResizer.resizeForChat(data) }.value
        } catch { env.toasts.show("couldn't read that image", style: .error); return }
        localImages[id] = resized.data
        raw.messages[id] = Message(id: id, squadId: squadId, senderId: me, text: "", isSystem: false, messageType: .text, mentions: [],
                                   imagePath: "local:\(id)", imageWidth: resized.width, imageHeight: resized.height, createdAt: .now)
        sending[id] = PendingSend(clientId: id, text: nil, imageData: resized.data, startedAt: .now)
        lastOwnSendId = id
        rebuild()
        if env.isFake { sending[id] = nil; rebuild(); return }
        do {
            let path = try await env.images.uploadChatImage(resized, squadId: squadId)
            let row = MessageInsert(id: id, squadId: squadId, senderId: me, text: "", mentions: [], imagePath: path, imageWidth: resized.width, imageHeight: resized.height)
            let inserted: Message = try await db.from("messages").insert(row).select().single().execute().value
            raw.messages[id] = inserted
            sending[id] = nil
            rebuild()
        } catch {
            log.error("sendImage: \(String(describing: error), privacy: .public)")
            sending[id]?.failed = true
            rebuild()
        }
    }

    func retry(_ id: MessageID) async {
        guard let p = sending[id], p.failed else { return }
        let mentions = raw.messages[id]?.mentions ?? []
        discard(id)
        if let data = p.imageData { await sendImage(data) } else if let t = p.text { await send(text: t, mentions: mentions) }
    }

    func discard(_ id: MessageID) {
        sending[id] = nil
        raw.messages[id] = nil
        localImages[id] = nil
        rebuild()
    }

    func markRead() async {
        await env.squads.markRead(squadId)
        await env.push.clearDelivered(for: squadId)
        scroll.unseenCount = 0
    }

    func confirmDate(_ r: ConfirmResponse) async {
        guard let me else { return }
        // Optimistic: flip my row locally; the realtime UPDATE on squad_date_confirms reconciles.
        if let key = raw.confirms.first(where: { $0.value.userId == me })?.key {
            var row = raw.confirms[key]!
            row.response = r
            row.respondedAt = .now
            raw.confirms[key] = row
            rebuild()
        }
        guard !env.isFake else { return }
        do { try await env.api.confirmDate(squadId: squadId, response: r) } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
            await reloadSideTables()
        }
    }

    func respondJoinRequest(_ id: JoinRequestID, accept: Bool) async {
        raw.joinRequests.removeAll { $0.id == id }
        rebuild()
        guard !env.isFake else { return }
        do {
            try await db.from("squad_join_requests").update(["status": accept ? "accepted" : "declined"]).eq("id", value: id).eq("status", value: "pending").execute()
            await reloadSideTables()
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }

    func leave() async { await env.squads.leave(squadId) }

    func revive() async {
        await env.squads.revive(squadId)
        await reloadSideTables()
    }

    func extend() async {
        await env.squads.extend(squadId)
        await reloadSideTables()
    }

    // MARK: Realtime

    func apply(_ change: TableChange<Message>) async {
        switch change {
        case .insert(let m), .update(let m, _):
            // Echo of my optimistic row arrives under the same client id → dictionary upsert dedupes.
            raw.messages[m.id] = m
            if sending[m.id] != nil { sending[m.id] = nil }
            if let sid = m.senderId, raw.profiles[sid] == nil { await fetchMissingProfiles() }
            if m.senderId != me, !scroll.isAtBottom, SquadsStore.survivesLock(m, locked: isMysteryLocked) { scroll.unseenCount += 1 }
        case .delete:
            if let id = change.deletedID(MessageID.self) { raw.messages[id] = nil }
        }
        rebuild()
    }

    func apply(_ change: TableChange<SquadPollVote>) {
        switch change {
        case .insert(let v), .update(let v, _):
            var list = raw.votes[v.pollId, default: []]
            list.removeAll { $0.id == v.id }
            list.append(v)
            raw.votes[v.pollId] = list
        case .delete(_, let keys):
            if let id = TableChange<SquadPollVote>.uuid(from: keys["id"]) {
                for (p, list) in raw.votes { raw.votes[p] = list.filter { $0.id != id } }
            }
        }
        rebuild()
    }

    func apply(_ change: TableChange<SquadDateConfirm>) {
        switch change {
        case .insert(let c), .update(let c, _): raw.confirms[c.id] = c
        case .delete: if let id = change.deletedID(ConfirmRowID.self) { raw.confirms[id] = nil }
        }
        rebuild()
    }

    /// Prepends up to 100 older rows (§7.6 item 3); returns how many so the scroll controller can anchor. Bypasses the buffer.
    func loadOlder() async -> Int {
        guard !isPaging, hasMoreHistory, let oldest = raw.oldestLoadedAt else { return 0 }
        isPaging = true
        defer { isPaging = false }
        if env.isFake {
            let page = Array(fakeBacklog.suffix(Self.pageSize))
            fakeBacklog.removeLast(page.count)
            for m in page { raw.messages[m.id] = m }
            if let first = page.first { raw.oldestLoadedAt = min(oldest, first.createdAt) }
            hasMoreHistory = !fakeBacklog.isEmpty
            rebuild()
            return page.count
        }
        do {
            let rows: [Message] = try await db.from("messages").select().eq("squad_id", value: squadId)
                .lt("created_at", value: PostgresTimestamp.format(oldest)).order("created_at", ascending: false).limit(Self.pageSize).execute().value
            var added = 0
            for m in rows where raw.messages[m.id] == nil { raw.messages[m.id] = m; added += 1 }
            if let last = rows.last { raw.oldestLoadedAt = min(oldest, last.createdAt) }
            hasMoreHistory = rows.count >= Self.pageSize
            await fetchMissingProfiles()
            rebuild()
            return added
        } catch {
            log.error("loadOlder: \(String(describing: error), privacy: .public)")
            return 0
        }
    }

    /// polls, votes, confirms, joinRequests, members, squad row (after a system / non-text message — no realtime on squads/squad_members).
    func reloadSideTables() async {
        guard !env.isFake else { rebuild(); return }
        do {
            async let squadReq: [Squad] = db.from("squads").select().eq("id", value: squadId.raw).limit(1).execute().value
            async let membersReq: [SquadMember] = db.from("squad_members").select().eq("squad_id", value: squadId.raw).execute().value
            async let pollsReq: [SquadPoll] = db.from("squad_polls").select().eq("squad_id", value: squadId.raw).execute().value
            async let confirmsReq: [SquadDateConfirm] = db.from("squad_date_confirms").select().eq("squad_id", value: squadId.raw).execute().value
            async let requestsReq: [SquadJoinRequest] = db.from("squad_join_requests").select().eq("squad_id", value: squadId.raw).eq("status", value: "pending").execute().value
            let squads = try await squadReq
            if let s = squads.first { raw.squad = s } else { lifecycle = .purged }
            raw.members = try await membersReq
            let polls = try await pollsReq
            raw.polls = Dictionary(uniqueKeysWithValues: polls.map { ($0.id, $0) })
            if !polls.isEmpty {
                let votes: [SquadPollVote] = (try? await db.from("squad_poll_votes").select().in("poll_id", values: polls.map(\.id.raw)).execute().value) ?? []
                raw.votes = Dictionary(grouping: votes, by: \.pollId)
            } else { raw.votes = [:] }
            raw.confirms = Dictionary(uniqueKeysWithValues: (try await confirmsReq).map { ($0.id, $0) })
            raw.joinRequests = try await requestsReq
            if let c = raw.squad?.checkId, let rows: [InterestCheck] = try? await db.from("interest_checks").select().eq("id", value: c).limit(1).execute().value { raw.check = rows.first ?? raw.check }
            await fetchMissingProfiles()
            rebuild()
        } catch {
            log.error("reloadSideTables: \(String(describing: error), privacy: .public)")
        }
    }

    // MARK: Projection (§9.3 enforcement point 2)

    func rebuild() {
        let me = self.me
        let now = self.now
        let cal = Calendar.current
        squad = raw.squad
        check = raw.check
        let sortedMembers = raw.members.sorted { $0.joinedAt < $1.joinedAt }
        myRole = sortedMembers.first { $0.userId == me }?.role
        let locked = (raw.check?.mystery ?? false) && Mystery.isGuestsHidden(mystery: true, eventDate: raw.check?.eventDate, now: now, calendar: cal)
        isMysteryLocked = locked
        // Side tables carry raw user ids (poll.createdBy, confirm.userId) — under the lock they are not published at all (§9.3).
        polls = locked ? [:] : raw.polls
        votes = locked ? [:] : raw.votes
        confirms = locked ? [] : raw.confirms.values.sorted { ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast) }
        joinRequests = raw.joinRequests.filter { $0.status == .pending }

        let assignment = locked ? Censor.kaomojiAssignment(threadSeed: squadId.description, userIds: sortedMembers.map(\.userId)) : [:]
        var keys: [MemberKey: UserID] = [:]
        func presence(_ uid: UserID) -> Presence {
            if locked { return .masked(kaomoji: assignment[uid] ?? Censor.kaomojiForUser(threadSeed: squadId.description, userId: uid), scramble: Censor.wingdings(seed: "\(squadId)::\(uid)")) }
            let p = raw.profiles[uid]
            return .person(PersonRef(id: uid, displayName: p?.displayName ?? "someone", username: p?.username ?? "", avatarLetter: p?.avatarLetter ?? "?", isMe: uid == me))
        }
        members = sortedMembers.map { m in
            let key = locked ? MemberKey.masked(squadId: squadId, userId: m.userId) : MemberKey.unmasked(m.userId)
            keys[key] = m.userId
            return MemberDisplay(id: key, presence: presence(m.userId), role: m.role, joinedAt: m.joinedAt)
        }
        memberKeys = keys

        // Drop-then-mask: under the lock only text/image rows from a real sender survive (web SquadChat.tsx:415-418 parity).
        let visible = raw.messages.values.filter { SquadsStore.survivesLock($0, locked: locked) }.sorted { $0.createdAt < $1.createdAt }
        let usernames: [UserID: String] = raw.profiles.mapValues(\.username)
        var out: [ChatMessageDisplay] = []
        out.reserveCapacity(visible.count)
        var prev: Message?
        for m in visible {
            let isMine = m.senderId == me
            let sender = m.senderId.map(presence)
            let kind: ChatMessageDisplay.Kind
            if m.isSystem { kind = .system(m.text ?? "") }
            else if m.messageType == .poll { kind = .pollPlaceholder(question: raw.polls.values.first { $0.messageId == m.id }?.question ?? (m.text ?? "poll")) }
            else if m.messageType == .dateConfirm {
                if let date = raw.squad?.lockedDate ?? raw.check?.eventDate {
                    let responses = sortedMembers.filter { $0.role == .member }.map { member in
                        ConfirmEntry(person: presence(member.userId), response: raw.confirms.values.first { $0.userId == member.userId && $0.messageId == m.id }?.response)
                    }
                    kind = .dateConfirm(date: date, time: raw.check?.eventTime, responses: responses)
                } else { kind = .system(m.text ?? "") }
            }
            else if let path = m.imagePath { kind = .image(path: path, width: m.imageWidth ?? 4, height: m.imageHeight ?? 3) }
            else if m.messageType == .text { kind = .text(AttributedString(locked ? Censor.stripAtMentions(m.text ?? "") : (m.text ?? ""))) }
            else { kind = .unknown }
            let groupStart: Bool = {
                guard let p = prev, !m.isSystem, !p.isSystem, m.messageType == .text, p.messageType == .text, p.senderId == m.senderId else { return true }
                return m.createdAt.timeIntervalSince(p.createdAt) > 120
            }()
            let delivery: ChatMessageDisplay.Delivery = sending[m.id].map { $0.failed ? .failed : .sending } ?? .sent
            let mentionNames = locked ? Set<String>() : Set(m.mentions.compactMap { usernames[$0] })
            out.append(ChatMessageDisplay(id: m.id, sender: sender, kind: kind, createdAt: m.createdAt, isMine: isMine, isGroupStart: groupStart, mentionNames: mentionNames, delivery: delivery))
            prev = m
        }
        messages = out

        // Pending date-confirm prompt (members only, never while locked, cleared once locked by all).
        pendingConfirm = nil
        if !locked, myRole == .member, raw.squad?.dateStatus == .proposed, let me, let date = raw.squad?.lockedDate,
           let mine = raw.confirms.values.first(where: { $0.userId == me }) {
            pendingConfirm = DateConfirmPrompt(messageId: mine.messageId, date: date, time: raw.check?.eventTime, answered: mine.response)
        }

        // Active poll chip (M1 → placeholder row).
        if !locked, let active = raw.polls.values.filter({ $0.status == .active }).sorted(by: { $0.createdAt > $1.createdAt }).first {
            activePollMessageId = active.messageId; activePollQuestion = active.question
        } else { activePollMessageId = nil; activePollQuestion = nil }

        // Lifecycle (DESIGN §4.10 table).
        if lifecycle == .purged, raw.squad == nil { /* keep */ }
        else if let s = raw.squad {
            if phase.isSettled, myRole == nil { lifecycle = .notMember }
            else if s.archivedAt != nil { lifecycle = .ended }
            else if let exp = s.expiresAt, exp.timeIntervalSince(now) < 3600 { lifecycle = .expiringSoon }
            else if s.graceStartedAt != nil || (raw.check?.expiresAt.map { $0 < now } ?? false) { lifecycle = .grace }
            else { lifecycle = .live }
        }
    }

    func load(raw r: ChatRaw) { raw = r; phase = .loaded(at: .now, stale: false); rebuild() }
    func tick() { guard !env.isFake else { return }; now = .now; rebuild() }
    /// Tests / fixtures: drive the clock by hand.
    func setNow(_ d: Date) { now = d; rebuild() }
    func setScrollAtBottom(_ atBottom: Bool) { scroll.isAtBottom = atBottom; if atBottom { scroll.unseenCount = 0 } }
}

/// Insert shape for `messages` — the client picks the id so the realtime echo dedupes against the optimistic row (§4.5).
nonisolated private struct MessageInsert: Encodable, Sendable {
    let id: MessageID
    let squadId: SquadID
    let senderId: UserID
    let text: String
    let mentions: [UserID]
    let imagePath: String?
    let imageWidth: Int?
    let imageHeight: Int?
}
