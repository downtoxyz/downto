// App/FakeWorldBoot.swift — `-DT_FAKE_WORLD <world>` launch argument (ARCHITECTURE §11.3). Builds every store from the
// fixture worlds (Preview/Fixtures.swift + SocialFixtures + SquadFixtures as the lanes land) and never touches the network.
import Foundation

enum FakeWorldBoot {
    static func environment(config: AppConfig) -> AppEnvironment? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-DT_FAKE_WORLD"), i + 1 < args.count else { return nil }
        return AppEnvironment.fake(Fixtures.World(rawValue: args[i + 1]) ?? .busyFriday, config: config)
        #else
        return nil
        #endif
    }
}

extension AppEnvironment {
    /// Chat raws for the fake world; SquadChatView's ChatStore loads from here when `isFake` (see ChatStore.hydrate).
    nonisolated(unsafe) static var fakeChatRaws: [SquadID: ChatRaw] = [:]
    var fakeChats: [SquadID: ChatRaw] {
        get { Self.fakeChatRaws }
        set { Self.fakeChatRaws = newValue }
    }

    /// A live-shaped environment with every store pre-filled from a fixture world; `isFake` short-circuits every network call.
    static func fake(_ world: Fixtures.World, config: AppConfig) -> AppEnvironment {
        Defaults.clearAll(except: [])          // a fixture world is deterministic: no drafts, flags or pending intents from earlier launches
        let env = AppEnvironment(config: config, isFake: true)
        let built = Fixtures.world(world)
        let profiles = Array(built.feed.profiles.values)
                env.profile.setFake(me: built.me)
        env.session.setFakeState(.signedIn(built.me.id))
        env.reachability.setFake(offline: false)
        let phase = LoadPhase.loaded(at: built.now, stale: false)
        env.feed.load(raw: built.feed, phase: phase, now: built.now)
        let squadWorld = SquadFixtures.busyFriday(me: built.me.id, profiles: built.feed.profiles, now: built.now, longChat: true)
        let social = SocialFixtures.busyFriday(me: built.me, profiles: profiles, now: built.now, squadId: squadWorld.movieNight, climbingCheckId: Fixtures.climbingId)
        env.squads.load(raw: world == .emptyNewUser ? SquadsRaw() : squadWorld.squads, phase: phase)
        env.squads.setNow(built.now)
        env.fakeChats = world == .emptyNewUser ? [:] : squadWorld.chats
        env.notifications.load(items: world == .emptyNewUser ? [] : social.notifications, phase: phase)
        env.friends.load(raw: world == .emptyNewUser ? FriendsRaw() : social.friends, phase: phase)
        env.bootAfterLogin(userId: built.me.id)
        #if DEBUG
        // `-DT_TAB squads|you` and `-DT_OPEN_SQUAD movieNight|karaoke|mystery` land the fake world on a screen (smoke tests, screenshots).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-DT_TAB"), i + 1 < args.count {
            env.router.tab = args[i + 1] == "squads" ? .squads : args[i + 1] == "you" ? .you : .feed
        }
        if let i = args.firstIndex(of: "-DT_OPEN_SQUAD"), i + 1 < args.count {
            let id: SquadID? = switch args[i + 1] { case "movieNight": squadWorld.movieNight; case "karaoke": squadWorld.karaoke; case "mystery": squadWorld.mystery; default: nil }
            if let id { env.router.tab = .squads; env.router.squadPath = [id] }
        }
        if let i = args.firstIndex(of: "-DT_TOAST"), i + 1 < args.count {
            let text = args[i + 1]
            Task { try? await Task.sleep(for: .seconds(1)); env.toasts.show(text) }
        }
        #endif
        return env
    }

    static func fake(named name: String, config: AppConfig) -> AppEnvironment {
        fake(Fixtures.World(rawValue: name) ?? .busyFriday, config: config)
    }
}
