// Data/DowntoAPI.swift — the `/api/*` Bearer client (ARCHITECTURE §3.7, INVENTORY §3).
// Attaches `Authorization: Bearer <access_token>`, sends camelCase JSON (the Next routes' shape), decodes camelCase JSON,
// maps a non-2xx `{ error }` to AppError.api, and on HTTP 401 refreshes the session and retries exactly once.
import Foundation
import Supabase

/// The one thing DowntoAPI needs from auth. `SupabaseTokenProvider` wraps `AuthClient`; tests stub it.
nonisolated protocol AccessTokenProvider: Sendable {
    /// A currently valid access token (a provider may refresh a stale one). Throws when signed out.
    func accessToken() async throws -> String
    /// Forces a refresh and returns the new access token.
    func refreshAccessToken() async throws -> String
}

nonisolated struct SupabaseTokenProvider: AccessTokenProvider {
    let auth: AuthClient

    init(auth: AuthClient) {
        self.auth = auth
    }

    func accessToken() async throws -> String {
        try await auth.session.accessToken
    }

    func refreshAccessToken() async throws -> String {
        try await auth.refreshSession().accessToken
    }
}

nonisolated struct DowntoAPI: Sendable {
    let base: URL
    let session: URLSession
    let tokens: any AccessTokenProvider

    enum Method: String, Sendable { case GET, POST, DELETE }

    static let timeout: TimeInterval = 15

    /// Fail fast, we toast: `waitsForConnectivity = false`.
    static func makeSession(protocolClasses: [AnyClass]? = nil) -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = timeout
        c.timeoutIntervalForResource = timeout * 2
        c.waitsForConnectivity = false
        if let protocolClasses { c.protocolClasses = protocolClasses }
        return URLSession(configuration: c)
    }

    init(base: URL, tokens: any AccessTokenProvider, session: URLSession = DowntoAPI.makeSession()) {
        self.base = base
        self.tokens = tokens
        self.session = session
    }

    init(base: URL, auth: AuthClient, session: URLSession = DowntoAPI.makeSession()) {
        self.init(base: base, tokens: SupabaseTokenProvider(auth: auth), session: session)
    }

    // MARK: Core

    /// Sends `body` and decodes `Out`. On HTTP 401 forces a refresh and retries exactly once; a second 401 is `.unauthenticated`.
    func send<Body: Encodable & Sendable, Out: Decodable & Sendable>(
        _ method: Method, _ path: String, _ body: Body?, requiresAuth: Bool = true, as _: Out.Type = Out.self
    ) async throws -> Out {
        let data = try await sendRaw(method, path, body, requiresAuth: requiresAuth)
        if Out.self == Empty.self, let empty = Empty() as? Out { return empty }
        do {
            return try JSON.camelDecoder.decode(Out.self, from: data)
        } catch {
            throw AppError(error)
        }
    }

    /// Same, discarding the response body.
    func send<Body: Encodable & Sendable>(_ method: Method, _ path: String, _ body: Body?, requiresAuth: Bool = true) async throws {
        _ = try await sendRaw(method, path, body, requiresAuth: requiresAuth)
    }

    private func sendRaw<Body: Encodable & Sendable>(_ method: Method, _ path: String, _ body: Body?, requiresAuth: Bool) async throws -> Data {
        var token: String?
        if requiresAuth {
            do { token = try await tokens.accessToken() } catch { throw AppError.unauthenticated }
        }
        var (data, status) = try await perform(method, path, body, token: token)
        if status == 401, requiresAuth {
            let fresh: String
            do { fresh = try await tokens.refreshAccessToken() } catch { throw AppError.unauthenticated }
            (data, status) = try await perform(method, path, body, token: fresh)
            if status == 401 { throw AppError.unauthenticated }
        }
        guard (200..<300).contains(status) else {
            throw AppError.api(status: status, message: Self.errorMessage(in: data))
        }
        return data
    }

    private func perform<Body: Encodable & Sendable>(_ method: Method, _ path: String, _ body: Body?, token: String?) async throws -> (Data, Int) {
        var request = URLRequest(url: url(for: path))
        request.httpMethod = method.rawValue
        request.timeoutInterval = Self.timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body, method != .GET {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do { request.httpBody = try JSON.camelEncoder.encode(body) } catch { throw AppError.decoding("encode \(Body.self): \(error)") }
        }
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (data, status)
        } catch {
            throw AppError(error)
        }
    }

    private func url(for path: String) -> URL {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return base.appending(path: "api/\(trimmed)")
    }

    private static func errorMessage(in data: Data) -> String {
        nonisolated struct ErrorBody: Decodable { let error: String? }
        if let e = try? JSONDecoder().decode(ErrorBody.self, from: data), let m = e.error { return m }
        return ""
    }

    // MARK: Typed surface — one per route in INVENTORY §3 "Needed natively"

    /// POST push/subscribe {platform:"ios", deviceToken}
    func pushSubscribe(deviceToken: String) async throws {
        try await send(.POST, "push/subscribe", PushSubscribeBody(platform: "ios", deviceToken: deviceToken))
    }

    /// DELETE push/subscribe {deviceToken}
    func pushUnsubscribe(deviceToken: String) async throws {
        try await send(.DELETE, "push/subscribe", DeviceTokenBody(deviceToken: deviceToken))
    }

    /// POST account/delete — hard-delete.
    func deleteAccount() async throws {
        try await send(.POST, "account/delete", Empty())
    }

    /// POST checks/respond-shared {checkId, response:"down"} — bypasses RLS, sets referred_by_check_id.
    func respondShared(checkId: CheckID) async throws {
        try await send(.POST, "checks/respond-shared", RespondSharedBody(checkId: checkId, response: "down"))
    }

    /// POST scrape {url} — unauthenticated. M2.
    func scrape(url: URL) async throws -> ScrapeResult {
        try await send(.POST, "scrape", URLBody(url: url.absoluteString), requiresAuth: false)
    }

    /// POST search-letterboxd {query} — unauthenticated. nil when `found == false`. M2.
    func searchLetterboxd(query: String) async throws -> MovieHit? {
        let r: LetterboxdSearchResponse = try await send(.POST, "search-letterboxd", QueryBody(query: query), requiresAuth: false)
        return r.found ? r.movie : nil
    }

    /// POST squads/set-date {squadId, date, time, locked}
    func setDate(squadId: SquadID, date: LocalDate, time: String?, locked: Bool) async throws {
        try await send(.POST, "squads/set-date", SetDateBody(squadId: squadId, date: date, time: time, locked: locked, clear: nil))
    }

    /// POST squads/set-date {squadId, clear:true}
    func clearDate(squadId: SquadID) async throws {
        try await send(.POST, "squads/set-date", SetDateBody(squadId: squadId, date: nil, time: nil, locked: nil, clear: true))
    }

    /// POST squads/confirm-date {squadId, response:'yes'|'no'} — auto-locks when all answered.
    func confirmDate(squadId: SquadID, response: ConfirmResponse) async throws {
        try await send(.POST, "squads/confirm-date", ConfirmDateBody(squadId: squadId, response: response))
    }

    /// POST squads/create-poll → pollId. M2.
    func createPoll(_ req: CreatePollRequest) async throws -> PollID {
        let r: CreatePollResponse = try await send(.POST, "squads/create-poll", req)
        return r.pollId
    }

    /// POST squads/vote-poll {pollId, optionIndex} — one option per call (the route toggles a single index). M2.
    func votePoll(pollId: PollID, optionIndex: Int) async throws {
        try await send(.POST, "squads/vote-poll", VotePollBody(pollId: pollId, optionIndex: optionIndex))
    }

    func closePoll(_ id: PollID) async throws {
        try await send(.POST, "squads/close-poll", PollIDBody(pollId: id))
    }

    func reopenPoll(_ id: PollID) async throws {
        try await send(.POST, "squads/reopen-poll", PollIDBody(pollId: id))
    }

    func clearMyVotes(_ id: PollID) async throws {
        try await send(.POST, "squads/clear-my-votes", PollIDBody(pollId: id))
    }

    /// POST squads/vote-availability {pollId, dayOffset, slotIndex} — legacy grid polls. M2.
    func voteAvailability(pollId: PollID, dayOffset: Int, slotIndex: Int) async throws {
        try await send(.POST, "squads/vote-availability", VoteAvailabilityBody(pollId: pollId, dayOffset: dayOffset, slotIndex: slotIndex))
    }

    /// POST squads/clear-availability {pollId}. M2.
    func clearAvailability(_ id: PollID) async throws {
        try await send(.POST, "squads/clear-availability", PollIDBody(pollId: id))
    }

    /// POST squads/propose-from-poll {pollId, date, time}. M2.
    func proposeFromPoll(pollId: PollID, date: LocalDate, time: String?) async throws {
        try await send(.POST, "squads/propose-from-poll", ProposeBody(pollId: pollId, date: date, time: time))
    }

    /// POST squads/extend {squadId, days} → the new expiry.
    @discardableResult
    func extendSquad(_ id: SquadID, days: Int = 7) async throws -> Date {
        let r: ExtendSquadResponse = try await send(.POST, "squads/extend", ExtendBody(squadId: id, days: days))
        return r.expiresAt
    }

    /// POST squads/update-size {checkId, maxSquadSize} (nil = unlimited).
    func updateSize(checkId: CheckID, maxSquadSize: Int?) async throws {
        try await send(.POST, "squads/update-size", UpdateSizeBody(checkId: checkId, maxSquadSize: maxSquadSize))
    }

    /// POST squads/set-member-role {squadId, userId, role}. M2.
    func setMemberRole(squadId: SquadID, userId: UserID, role: SquadRole) async throws {
        try await send(.POST, "squads/set-member-role", MemberRoleBody(squadId: squadId, userId: userId, role: role))
    }

    /// POST squads/kick-member {squadId, userId}. M2.
    func kickMember(squadId: SquadID, userId: UserID) async throws {
        try await send(.POST, "squads/kick-member", MemberBody(squadId: squadId, userId: userId))
    }

    /// POST squads/add-member {squadId, userId}. M2.
    func addMember(squadId: SquadID, userId: UserID) async throws {
        try await send(.POST, "squads/add-member", MemberBody(squadId: squadId, userId: userId))
    }

    /// GET version → build id (About screen, optional).
    func version() async throws -> String? {
        let r: VersionResponse = try await send(.GET, "version", Empty?.none, requiresAuth: false)
        return r.buildId
    }

    /// The webcal subscription URL for `calendar/[token]` (native only shows it; the .ics feed is fetched by the Calendar app).
    func calendarFeedURL(token: UUID, timeZone: TimeZone = .current) -> URL {
        var comps = URLComponents(url: url(for: "calendar/\(token.uuidString.lowercased())"), resolvingAgainstBaseURL: false)
        comps?.scheme = "webcal"
        comps?.queryItems = [URLQueryItem(name: "tz", value: timeZone.identifier)]
        return comps?.url ?? url(for: "calendar/\(token.uuidString.lowercased())")
    }
}

