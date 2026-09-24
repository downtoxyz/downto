import Foundation
import Testing
@testable import Downto

@Suite("PostgresTimestamp + JSON coders")
struct ModelDecodingTests {
    nonisolated struct Row: Codable, Equatable, Sendable {
        let createdAt: Date
        let eventDate: LocalDate?
        let checkId: CheckID
        let response: ResponseKind
    }

    /// 2026-09-23T18:04:11Z
    static let base = Date(timeIntervalSince1970: 1_790_186_651)

    @Test(arguments: [
        ("2026-09-23T18:04:11.123456+00:00", 0.123456),   // PostgREST default (microseconds, colon offset)
        ("2026-09-23T18:04:11+00:00", 0.0),               // no fractional seconds
        ("2026-09-23T18:04:11.123Z", 0.123),              // JS toISOString
        ("2026-09-23 18:04:11.123456+00", 0.123456),      // Postgres text form inside RPC JSON
    ])
    func decodesAllFourTimestampForms(_ raw: String, fraction: Double) throws {
        let date = try JSON.decoder.decode([Date].self, from: Data("[\"\(raw)\"]".utf8))[0]
        let expected = Self.base.addingTimeInterval(fraction)
        #expect(abs(date.timeIntervalSince(expected)) < 0.000_001, "\(raw) → \(date)")
    }

    @Test func honoursNonUTCOffsets() throws {
        // 20:04:11 at +02:00 is 18:04:11Z
        let a = try JSON.decoder.decode([Date].self, from: Data("[\"2026-09-23T20:04:11+02:00\"]".utf8))[0]
        let b = try JSON.decoder.decode([Date].self, from: Data("[\"2026-09-23 23:34:11.5+05:30\"]".utf8))[0]
        #expect(a == Self.base)
        #expect(abs(b.timeIntervalSince(Self.base.addingTimeInterval(0.5))) < 0.000_001)
    }

    @Test func rejectsGarbageWithTheRawStringInTheError() {
        #expect(throws: DecodingError.self) {
            _ = try JSON.decoder.decode([Date].self, from: Data("[\"yesterday\"]".utf8))
        }
        do {
            _ = try JSON.decoder.decode([Date].self, from: Data("[\"2026-09-23T25:99:99Z\"]".utf8))
            Issue.record("expected a throw")
        } catch let DecodingError.dataCorrupted(ctx) {
            #expect(ctx.debugDescription.contains("2026-09-23T25:99:99Z"))
        } catch {
            Issue.record("wrong error type: \(error)")
        }
    }

    @Test func encodesISO8601WithFractionalSecondsAndZ() throws {
        let data = try JSON.encoder.encode([Self.base.addingTimeInterval(0.123)])
        #expect(String(decoding: data, as: UTF8.self) == "[\"2026-09-23T18:04:11.123Z\"]")
    }

    @Test func roundTripsThroughTheCoderPair() throws {
        let row = Row(createdAt: Self.base.addingTimeInterval(0.5), eventDate: LocalDate(iso: "2026-10-01"), checkId: CheckID(UUID()), response: .down)
        let data = try JSON.encoder.encode(row)
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"created_at\""), "keys must be snake_case on the wire")
        #expect(json.contains("\"event_date\":\"2026-10-01\""))
        #expect(try JSON.decoder.decode(Row.self, from: data) == row)
    }

    @Test func snakeCaseRowDecodesWithDomainTypes() throws {
        let json = """
        {"created_at":"2026-09-23 18:04:11.123456+00","event_date":null,"check_id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","response":"waitlist"}
        """
        let row = try JSON.decoder.decode(Row.self, from: Data(json.utf8))
        #expect(row.eventDate == nil)
        #expect(row.response == .waitlist)
        #expect(row.checkId.description == "3f2504e0-4f89-11d3-9a0c-0305e82c3301")
        #expect(abs(row.createdAt.timeIntervalSince(Self.base.addingTimeInterval(0.123456))) < 0.000_001)
    }

    @Test func decodesFromADetachedTask() async throws {
        // ARCHITECTURE §1.0: every model type is `nonisolated`, so decoding off the main actor is legal and must work.
        let json = """
        [{"created_at":"2026-09-23T18:04:11.123Z","event_date":"2026-05-01","check_id":"a1b2c3d4-0000-4000-8000-000000000001","response":"down"}]
        """
        let rows = try await Task.detached(priority: .background) {
            try JSON.decoder.decode([Row].self, from: Data(json.utf8))
        }.value
        #expect(rows.count == 1)
        #expect(rows[0].eventDate?.iso == "2026-05-01")
        #expect(rows[0].response == .down)
    }
}

@Suite("AppConfig")
struct AppConfigTests {
    static let good: [String: Any] = [
        "APP_ENV": "local",
        "SUPABASE_URL": "http://127.0.0.1:54321",
        "SUPABASE_ANON_KEY": "anon",
        "API_BASE_URL": "http://127.0.0.1:3000",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "7",
    ]

    @Test func buildsFromACompleteInfoDictionary() throws {
        let c = try AppConfig(info: { Self.good[$0] })
        #expect(c.env == .local)
        #expect(c.supabaseURL.absoluteString == "http://127.0.0.1:54321")
        #expect(c.apiBase.host == "127.0.0.1")
        #expect(c.build == "1.0.0 (7)")
    }

    @Test(arguments: ["APP_ENV", "SUPABASE_URL", "SUPABASE_ANON_KEY", "API_BASE_URL", "CFBundleShortVersionString", "CFBundleVersion"])
    func eachMissingKeyThrowsItsOwnError(_ key: String) {
        var info = Self.good
        info[key] = nil
        #expect(throws: AppConfig.ConfigError.missing(key)) {
            _ = try AppConfig(info: { info[$0] })
        }
    }

    @Test func malformedValuesThrow() {
        var info = Self.good
        info["APP_ENV"] = "production"
        #expect(throws: AppConfig.ConfigError.malformed("APP_ENV", "production")) { _ = try AppConfig(info: { info[$0] }) }
        info = Self.good
        info["SUPABASE_URL"] = "not a url"
        #expect(throws: AppConfig.ConfigError.malformed("SUPABASE_URL", "not a url")) { _ = try AppConfig(info: { info[$0] }) }
        info = Self.good
        info["API_BASE_URL"] = "127.0.0.1:3000"   // no scheme
        #expect(throws: AppConfig.ConfigError.malformed("API_BASE_URL", "127.0.0.1:3000")) { _ = try AppConfig(info: { info[$0] }) }
    }

    @Test func theRealBundleIsConfigured() throws {
        // The xcconfig → Info.plist pipeline: a Debug-Local test run must see the local values in the HOST app's bundle.
        let app = try #require(Bundle(identifier: "xyz.downto.app"), "unit tests must run hosted by Downto.app")
        let c = try AppConfig(bundle: app)
        #expect(c.env == .local)
        #expect(c.supabaseURL.port == 54321)
        #expect(c.apiBase.absoluteString == "http://127.0.0.1:3000")
        #expect(c.build == "1.0.0 (1)")
    }
}
