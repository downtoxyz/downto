// Stores/SquadsStore.swift — squad list + unread + per-squad channels (ARCHITECTURE §3.5, §3.9, §4.2, §4.10, §5.5, §9.3).
// LANE: squads. Hydrate selects merge BY ROW (never `raw = fetched`); `rebuild()` is the only projection and it also
// pushes `mySquadMemberships` into the feed and the squad-id list into the realtime hub (§4.10).
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
    /// archived_at set (still readable inside the 7 d window) — ENDED / PAST rows (DESIGN §7.7).
    var isEnded = false

    init(id: SquadID, name: String, kind: Kind, members: [Presence], memberCount: Int, myRole: SquadRole, eventDate: LocalDate?,
         eventDateLabel: String?, eventTime: String?, dateStatus: DateStatus?, expiresAt: Date?, lastMessage: MessagePreview?,
         lastActivityAt: Date?, hasUnread: Bool, isMystery: Bool, isEnded: Bool = false) {
        self.id = id; self.name = name; self.kind = kind; self.members = members; self.memberCount = memberCount; self.myRole = myRole
        self.eventDate = eventDate; self.eventDateLabel = eventDateLabel; self.eventTime = eventTime; self.dateStatus = dateStatus
        self.expiresAt = expiresAt; self.lastMessage = lastMessage; self.lastActivityAt = lastActivityAt; self.hasUnread = hasUnread
        self.isMystery = isMystery; self.isEnded = isEnded
    }

    /// Local instant of the event (§10.4) — the countdown and sort key.
    func eventStart(calendar: Calendar = .current) -> Date? { SquadCountdown.eventStart(date: eventDate, time: eventTime, calendar: calendar) }
    func countdown(now: Date, calendar: Calendar = .current) -> SquadCountdown.Countdown? {
        SquadCountdown.countdown(eventStart: eventStart(calendar: calendar), dateStatus: dateStatus, now: now)
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
    var isEmpty: Bool { newMessages.isEmpty && upcoming.isEmpty && fading.isEmpty }
    /// Headers only when ≥ 2 buckets are non-empty (GroupsView parity).
    var showHeaders: Bool { [newMessages, upcoming, fading].filter { !$0.isEmpty }.count > 1 }
}

