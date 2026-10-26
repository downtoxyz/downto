// Preview/SocialFixtures.swift — the social slice of the `.busyFriday` world (ARCHITECTURE §11.3): 3 notifications; sara + mo accepted,
// lena incoming, devon a FoF suggestion via sara. The feed lane's `Fixtures.swift` owns the profiles and composes this in.
import Foundation

nonisolated enum SocialFixtures {
    nonisolated struct People: Sendable {
        let me: Profile
        let sara: Profile
        let devon: Profile
        let mo: Profile
        let lena: Profile
        var all: [Profile] { [me, sara, devon, mo, lena] }
    }

    static let friday: Date = {
        var c = DateComponents(); c.year = 2026; c.month = 5; c.day = 1; c.hour = 18
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return cal.date(from: c)!
    }()

    static func uuid(_ n: Int) -> UUID { UUID(uuidString: String(format: "5000c1a1-0000-4000-8000-%012d", n))! }

    static func profile(_ n: Int, _ username: String, _ name: String, availability: Availability = .open, now: Date = friday) -> Profile {
        Profile(id: UserID(uuid(n)), username: username, displayName: name, avatarUrl: nil, avatarLetter: String(name.prefix(1)).uppercased(),
                availability: availability, igHandle: n == 2 ? "sara.jpg" : nil, onboarded: true, isTest: true, timezone: "America/Los_Angeles",
                themeEnabled: false, calendarToken: nil, referredByCheckId: nil, usernameChangedAt: nil, createdAt: now.addingTimeInterval(-86_400 * 30), updatedAt: now)
    }

    /// The five `.busyFriday` people, in case the caller has no profiles of its own.
    static func people(now: Date = friday) -> People {
        People(me: profile(1, "kat", "Kat", now: now), sara: profile(2, "sara", "Sara", now: now), devon: profile(3, "devon", "Devon", availability: .awkward, now: now),
               mo: profile(4, "mo", "Mo", availability: .notAvailable, now: now), lena: profile(5, "lena", "Lena", now: now))
    }

    /// `me` is the viewer; `profiles` must contain sara / devon / mo / lena by username (falls back to `people()` for any missing).
    static func busyFriday(me: Profile, profiles: [Profile], now: Date = friday,
                           squadId: SquadID? = nil, climbingCheckId: CheckID? = nil) -> (notifications: [AppNotification], friends: FriendsRaw) {
        let fallback = people(now: now)
        func p(_ username: String, _ fb: Profile) -> Profile { profiles.first { $0.username == username } ?? fb }
        let sara = p("sara", fallback.sara), devon = p("devon", fallback.devon), mo = p("mo", fallback.mo), lena = p("lena", fallback.lena)
        let squad = squadId ?? SquadID(uuid(100))
        let climbing = climbingCheckId ?? CheckID(uuid(101))

        let notifications = [
            AppNotification(id: NotificationID(uuid(201)), userId: me.id, title: "movie night", body: "sara: omw 🍿", isRead: false, type: .squadMessage,
                            relatedUserId: sara.id, relatedSquadId: squad, relatedCheckId: nil, relatedEventId: nil, createdAt: now.addingTimeInterval(-15 * 60)),
            AppNotification(id: NotificationID(uuid(202)), userId: me.id, title: "mo is down", body: "climbing sun 10am", isRead: false, type: .checkResponse,
                            relatedUserId: mo.id, relatedSquadId: nil, relatedCheckId: climbing, relatedEventId: nil, createdAt: now.addingTimeInterval(-2 * 3600)),
            AppNotification(id: NotificationID(uuid(203)), userId: me.id, title: "lena wants to be friends", body: nil, isRead: false, type: .friendRequest,
                            relatedUserId: lena.id, relatedSquadId: nil, relatedCheckId: nil, relatedEventId: nil, createdAt: now.addingTimeInterval(-5 * 3600)),
        ]

        var friends = FriendsRaw()
        let fSara = Friendship(id: FriendshipID(uuid(301)), requesterId: me.id, addresseeId: sara.id, status: .accepted, createdAt: now.addingTimeInterval(-86_400 * 20), updatedAt: nil)
        let fMo = Friendship(id: FriendshipID(uuid(302)), requesterId: mo.id, addresseeId: me.id, status: .accepted, createdAt: now.addingTimeInterval(-86_400 * 10), updatedAt: nil)
        let fLena = Friendship(id: FriendshipID(uuid(303)), requesterId: lena.id, addresseeId: me.id, status: .pending, createdAt: now.addingTimeInterval(-5 * 3600), updatedAt: nil)
        friends.friendships = [fSara.id: fSara, fMo.id: fMo, fLena.id: fLena]
        friends.profiles = [sara.id: sara, devon.id: devon, mo.id: mo, lena.id: lena]
        friends.suggestions = [FoFSuggestion(suggestedUserId: devon.id, mutualFriendId: sara.id, mutualFriendName: sara.displayName)]
        return (notifications, friends)
    }
}
