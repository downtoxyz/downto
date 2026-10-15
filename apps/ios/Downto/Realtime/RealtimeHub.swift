// Realtime/RealtimeHub.swift — the only thing that touches `supabase.realtimeV2` (ARCHITECTURE §5, §5.1, §5.4, §4.7.1).
//
// Stores do not exist in this lane, so the hub is wired with handler closures instead of store references:
// `startUserChannels(userId:handlers:)` takes a `UserChannelHandlers` (feed / notifications / friends callbacks),
// `setSquadList(_:onMessage:)` takes the message handler, `subscribeDateConfirms(squadId:onChange:)` returns the
// Task the view owns. `onReconnected` is the `env.refreshAll()` hook. Everything runs on the main actor; the
// closures are invoked from main-actor Tasks so they need no Sendable annotation.
//
// No `Subscription` type (§5): store-lifetime channels are Tasks held in `tasks`; view-scoped ones are the returned Task.
import Foundation
import Observation
import Supabase
import os

@Observable final class RealtimeHub {
    enum Status: Sendable, Equatable { case connected, reconnecting, offline }

    enum ChannelKey: Hashable, Sendable {
        case checksAll
        case notifications(UserID)
        case friendshipsRequester(UserID)
        case friendshipsAddressee(UserID)
        case squad(SquadID)
        case dateConfirms(SquadID)
        case eventComments(EventID)   // M2
        case pollVotes(PollID)        // M2

        var topic: String {
            switch self {
            case .checksAll: "checks:all"
            case .notifications(let u): "notifications:\(u)"
            case .friendshipsRequester(let u): "friendships:requester:\(u)"
            case .friendshipsAddressee(let u): "friendships:addressee:\(u)"
            case .squad(let s): "squad:\(s)"
            case .dateConfirms(let s): "date_confirms:\(s)"
            case .eventComments(let e): "event_comments:\(e)"
            case .pollVotes(let p): "poll_votes:\(p)"
            }
        }
    }

    /// Callbacks for the four user-scoped channels (§5.1). `decodeFailure` is the "refresh() safety net" hook (§4.7).
    struct UserChannelHandlers {
        var check: (TableChange<InterestCheck>) -> Void = { _ in }
        var response: (TableChange<CheckResponse>) -> Void = { _ in }
        var coAuthor: (TableChange<CheckCoAuthor>) -> Void = { _ in }
        var comment: (TableChange<CheckComment>) -> Void = { _ in }
        var notification: (AppNotification) -> Void = { _ in }
        var friendship: (TableChange<Friendship>) -> Void = { _ in }
        var decodeFailure: (String) -> Void = { _ in }

        init() {}
    }

    /// Open squad + the 29 most-recently-active others (§5.1 cap rule).
    static let squadChannelCap = 30
    /// How long `startUserChannels` waits for `.subscribed` before logging and moving on (§4.7.1).
    static let subscribeTimeout: Duration = .seconds(5)

    private(set) var status: Status = .offline
    /// Called after the socket reconnects and every channel is `.subscribed` again — `env.refreshAll()` + open-chat hydrate (§5.4).
    var onReconnected: (() async -> Void)?

    private let client: SupabaseClient
    private let log = Logger(subsystem: "xyz.downto.app", category: "realtime")
    private var channels: [ChannelKey: RealtimeChannelV2] = [:]
    private var tasks: [ChannelKey: [Task<Void, Never>]] = [:]
    private var statusTask: Task<Void, Never>?
    private var wasDisconnected = false
    private var suspended = false

    // Remembered so `resume()` can rebuild the same channel set.
    private var userId: UserID?
    private var userHandlers: UserChannelHandlers?
    private var squadIds: [SquadID] = []
    private var squadHandler: ((Message) -> Void)?

    init(client: SupabaseClient) {
        self.client = client
    }

    var subscribedKeys: Set<ChannelKey> { Set(channels.keys) }

    // MARK: Store-lifetime channels

