// DowntoTests/Stores/FeedTestSupport.swift — a live-shaped AppEnvironment for store tests (ARCHITECTURE §11.3).
// `fake: true` → the stores' network methods early-return; `fake: false` points Supabase at 127.0.0.1:1 (connection refused
// in milliseconds) so failure paths can be exercised without a server.
import Foundation
import Testing
@testable import Downto

enum FeedTestSupport {
    static func config() throws -> AppConfig {
        let info: [String: Any] = [
            "APP_ENV": "local", "SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_ANON_KEY": "anon",
            "API_BASE_URL": "https://downto.test", "CFBundleShortVersionString": "1.0.0", "CFBundleVersion": "1",
        ]
        return try AppConfig(info: { info[$0] })
    }

    /// Fresh defaults per environment so seen-ids / shared-check keys never leak between tests.
    @MainActor
    static func environment(fake: Bool, world: Fixtures.World = .busyFriday, now: Date? = nil) throws -> (AppEnvironment, Fixtures.Built) {
        Defaults.store = UserDefaults(suiteName: "DowntoTests.\(UUID().uuidString)")!
        let built = Fixtures.world(world, now: now)
        let env = AppEnvironment(config: try config(), isFake: fake, apiSession: DowntoAPI.makeSession(protocolClasses: [StubURLProtocol.self]))
        env.profile.setFake(me: built.me)
        env.session.setFakeState(.signedIn(built.me.id))
        env.feed.load(raw: built.feed, phase: .loaded(at: built.now, stale: false), now: built.now)
        return (env, built)
    }
}

extension FeedStore {
    func check(_ id: CheckID) -> FeedCheck? { items.compactMap(\.check).first { $0.id == id } }
}