@Observable final class SquadsStore {
    private(set) var rows: [SquadRow] = []
    private(set) var sections = SquadSections()
    private(set) var unread: Set<SquadID> = []
    private(set) var readCursors: [SquadID: Date] = [:]
    private(set) var lastMessages: [SquadID: Message] = [:]
    private(set) var phase: LoadPhase = .idle
    private(set) var now: Date = .now
    var openSquadId: SquadID? { env.router.openSquadId }
    private(set) var raw = SquadsRaw()
    /// Set/cleared by SquadChatView.task(id:) — the hub's squad(id) handler reaches the open chat through this (§4.10).
    weak var openChat: ChatStore?

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "squads")
    private var hydrating = false
    private var clockTask: Task<Void, Never>?
    private var refreshingSquads: Set<SquadID> = []

    init(env: AppEnvironment) { self.env = env }

    private var me: UserID? { env.session.state.userId }
    private var db: SupabaseClient { env.supabase }

    // MARK: Hydrate / refresh (§4.2, §4.7.1)

    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); startClock(); return }
        guard let me, !hydrating else { return }
        hydrating = true
        defer { hydrating = false }
        if !phase.isSettled { phase = .loading }
        // Subscribe the snapshot's squads BEFORE the selects (§4.7.1 boot gap).
        env.realtime.setSquadList(orderedIds(raw)) { [weak self] m in self?.apply(m) }
        do {
            let memberRows: [SquadMember] = try await db.from("squad_members").select().eq("user_id", value: me).execute().value
            let ids = memberRows.map(\.squadId)
            var fetched = SquadsRaw()
            if !ids.isEmpty {
                let nowIso = PostgresTimestamp.format(.now)
                let squads: [Squad] = try await db.from("squads").select().in("id", values: ids.map(\.raw))
                    .is("archived_at", value: nil).or("expires_at.gt.\(nowIso),expires_at.is.null").execute().value
                let liveIds = squads.map(\.id)
                for s in squads { fetched.squads[s.id] = s }
                if !liveIds.isEmpty {
                    async let membersReq: [SquadMember] = db.from("squad_members").select().in("squad_id", values: liveIds.map(\.raw)).execute().value
                    async let cursorsReq: [SquadReadCursor] = db.from("squad_read_cursors").select().eq("user_id", value: me.raw).execute().value
                    let checkIds = squads.compactMap(\.checkId)
                    let eventIds = squads.compactMap(\.eventId)
                    async let checksReq: [InterestCheck] = checkIds.isEmpty ? [] : db.from("interest_checks").select().in("id", values: checkIds.map(\.raw)).execute().value
                    async let eventsReq: [SquadEventLite] = eventIds.isEmpty ? [] : db.from("events").select("id,title,date,date_display,time_display,venue").in("id", values: eventIds.map(\.raw)).execute().value
                    let members = try await membersReq
                    for m in members { fetched.members[m.squadId, default: []].append(m) }
                    for c in try await checksReq { for s in squads where s.checkId == c.id { fetched.checks[s.id] = c } }
                    for e in try await eventsReq { for s in squads where s.eventId == e.id { fetched.events[s.id] = e } }
                    for c in try await cursorsReq { fetched.readCursors[c.squadId] = c.lastReadAt }
                    // Last message per squad: one bounded select per squad, in parallel (friend scale).
                    let last = await withTaskGroup(of: (SquadID, Message?).self, returning: [SquadID: Message].self) { g in
                        for id in liveIds {
                            g.addTask { [db] in
                                let rows: [Message]? = try? await db.from("messages").select().eq("squad_id", value: id.raw).order("created_at", ascending: false).limit(1).execute().value
                                return (id, rows?.first)
                            }
                        }
                        var out: [SquadID: Message] = [:]
                        for await (id, m) in g { if let m { out[id] = m } }
                        return out
                    }
                    fetched.lastMessages = last
                    let profileIds = Set(members.map(\.userId)).union(last.values.compactMap(\.senderId))
                    if !profileIds.isEmpty {
                        let profiles: [Profile] = try await db.from("profiles").select().in("id", values: profileIds.map(\.raw)).execute().value
                        for p in profiles { fetched.profiles[p.id] = p }
                    }
                }
            }
            merge(fetched, scope: Set(raw.squads.keys).union(fetched.squads.keys))
            if let server = try? await env.rpc.unreadSquadIds(userId: me) { unread.formUnion(server) }
            unread = unread.filter { raw.squads[$0] != nil }
            phase = .loaded(at: .now, stale: false)
            rebuild()
            startClock()
            let snapshot = raw
            Task { try? await env.cache.save(snapshot, name: "squads", userId: me) }
        } catch {
            let e = AppError(error)
            log.error("squads hydrate: \(String(describing: error), privacy: .public)")
            phase = .failed(e, hadSnapshot: !raw.squads.isEmpty)
            rebuild()
        }
    }

    func refresh() async { await hydrate() }

    /// Row merge: fetched rows win, ids in `scope` that the select did not return are removed (archived / left).
    private func merge(_ fetched: SquadsRaw, scope: Set<SquadID>) {
        for id in scope where fetched.squads[id] == nil {
            raw.squads[id] = nil; raw.members[id] = nil; raw.checks[id] = nil; raw.events[id] = nil; raw.lastMessages[id] = nil
        }
        raw.squads.merge(fetched.squads) { _, new in new }
        raw.members.merge(fetched.members) { _, new in new }
        raw.checks.merge(fetched.checks) { _, new in new }
        raw.events.merge(fetched.events) { _, new in new }
        raw.profiles.merge(fetched.profiles) { _, new in new }
        raw.readCursors.merge(fetched.readCursors) { old, new in max(old, new) }
        for (id, m) in fetched.lastMessages {
            if let cur = raw.lastMessages[id], cur.createdAt > m.createdAt { continue }
            raw.lastMessages[id] = m
        }
    }

    /// Single squad + members + its check OR event row + last message (§4.10 — compensates for no realtime on squads/squad_members).
    func refreshSquad(_ id: SquadID) async {
        guard !env.isFake, !refreshingSquads.contains(id) else { return }
        refreshingSquads.insert(id)
        defer { refreshingSquads.remove(id) }
        do {
            let squads: [Squad] = try await db.from("squads").select().eq("id", value: id).limit(1).execute().value
            guard let s = squads.first else { merge(SquadsRaw(), scope: [id]); rebuild(); return }
            var fetched = SquadsRaw()
            fetched.squads[id] = s
            fetched.members[id] = try await db.from("squad_members").select().eq("squad_id", value: id).execute().value
            if let c = s.checkId, let check: [InterestCheck] = try? await db.from("interest_checks").select().eq("id", value: c).limit(1).execute().value, let row = check.first { fetched.checks[id] = row }
            if let e = s.eventId, let ev: [SquadEventLite] = try? await db.from("events").select("id,title,date,date_display,time_display,venue").eq("id", value: e).limit(1).execute().value, let row = ev.first { fetched.events[id] = row }
            if let last: [Message] = try? await db.from("messages").select().eq("squad_id", value: id).order("created_at", ascending: false).limit(1).execute().value, let m = last.first { fetched.lastMessages[id] = m }
            let missing = Set((fetched.members[id] ?? []).map(\.userId)).subtracting(raw.profiles.keys)
            if !missing.isEmpty, let ps: [Profile] = try? await db.from("profiles").select().in("id", values: missing.map(\.raw)).execute().value { for p in ps { fetched.profiles[p.id] = p } }
            // Archived → drop from the list (it stays reachable through the open chat).
            if s.archivedAt != nil { merge(SquadsRaw(), scope: [id]) } else { merge(fetched, scope: [id]) }
            rebuild()
        } catch {
            log.error("refreshSquad: \(String(describing: error), privacy: .public)")
        }
    }

    /// After my response row changed (§4.10): refetch squads + members for that check, merge, rebuild → feed.setMySquadMemberships.
    func refreshMembership(checkId: CheckID) async -> MembershipOutcome {
        guard let me else { return .none }
        if env.isFake {
            guard let (sid, role) = myMembership(checkId: checkId) else { return .none }
            return MembershipOutcome(squadId: sid, role: role, joined: false, formedNow: false)
        }
        let before = myMembership(checkId: checkId)
        do {
            let squads: [Squad] = try await db.from("squads").select().eq("check_id", value: checkId).is("archived_at", value: nil).execute().value
            var fetched = SquadsRaw()
            let staleIds = Set(raw.squads.values.filter { $0.checkId == checkId }.map(\.id))
            for s in squads { fetched.squads[s.id] = s }
            if !squads.isEmpty {
                let members: [SquadMember] = try await db.from("squad_members").select().in("squad_id", values: squads.map(\.id.raw)).execute().value
                for m in members { fetched.members[m.squadId, default: []].append(m) }
                let missing = Set(members.map(\.userId)).subtracting(raw.profiles.keys)
                if !missing.isEmpty, let ps: [Profile] = try? await db.from("profiles").select().in("id", values: missing.map(\.raw)).execute().value { for p in ps { fetched.profiles[p.id] = p } }
                if let check = env.feed.raw.checks[checkId] { for s in squads { fetched.checks[s.id] = check } }
                else if let rows: [InterestCheck] = try? await db.from("interest_checks").select().eq("id", value: checkId).limit(1).execute().value, let c = rows.first { for s in squads { fetched.checks[s.id] = c } }
                for s in squads where raw.lastMessages[s.id] == nil {
                    if let last: [Message] = try? await db.from("messages").select().eq("squad_id", value: s.id).order("created_at", ascending: false).limit(1).execute().value, let m = last.first { fetched.lastMessages[s.id] = m }
                }
            }
            // Keep the member-only filter: squads I'm not in (RLS would hide them anyway) are not listed.
            let mine = Set(fetched.members.filter { $0.value.contains { $0.userId == me } }.map(\.key))
            for id in Set(fetched.squads.keys).subtracting(mine) { fetched.squads[id] = nil; fetched.members[id] = nil; fetched.checks[id] = nil }
            merge(fetched, scope: staleIds.union(fetched.squads.keys))
            rebuild()
            guard let (sid, role) = myMembership(checkId: checkId), let squad = raw.squads[sid] else { return .none }
            let responseAt = env.feed.raw.myResponseRow(checkId: checkId, me: me)?.createdAt ?? .now
            let formedNow = before == nil && squad.createdAt >= responseAt.addingTimeInterval(-2)
            return MembershipOutcome(squadId: sid, role: role, joined: before == nil, formedNow: formedNow)
        } catch {
            log.error("refreshMembership: \(String(describing: error), privacy: .public)")
            return .none
        }
    }

    private func myMembership(checkId: CheckID) -> (SquadID, SquadRole)? {
        guard let me else { return nil }
        for (sid, s) in raw.squads where s.checkId == checkId {
            if let m = raw.members[sid]?.first(where: { $0.userId == me }) { return (sid, m.role) }
        }
        return nil
    }

    /// get_unread_squad_ids — server truth wins (§5.5).
    func refreshUnread() async {
        guard !env.isFake, let me else { return }
        if let server = try? await env.rpc.unreadSquadIds(userId: me) {
            unread.formUnion(server)
            rebuild()
        }
    }

    func role(of userId: UserID, in squadId: SquadID) -> SquadRole? {
        raw.members[squadId]?.first { $0.userId == userId }?.role
    }

    func markUnread(_ id: SquadID) { unread.insert(id); rebuild() }

    /// Local cursor = now first, then upsert squad_read_cursors (§5.5).
    func markRead(_ id: SquadID) async {
        let now = Date.now
        unread.remove(id)
        readCursors[id] = now
        raw.readCursors[id] = now
        rebuild()
        guard !env.isFake, let me else { return }
        do {
            try await db.from("squad_read_cursors").upsert(SquadReadCursor(userId: me, squadId: id, lastReadAt: now), onConflict: "user_id,squad_id").execute()
        } catch { log.error("markRead: \(String(describing: error), privacy: .public)") }
    }

    /// squad(id) channel INSERT (§5.1): preview + unread rule for every subscribed squad; forwards to the open chat (§4.10).
    func apply(_ message: Message) {
        if let cur = raw.lastMessages[message.squadId], cur.createdAt > message.createdAt {} else { raw.lastMessages[message.squadId] = message }
        if message.senderId != me, message.squadId != openSquadId, !message.isSystem { unread.insert(message.squadId) }
        if let openChat, openChat.squadId == message.squadId { Task { await openChat.apply(.insert(message)) } }
        if message.isSystem || message.messageType != .text {
            Task {
                if let openChat, openChat.squadId == message.squadId { await openChat.reloadSideTables() }
                await refreshSquad(message.squadId)
            }
        }
        if let sid = message.senderId, raw.profiles[sid] == nil, !env.isFake {
            Task {
                if let ps: [Profile] = try? await db.from("profiles").select().eq("id", value: sid).limit(1).execute().value, let p = ps.first { raw.profiles[p.id] = p; rebuild() }
            }
        }
        rebuild()
    }

    func leave(_ id: SquadID) async {
        let checkId = raw.squads[id]?.checkId
        guard !env.isFake else { merge(SquadsRaw(), scope: [id]); rebuild(); return }
        do {
            try await env.rpc.leaveSquad(id)
            merge(SquadsRaw(), scope: [id])
            unread.remove(id)
            rebuild()
            if let checkId { await env.feed.refreshCheck(checkId) }
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }

    func extend(_ id: SquadID) async {
        guard !env.isFake else { return }
        do {
            let until = try await env.api.extendSquad(id)
            if var s = raw.squads[id] { s.expiresAt = until; raw.squads[id] = s }
            rebuild()
            env.toasts.show("chat extended ✶", style: .success)
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }

    /// reactivate_squad → the squad is live again; refetch it into the list.
    func revive(_ id: SquadID) async {
        guard !env.isFake else { return }
        do {
            try await env.rpc.reactivateSquad(id)
            await refreshSquad(id)
            env.toasts.show("chat's back ✶", style: .success)
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }

    // MARK: Unread rule (§5.5), pure

    nonisolated static func hasUnread(lastMessage: Message?, me: UserID?, cursor: Date?, openSquadId: SquadID?) -> Bool {
        guard let m = lastMessage, m.senderId != me, !m.isSystem else { return false }
        if m.squadId == openSquadId { return false }
        guard let cursor else { return true }
        return m.createdAt > cursor
    }

    /// Mystery lock drops system / poll / date-confirm rows before anything is masked (§9.3). `lastMessages` holds only the
    /// newest row, so a locked squad whose newest row is a system line shows no preview rather than a leaked one.
    nonisolated static func survivesLock(_ m: Message, locked: Bool) -> Bool {
        !locked || (!m.isSystem && m.messageType == .text && m.senderId != nil)
    }

    // MARK: Projection

    func rebuild() {
        let me = self.me
        let cal = Calendar.current
        let now = self.now
        let open = openSquadId
        readCursors = raw.readCursors
        lastMessages = raw.lastMessages

        var built: [SquadRow] = []
        var memberships: [CheckID: SquadMembership] = [:]
        for (sid, s) in raw.squads {
            let members = (raw.members[sid] ?? []).sorted { $0.joinedAt < $1.joinedAt }
            guard let mine = members.first(where: { $0.userId == me }) else { continue }
            if let checkId = s.checkId { memberships[checkId] = SquadMembership(squadId: sid, role: mine.role) }
            let check = raw.checks[sid]
            let event = raw.events[sid]
            let isMystery = check?.mystery ?? false
            let locked = isMystery && Mystery.isGuestsHidden(mystery: true, eventDate: check?.eventDate, now: now, calendar: cal)
            let activeMembers = members.filter { $0.role == .member }
            let assignment = locked ? Censor.kaomojiAssignment(threadSeed: sid.description, userIds: members.map(\.userId)) : [:]
            func presence(_ uid: UserID) -> Presence {
                if locked { return .masked(kaomoji: assignment[uid] ?? Censor.kaomoji(seed: uid.description), scramble: Censor.wingdings(seed: "\(sid)::\(uid)")) }
                let p = raw.profiles[uid]
                return .person(PersonRef(id: uid, displayName: p?.displayName ?? "someone", username: p?.username ?? "", avatarLetter: p?.avatarLetter ?? "?", isMe: uid == me))
            }
            let lastRaw = raw.lastMessages[sid]
            let visibleLast = lastRaw.flatMap { Self.survivesLock($0, locked: locked) ? $0 : nil }
            let preview = visibleLast.map { m -> MessagePreview in
                let text = m.imagePath != nil && (m.text ?? "").isEmpty ? "📷 photo" : (m.text ?? "")
                return MessagePreview(sender: m.senderId.map(presence), text: text, createdAt: m.createdAt)
            }
            let hasUnread = unread.contains(sid) || Self.hasUnread(lastMessage: visibleLast, me: me, cursor: raw.readCursors[sid], openSquadId: open)
            let kind: SquadRow.Kind = s.checkId.map(SquadRow.Kind.check) ?? s.eventId.map(SquadRow.Kind.event) ?? .check(CheckID(UUID()))
            let row = SquadRow(
                id: sid, name: s.name, kind: kind,
                members: activeMembers.map { presence($0.userId) }, memberCount: activeMembers.count, myRole: mine.role,
                eventDate: s.lockedDate ?? event?.date ?? check?.eventDate,
                eventDateLabel: check?.eventDateLabel ?? event?.dateDisplay,
                eventTime: check?.eventTime ?? event?.timeDisplay,
                dateStatus: s.dateStatus, expiresAt: s.expiresAt, lastMessage: preview,
                lastActivityAt: lastRaw?.createdAt ?? s.createdAt,
                hasUnread: hasUnread && mine.role != .waitlist, isMystery: isMystery, isEnded: s.archivedAt != nil
            )
            built.append(row)
        }
        rows = built.sorted { ($0.lastActivityAt ?? .distantPast) > ($1.lastActivityAt ?? .distantPast) }
        let secs = SquadCountdown.sections(rows, now: now, hasUnread: \.hasUnread, eventStart: { $0.eventStart(calendar: cal) },
                                           lastActivityAt: \.lastActivityAt, expiresAt: \.expiresAt)
        var s = SquadSections()
        s.newMessages = secs.newMessages; s.upcoming = secs.upcoming; s.fading = secs.fading
        sections = s
        env.feed.setMySquadMemberships(memberships)
        env.realtime.setSquadList(orderedIds(raw)) { [weak self] m in self?.apply(m) }
    }

    /// Open squad first, then most-recently-active (§5.1 cap rule is the hub's).
    private func orderedIds(_ r: SquadsRaw) -> [SquadID] {
        func key(_ id: SquadID) -> Date { r.lastMessages[id]?.createdAt ?? r.squads[id]?.createdAt ?? .distantPast }
        var ids = r.squads.keys.sorted { key($0) > key($1) }
        if let open = openSquadId, let i = ids.firstIndex(of: open) { ids.remove(at: i); ids.insert(open, at: 0) }
        return ids
    }

    // MARK: Clock (§4.8 — same shape as the feed's)

    func startClock() {
        guard clockTask == nil else { return }
        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30), tolerance: .seconds(5), clock: .continuous)
                guard !Task.isCancelled else { break }
                self?.tick()
            }
        }
    }
    func stopClock() { clockTask?.cancel(); clockTask = nil }
    func tick() { guard !env.isFake else { return }; now = .now; rebuild() }

    func reset() {
        stopClock()
        rows = []; sections = SquadSections(); unread = []; readCursors = [:]; lastMessages = [:]; raw = SquadsRaw(); phase = .idle; openChat = nil
    }

    func load(raw r: SquadsRaw, phase p: LoadPhase) { raw = r; phase = p; rebuild() }
    /// Tests / fixtures: drive the clock by hand.
    func setNow(_ d: Date) { now = d; rebuild() }
}