    /// checksAll + notifications + both friendships. Subscribes FIRST and awaits `.subscribed` on each (5 s timeout each),
    /// so a change committed between the hydrate selects and the join cannot be lost (§4.7.1 boot gap).
    func startUserChannels(userId: UserID, handlers: UserChannelHandlers) async {
        self.userId = userId
        self.userHandlers = handlers
        suspended = false
        startStatusMirror()

        await open(.checksAll) { ch in
            let checks = ch.postgresChange(AnyAction.self, schema: "public", table: "interest_checks")
            let responses = ch.postgresChange(AnyAction.self, schema: "public", table: "check_responses")
            let coAuthors = ch.postgresChange(AnyAction.self, schema: "public", table: "check_co_authors")
            let comments = ch.postgresChange(AnyAction.self, schema: "public", table: "check_comments")
            return [
                self.pump(checks, "interest_checks", handlers.check, handlers.decodeFailure),
                self.pump(responses, "check_responses", handlers.response, handlers.decodeFailure),
                self.pump(coAuthors, "check_co_authors", handlers.coAuthor, handlers.decodeFailure),
                self.pump(comments, "check_comments", handlers.comment, handlers.decodeFailure),
            ]
        }
        await open(.notifications(userId)) { ch in
            let inserts = ch.postgresChange(InsertAction.self, schema: "public", table: "notifications", filter: .eq("user_id", value: userId))
            return [Task { [log] in
                for await action in inserts {
                    do {
                        handlers.notification(try action.decodeRecord(as: AppNotification.self, decoder: JSON.decoder))
                    } catch {
                        log.error("notifications decode: \(String(describing: error), privacy: .public)")
                        handlers.decodeFailure("notifications")
                    }
                }
            }]
        }
        // Realtime filters are single-column, so friendships needs two channels (§5.1).
        await open(.friendshipsRequester(userId)) { ch in
            let s = ch.postgresChange(AnyAction.self, schema: "public", table: "friendships", filter: .eq("requester_id", value: userId))
            return [self.pump(s, "friendships", handlers.friendship, handlers.decodeFailure)]
        }
        await open(.friendshipsAddressee(userId)) { ch in
            let s = ch.postgresChange(AnyAction.self, schema: "public", table: "friendships", filter: .eq("addressee_id", value: userId))
            return [self.pump(s, "friendships", handlers.friendship, handlers.decodeFailure)]
        }
    }

    /// Diff-subscribes `squad:{id}` (INSERT on `messages`) for the listed squads, most-relevant first, capped at 30.
    /// Idempotent: no churn when the set is unchanged.
    func setSquadList(_ ids: [SquadID], onMessage: @escaping (Message) -> Void) {
        squadHandler = onMessage
        var seen = Set<SquadID>()
        let wanted = ids.filter { seen.insert($0).inserted }.prefix(Self.squadChannelCap)
        squadIds = Array(wanted)
        guard !suspended else { return }
        let wantedKeys = Set(wanted.map(ChannelKey.squad))
        let current = Set(channels.keys.filter { if case .squad = $0 { true } else { false } })
        for key in current.subtracting(wantedKeys) {
            Task { await self.close(key) }
        }
        for id in wanted where !current.contains(.squad(id)) {
            Task { await self.openSquad(id, onMessage: onMessage) }
        }
    }

    private func openSquad(_ id: SquadID, onMessage: @escaping (Message) -> Void) async {
        await open(.squad(id)) { ch in
            let inserts = ch.postgresChange(InsertAction.self, schema: "public", table: "messages", filter: .eq("squad_id", value: id))
            return [Task { [log] in
                for await action in inserts {
                    do {
                        onMessage(try action.decodeRecord(as: Message.self, decoder: JSON.decoder))
                    } catch {
                        log.error("messages decode: \(String(describing: error), privacy: .public)")
                    }
                }
            }]
        }
    }

    // MARK: View-scoped channels

    /// `*` on `squad_date_confirms` where `squad_id=eq.` — subscribed by `ChatStore.hydrate()` BEFORE its selects, only while
    /// that chat is open. The returned Task unsubscribes in its cancellation path; own it with `.task(id:)`.
    func subscribeDateConfirms(squadId: SquadID, onChange: @escaping (TableChange<SquadDateConfirm>) -> Void) -> Task<Void, Never> {
        viewScoped(.dateConfirms(squadId), table: "squad_date_confirms", filter: .eq("squad_id", value: squadId), onChange: onChange)
    }

    /// `*` on `squad_poll_votes` where `poll_id=eq.` — M2.
    func subscribePollVotes(pollId: PollID, onChange: @escaping (TableChange<SquadPollVote>) -> Void) -> Task<Void, Never> {
        viewScoped(.pollVotes(pollId), table: "squad_poll_votes", filter: .eq("poll_id", value: pollId), onChange: onChange)
    }

    private func viewScoped<T: Decodable & Sendable>(
        _ key: ChannelKey, table: String, filter: RealtimePostgresFilter, onChange: @escaping (TableChange<T>) -> Void
    ) -> Task<Void, Never> {
        Task { [client, log] in
            let ch = client.channel(key.topic)
            let stream = ch.postgresChange(AnyAction.self, schema: "public", table: table, filter: filter)
            do {
                try await Self.withTimeout(Self.subscribeTimeout) { try await ch.subscribeWithError() }
            } catch {
                log.error("subscribe \(key.topic, privacy: .public): \(String(describing: error), privacy: .public)")
            }
            for await action in stream {
                do { onChange(try TableChange<T>(action)) } catch {
                    log.error("\(table, privacy: .public) decode: \(String(describing: error), privacy: .public)")
                }
            }
            // Cancelled (view gone / id changed): leave the topic from a fresh, uncancelled task.
            Task.detached { await ch.unsubscribe(); await client.removeChannel(ch) }
        }
    }

