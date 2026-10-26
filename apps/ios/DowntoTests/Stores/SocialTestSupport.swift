// DowntoTests/Stores/SocialTestSupport.swift — a fake AppEnvironment for the social-lane store tests (no network: isFake).
import Foundation
@testable import Downto

enum SocialTestSupport {
    static let config: [String: Any] = [
        "APP_ENV": "local", "SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_ANON_KEY": "anon", "API_BASE_URL": "http://127.0.0.1:1",
        "CFBundleShortVersionString": "0.0.0", "CFBundleVersion": "0",
    ]

    /// Signed in as the fixture `me`, every store empty, realtime never started.
    static func environment() throws -> (env: AppEnvironment, people: SocialFixtures.People) {
        let env = AppEnvironment(config: try AppConfig(info: { config[$0] }), isFake: true)
        let people = SocialFixtures.people()
        env.profile.setFake(me: people.me)
        env.session.setFakeState(.signedIn(people.me.id))
        return (env, people)
    }

    static func squadsRaw(squad: SquadID, me: UserID, role: SquadRole?, now: Date = SocialFixtures.friday) -> SquadsRaw {
        var raw = SquadsRaw()
        raw.squads[squad] = Squad(id: squad, name: "movie night", checkId: CheckID(SocialFixtures.uuid(900)), eventId: nil, createdBy: me,
                                  meetingSpot: nil, arrivalTime: nil, transportNotes: nil, expiresAt: nil, graceStartedAt: nil, warnedAt: nil,
                                  archivedAt: nil, dateNudgeSentAt: nil, lockedDate: nil, dateStatus: nil, createdAt: now)
        if let role {
            raw.members[squad] = [SquadMember(id: SocialFixtures.uuid(901), squadId: squad, userId: me, role: role, joinedAt: now)]
        }
        return raw
    }
}
