// DowntoTests/Stores/SquadsTestSupport.swift — a fake AppEnvironment pre-filled with SquadFixtures (no network, ARCHITECTURE §11.3).
import Foundation
@testable import Downto

enum SquadsTestSupport {
    static func environment(now: Date = SquadFixtures.friday, longChat: Bool = false) throws -> (env: AppEnvironment, world: SquadFixtures.Built) {
        let info: [String: Any] = ["APP_ENV": "local", "SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_ANON_KEY": "anon",
                                   "API_BASE_URL": "http://127.0.0.1:1", "CFBundleShortVersionString": "1.0.0", "CFBundleVersion": "1"]
        let config = try AppConfig(info: { info[$0] })
        let env = AppEnvironment(config: config, isFake: true)
        let me = UserID(SquadFixtures.uuid(1))
        env.profile.setFake(me: SquadFixtures.people()[me]!)
        env.session.setFakeState(.signedIn(me))
        let world = SquadFixtures.busyFriday(me: me, now: now, longChat: longChat)
        env.squads.load(raw: world.squads, phase: .loaded(at: now, stale: false))
        env.squads.setNow(now)
        return (env, world)
    }

    static func chat(_ env: AppEnvironment, _ world: SquadFixtures.Built, _ id: SquadID) -> ChatStore {
        let c = ChatStore(squadId: id, env: env)
        c.load(raw: world.chats[id]!)
        c.setNow(env.squads.now)
        return c
    }
}
