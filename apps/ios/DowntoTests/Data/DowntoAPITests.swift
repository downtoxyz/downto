import Foundation
import Synchronization
import Testing
@testable import Downto

/// Token provider whose calls are counted; `refresh` can be scripted to fail.
final class StubTokens: AccessTokenProvider, @unchecked Sendable {
    private let state = Mutex<(token: String, accessCalls: Int, refreshCalls: Int, refreshFails: Bool)>(("tok-1", 0, 0, false))

    init(token: String = "tok-1", refreshFails: Bool = false) {
        state.withLock { $0 = (token, 0, 0, refreshFails) }
    }

    func accessToken() async throws -> String {
        state.withLock { $0.accessCalls += 1; return $0.token }
    }

    func refreshAccessToken() async throws -> String {
        try state.withLock {
            $0.refreshCalls += 1
            if $0.refreshFails { throw AppError.unauthenticated }
            $0.token = "tok-\($0.refreshCalls + 1)"
            return $0.token
        }
    }

    var refreshCalls: Int { state.withLock { $0.refreshCalls } }
    var accessCalls: Int { state.withLock { $0.accessCalls } }
}

@Suite("DowntoAPI", .serialized)
struct DowntoAPITests {
    static let base = URL(string: "https://downto.test")!

    func makeAPI(tokens: StubTokens = StubTokens()) -> DowntoAPI {
        DowntoAPI(base: Self.base, tokens: tokens, session: DowntoAPI.makeSession(protocolClasses: [StubURLProtocol.self]))
    }

    @Test func attachesBearerAndSendsCamelCaseJSON() async throws {
        StubURLProtocol.reset()
        let api = makeAPI()
        let squad = SquadID(UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1")!)
        try await api.setDate(squadId: squad, date: LocalDate(iso: "2026-05-03")!, time: "7pm", locked: true)

        let r = try #require(StubURLProtocol.requests.first)
        #expect(r.url.absoluteString == "https://downto.test/api/squads/set-date")
        #expect(r.method == "POST")
        #expect(r.authorization == "Bearer tok-1")
        #expect(r.headers["Content-Type"] == "application/json")
        let body = try #require(r.bodyJSON)
        #expect(body["squadId"] as? String == "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBB1")
        #expect(body["date"] as? String == "2026-05-03")
        #expect(body["time"] as? String == "7pm")
        #expect(body["locked"] as? Bool == true)
        #expect(body["clear"] == nil, "nil optionals are omitted, not sent as null")
        #expect(body["squad_id"] == nil, "the Next routes read camelCase keys")
    }

    @Test func unauthorizedRefreshesOnceAndRetries() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(401, "{\"error\":\"Unauthorized\"}"), .json(200, "{\"ok\":true,\"expiresAt\":\"2026-05-09T22:00:00.000Z\"}"))
        let tokens = StubTokens()
        let api = makeAPI(tokens: tokens)

        let expiry = try await api.extendSquad(SquadID(UUID()), days: 7)