// MARK: - Request bodies (camelCase on the wire)

nonisolated struct PushSubscribeBody: Encodable, Sendable { let platform: String; let deviceToken: String }
nonisolated struct DeviceTokenBody: Encodable, Sendable { let deviceToken: String }
nonisolated struct RespondSharedBody: Encodable, Sendable { let checkId: CheckID; let response: String }
nonisolated struct URLBody: Encodable, Sendable { let url: String }
nonisolated struct QueryBody: Encodable, Sendable { let query: String }
nonisolated struct SetDateBody: Encodable, Sendable { let squadId: SquadID; let date: LocalDate?; let time: String?; let locked: Bool?; let clear: Bool? }
nonisolated struct ConfirmDateBody: Encodable, Sendable { let squadId: SquadID; let response: ConfirmResponse }
nonisolated struct VotePollBody: Encodable, Sendable { let pollId: PollID; let optionIndex: Int }
nonisolated struct PollIDBody: Encodable, Sendable { let pollId: PollID }
nonisolated struct VoteAvailabilityBody: Encodable, Sendable { let pollId: PollID; let dayOffset: Int; let slotIndex: Int }
nonisolated struct ProposeBody: Encodable, Sendable { let pollId: PollID; let date: LocalDate; let time: String? }
nonisolated struct ExtendBody: Encodable, Sendable { let squadId: SquadID; let days: Int }
nonisolated struct UpdateSizeBody: Encodable, Sendable { let checkId: CheckID; let maxSquadSize: Int? }
nonisolated struct MemberRoleBody: Encodable, Sendable { let squadId: SquadID; let userId: UserID; let role: SquadRole }
nonisolated struct MemberBody: Encodable, Sendable { let squadId: SquadID; let userId: UserID }