    // MARK: Lifecycle

    /// ScenePhase.background: unsubscribe all + disconnect the socket cleanly (§5.4).
    func suspend() async {
        suspended = true
        await closeAll()
        client.realtimeV2.disconnect()
        status = .offline
    }

    /// ScenePhase.active: reconnect + resubscribe the same keys.
    func resume() async {
        guard suspended else { return }
        suspended = false
        if let userId, let userHandlers {
            await startUserChannels(userId: userId, handlers: userHandlers)
        }
        if let squadHandler {
            let ids = squadIds
            for id in ids { await openSquad(id, onMessage: squadHandler) }
        }
    }

    /// Logout: everything down, nothing remembered.
    func stopAll() async {
        userId = nil
        userHandlers = nil
        squadIds = []
        squadHandler = nil
        suspended = false
        await closeAll()
        statusTask?.cancel()
        statusTask = nil
        client.realtimeV2.disconnect()
        status = .offline
        wasDisconnected = false
    }

    // MARK: Internals

    /// Creates the channel, registers its streams (must happen before subscribe), subscribes with a timeout, and keeps the tasks.
    private func open(_ key: ChannelKey, register: (RealtimeChannelV2) -> [Task<Void, Never>]) async {
        if channels[key] != nil { return }
        let ch = client.channel(key.topic)
        channels[key] = ch
        tasks[key] = register(ch)
        do {
            try await Self.withTimeout(Self.subscribeTimeout) { try await ch.subscribeWithError() }
        } catch {
            // Keep the channel: supabase-swift keeps retrying the join; §5.4's reconnect path covers the rest.
            log.error("subscribe \(key.topic, privacy: .public) did not confirm: \(String(describing: error), privacy: .public)")
        }
    }

    private func close(_ key: ChannelKey) async {
        tasks[key]?.forEach { $0.cancel() }
        tasks[key] = nil
        guard let ch = channels.removeValue(forKey: key) else { return }
        await ch.unsubscribe()
        await client.removeChannel(ch)
    }

    private func closeAll() async {
        for key in Array(channels.keys) { await close(key) }
    }

    /// One Task per (channel, table) pumping `AnyAction` → `TableChange<T>` → handler; a decode failure logs and asks for a refresh.
    private func pump<T: Decodable & Sendable>(
        _ stream: AsyncStream<AnyAction>, _ table: String, _ handler: @escaping (TableChange<T>) -> Void, _ onFailure: @escaping (String) -> Void
    ) -> Task<Void, Never> {
        Task { [log] in
            for await action in stream {
                do { handler(try TableChange<T>(action)) } catch {
                    log.error("\(table, privacy: .public) decode: \(String(describing: error), privacy: .public)")
                    onFailure(table)
                }
            }
        }
    }

    /// Mirrors the socket status; after a gap, waits for every channel to be `.subscribed` again, then fires `onReconnected` (§5.4).
    private func startStatusMirror() {
        guard statusTask == nil else { return }
        statusTask = Task { [weak self, client] in
            for await s in client.realtimeV2.statusChange {
                guard let self else { return }
                switch s {
                case .connected:
                    let hadGap = self.wasDisconnected
                    self.status = .connected
                    if hadGap {
                        self.wasDisconnected = false
                        await self.awaitAllSubscribed()
                        await self.onReconnected?()
                    }
                case .connecting:
                    self.status = self.channels.isEmpty ? .offline : .reconnecting
                case .disconnected:
                    if !self.channels.isEmpty { self.wasDisconnected = true }
                    self.status = self.suspended || self.channels.isEmpty ? .offline : .reconnecting
                }
            }
        }
    }

    private func awaitAllSubscribed() async {
        for ch in channels.values where ch.status != .subscribed {
            _ = try? await Self.withTimeout(Self.subscribeTimeout) {
                for await st in ch.statusChange where st == .subscribed { return }
            }
        }
    }

    private struct TimedOut: Error {}

    static func withTimeout<T: Sendable>(_ limit: Duration, _ body: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await body() }
            group.addTask {
                try await Task.sleep(for: limit)
                throw TimedOut()
            }
            let first = try await group.next()!
            group.cancelAll()
            return first
        }
    }
}
