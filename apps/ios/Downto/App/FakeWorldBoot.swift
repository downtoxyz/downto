// App/FakeWorldBoot.swift — `-DT_FAKE_WORLD <world>` launch argument (ARCHITECTURE §11.3). The fixture worlds themselves
// are the lanes' to fill (Preview/Fixtures.swift); until then the hook exists so DowntoApp and the smoke test compile.
import Foundation

enum FakeWorldBoot {
    static func environment(config: AppConfig) -> AppEnvironment? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-DT_FAKE_WORLD"), i + 1 < args.count else { return nil }
        return AppEnvironment.fake(named: args[i + 1], config: config)
        #else
        return nil
        #endif
    }
}

extension AppEnvironment {
    /// A live-shaped environment with every store pre-filled from a fixture world and the network never touched.
    /// TODO(feed/squads/social): populate from `Fixtures.world(_:)` once each lane's raw types are projected.
    static func fake(named name: String, config: AppConfig) -> AppEnvironment {
        let env = AppEnvironment(config: config, isFake: true)
        let meId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
        env.profile.setFake(me: Profile.fakeMe(id: meId))
        env.session.setFakeState(.signedIn(meId))
        env.reachability.setFake(offline: false)
        env.markFakeBooted(meId)
        return env
    }

    func markFakeBooted(_ userId: UserID) {
        bootAfterLogin(userId: userId)
    }
}

extension Profile {
    static func fakeMe(id: UserID) -> Profile {
        Profile(id: id, username: "kat", displayName: "Kat", avatarUrl: nil, avatarLetter: "K", availability: .open, igHandle: nil,
                onboarded: true, isTest: true, timezone: TimeZone.current.identifier, themeEnabled: false, calendarToken: nil,
                referredByCheckId: nil, usernameChangedAt: nil, createdAt: .now, updatedAt: .now)
    }
}