        let reqs = StubURLProtocol.requests
        #expect(reqs.count == 2)
        #expect(reqs[0].authorization == "Bearer tok-1")
        #expect(reqs[1].authorization == "Bearer tok-2", "the retry must carry the refreshed token")
        #expect(reqs[1].bodyJSON?["days"] as? Int == 7, "the retry re-sends the same body")
        #expect(tokens.refreshCalls == 1)
        #expect(expiry == PostgresTimestamp.parse("2026-05-09T22:00:00.000Z"))
    }

    @Test func secondUnauthorizedIsUnauthenticatedNotALoop() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(401, "{\"error\":\"Unauthorized\"}"), .json(401, "{\"error\":\"Unauthorized\"}"))
        let tokens = StubTokens()
        let api = makeAPI(tokens: tokens)
        await #expect(throws: AppError.unauthenticated) {
            try await api.deleteAccount()
        }
        #expect(StubURLProtocol.requests.count == 2, "exactly one retry")
        #expect(tokens.refreshCalls == 1)
    }

    @Test func failedRefreshIsUnauthenticatedWithoutRetry() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(401, "{\"error\":\"Unauthorized\"}"))
        let tokens = StubTokens(refreshFails: true)
        let api = makeAPI(tokens: tokens)
        await #expect(throws: AppError.unauthenticated) {
            try await api.pushSubscribe(deviceToken: "abc")
        }
        #expect(StubURLProtocol.requests.count == 1)
        #expect(tokens.refreshCalls == 1)
    }

    @Test func nonSuccessBecomesTypedApiError() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(403, "{\"error\":\"Not a squad member\"}"))
        let api = makeAPI()
        await #expect(throws: AppError.api(status: 403, message: "Not a squad member")) {
            try await api.confirmDate(squadId: SquadID(UUID()), response: .yes)
        }
        let body = try #require(StubURLProtocol.requests.first?.bodyJSON)
        #expect(body["response"] as? String == "yes", "TolerantEnum encodes its raw value")
    }

    @Test func nonJSONErrorBodyGivesEmptyMessage() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(StubURLProtocol.Response(status: 502, body: Data("Bad Gateway".utf8), headers: ["Content-Type": "text/plain"]))
        let api = makeAPI()
        await #expect(throws: AppError.api(status: 502, message: "")) {
            try await api.updateSize(checkId: CheckID(UUID()), maxSquadSize: nil)
        }
    }

    @Test func transportFailuresAreNetworkErrors() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.failNext.withLock { $0 = .notConnectedToInternet }
        let api = makeAPI()
        await #expect(throws: AppError.network) {
            try await api.respondShared(checkId: CheckID(UUID()))
        }
    }

    @Test func unauthenticatedRoutesSendNoBearer() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(200, "{\"found\":true,\"movie\":{\"title\":\"Perfect Days\",\"year\":\"2023\",\"director\":\"Wim Wenders\",\"thumbnail\":null,\"url\":\"https://letterboxd.com/film/perfect-days/\"}}"))
        let tokens = StubTokens()
        let api = makeAPI(tokens: tokens)
        let hit = try await api.searchLetterboxd(query: "perfect days")
        #expect(hit?.title == "Perfect Days")
        #expect(hit?.url == "https://letterboxd.com/film/perfect-days/")
        #expect(StubURLProtocol.requests.first?.authorization == nil)
        #expect(tokens.accessCalls == 0)

        StubURLProtocol.enqueue(.json(200, "{\"found\":false}"))
        #expect(try await api.searchLetterboxd(query: "zzz") == nil)
    }

    @Test func getVersionHasNoBody() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(200, "{\"buildId\":\"abc123\"}"))
        let api = makeAPI()
        #expect(try await api.version() == "abc123")
        let r = try #require(StubURLProtocol.requests.first)
        #expect(r.method == "GET")
        #expect(r.body == nil || r.body?.isEmpty == true)
        #expect(r.url.absoluteString == "https://downto.test/api/version")
    }

    @Test func deleteMethodAndPushBodies() async throws {
        StubURLProtocol.reset()
        let api = makeAPI()
        try await api.pushSubscribe(deviceToken: "dead-beef")
        try await api.pushUnsubscribe(deviceToken: "dead-beef")
        let reqs = StubURLProtocol.requests
        #expect(reqs.count == 2)
        #expect(reqs[0].method == "POST")
        #expect(reqs[0].bodyJSON?["platform"] as? String == "ios")
        #expect(reqs[0].bodyJSON?["deviceToken"] as? String == "dead-beef")
        #expect(reqs[1].method == "DELETE")
        #expect(reqs[1].bodyJSON?["deviceToken"] as? String == "dead-beef")
    }

    @Test func createPollDecodesPollId() async throws {
        StubURLProtocol.reset()
        StubURLProtocol.enqueue(.json(200, "{\"ok\":true,\"pollId\":\"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1\",\"messageId\":\"dddddddd-dddd-4ddd-8ddd-ddddddddddd1\"}"))
        let api = makeAPI()
        let req = CreatePollRequest(squadId: SquadID(UUID()), pollType: .dates, question: "which night?",
                                    options: [.date(LocalDate(iso: "2026-05-02")!, time: "7pm"), .date(LocalDate(iso: "2026-05-03")!, time: nil)])
        let id = try await api.createPoll(req)
        #expect(id.description == "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1")
        let body = try #require(StubURLProtocol.requests.first?.bodyJSON)
        #expect(body["pollType"] as? String == "dates")
        let options = try #require(body["options"] as? [[String: Any]])
        #expect(options[0]["date"] as? String == "2026-05-02")
        #expect(options[0]["time"] as? String == "7pm")
        #expect(options[1]["time"] is NSNull, "the route stores an explicit null time")
    }

    @Test func calendarFeedURLIsWebcal() {
        let api = makeAPI()
        let url = api.calendarFeedURL(token: UUID(uuidString: "9F8E7D6C-5B4A-4392-8172-6F5E4D3C2B1A")!, timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        #expect(url.absoluteString == "webcal://downto.test/api/calendar/9f8e7d6c-5b4a-4392-8172-6f5e4d3c2b1a?tz=America/Los_Angeles")
    }
}
