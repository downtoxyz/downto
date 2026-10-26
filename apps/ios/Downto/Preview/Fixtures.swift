// Preview/Fixtures.swift — seeded worlds for previews, fake-world boot and store tests (ARCHITECTURE §11.3).
// Raw rows only — no trigger re-implementation. `.busyFriday` is the feed lane's; squads/chats/notifications/friends
// are empty defaults until those lanes fill them in.
import Foundation

nonisolated enum Fixtures {
    enum World: String, Sendable { case busyFriday, emptyNewUser, mysteryDay }

    nonisolated struct Built: Sendable {
        var me: Profile
        var feed: FeedRaw
        var squads: SquadsRaw
        var chats: [SquadID: ChatRaw]
        var notifications: [AppNotification]
        var friends: FriendsRaw
        var now: Date
    }

    /// Fri 2026-05-01 18:00 America/Los_Angeles.
    static let friday: Date = {
        var c = DateComponents(); c.year = 2026; c.month = 5; c.day = 1; c.hour = 18
        return calendar.date(from: c)!
    }()
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return c
    }()

    // Stable ids so tests can name rows.
    static let katId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
    static let saraId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000002")!)
    static let devonId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000003")!)
    static let moId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000004")!)
    static let lenaId = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000005")!)

    static let movieNightId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000001")!)
    static let rooftopId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000002")!)
    static let karaokeId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000003")!)
    static let mysteryId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000004")!)
    static let climbingId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000005")!)
    static let carId = CheckID(UUID(uuidString: "10000000-0000-0000-0000-000000000006")!)
    static let movieSquadId = SquadID(UUID(uuidString: "20000000-0000-0000-0000-000000000001")!)
    static let karaokeSquadId = SquadID(UUID(uuidString: "20000000-0000-0000-0000-000000000002")!)
    static let fleaEventId = EventID(UUID(uuidString: "30000000-0000-0000-0000-000000000001")!)

    static func profile(_ id: UserID, _ username: String, _ name: String, now: Date) -> Profile {
        Profile(id: id, username: username, displayName: name, avatarUrl: nil, avatarLetter: String(name.prefix(1)).uppercased(), availability: .open,
                igHandle: nil, onboarded: true, isTest: true, timezone: "America/Los_Angeles", themeEnabled: false, calendarToken: nil,
                referredByCheckId: nil, usernameChangedAt: nil, createdAt: now.addingTimeInterval(-30 * 86_400), updatedAt: now)
    }

    static func check(_ id: CheckID, author: UserID, text: String, createdAgo: TimeInterval, expiresIn: TimeInterval? = nil, date: LocalDate? = nil,
                      time: String? = nil, location: String? = nil, cap: Int? = nil, mystery: Bool = false, now: Date) -> InterestCheck {
        let created = now.addingTimeInterval(-createdAgo)
        return InterestCheck(id: id, authorId: author, text: text, expiresAt: expiresIn.map { created.addingTimeInterval($0) }, eventDate: date,
                             eventDateLabel: nil, eventTime: time, eventTz: "America/Los_Angeles", dateFlexible: false, timeFlexible: false,
                             location: location, maxSquadSize: cap, mystery: mystery, letterboxdUrl: nil, movieMetadata: nil, sharedAt: nil,
                             archivedAt: nil, lastRalliedAt: nil, createdAt: created)
    }

    static func response(_ check: CheckID, _ user: UserID, _ kind: ResponseKind = .down, ago: TimeInterval, now: Date) -> CheckResponse {
        CheckResponse(id: ResponseRowID(UUID()), checkId: check, userId: user, response: kind, createdAt: now.addingTimeInterval(-ago))
    }

    static func world(_ w: World, now: Date? = nil) -> Built {
        switch w {
        case .emptyNewUser:
            let t = now ?? friday
            var me = profile(katId, "kat", "Kat", now: t)
            me.onboarded = false
            return Built(me: me, feed: FeedRaw(), squads: SquadsRaw(), chats: [:], notifications: [], friends: FriendsRaw(), now: t)
        case .mysteryDay:
            return busyFriday(now: now ?? friday.addingTimeInterval(3 * 86_400))
        case .busyFriday:
            return busyFriday(now: now ?? friday)
        }
    }

    private static func busyFriday(now: Date) -> Built {
        // `now` may be shifted (mysteryDay); the rows are anchored on the fixed friday so the world is the same, just older.
        let t = friday
        let me = profile(katId, "kat", "Kat", now: t)
        var feed = FeedRaw()
        for p in [me, profile(saraId, "sara", "Sara", now: t), profile(devonId, "devon", "Devon", now: t), profile(moId, "mo", "Mo", now: t), profile(lenaId, "lena", "Lena", now: t)] {
            feed.profiles[p.id] = p
        }
        let fridayDate = LocalDate(t, calendar: calendar)
        let checks = [
            check(movieNightId, author: saraId, text: "movie night? something dumb and loud", createdAgo: 5 * 3600, time: "8pm", location: "sara's", now: t),
            check(rooftopId, author: moId, text: "rooftop tn 9pm — bring a layer", createdAgo: 3 * 3600, expiresIn: 4 * 3600, date: fridayDate, time: "9pm", location: "rooftop", now: t),
            check(karaokeId, author: moId, text: "karaoke sat, cap 4", createdAgo: 20 * 3600, date: fridayDate.adding(days: 1, calendar: calendar), time: "10pm", cap: 4, now: t),
            check(mysteryId, author: devonId, text: "??? @sara knows", createdAgo: 2 * 3600, date: fridayDate.adding(days: 3, calendar: calendar), location: "somewhere in bushwick", mystery: true, now: t),
            check(climbingId, author: katId, text: "climbing sun 10am?", createdAgo: 26 * 3600, date: fridayDate.adding(days: 2, calendar: calendar), time: "10am", location: "the cliffs", now: t),
            check(carId, author: lenaId, text: "who's got a car", createdAgo: 40 * 60, expiresIn: 60 * 60, now: t),
        ]
        for c in checks { feed.checks[c.id] = c }
        let responses = [
            response(movieNightId, katId, ago: 4 * 3600, now: t), response(movieNightId, devonId, ago: 3 * 3600, now: t),
            response(rooftopId, saraId, ago: 2 * 3600, now: t),
            response(karaokeId, saraId, ago: 19 * 3600, now: t), response(karaokeId, devonId, ago: 18 * 3600, now: t), response(karaokeId, lenaId, ago: 17 * 3600, now: t),
            response(karaokeId, katId, .waitlist, ago: 16 * 3600, now: t),
            response(mysteryId, saraId, ago: 1 * 3600, now: t), response(mysteryId, moId, ago: 30 * 60, now: t),
        ]
        for r in responses { feed.responses[r.id] = r }
        feed.fofAnnotations[mysteryId] = "Sara"
        feed.mySquadMemberships[movieNightId] = SquadMembership(squadId: movieSquadId, role: .member)
        feed.mySquadMemberships[karaokeId] = SquadMembership(squadId: karaokeSquadId, role: .waitlist)
        let commentId = CommentID(UUID(uuidString: "40000000-0000-0000-0000-000000000001")!)
        feed.comments[movieNightId] = [CheckComment(id: commentId, checkId: movieNightId, eventId: nil, userId: devonId, text: "i have snacks", mentions: [], createdAt: t.addingTimeInterval(-2 * 3600))]
        feed.events[fleaEventId] = FriendsEventPayload(
            id: fleaEventId, title: "sunday flea", venue: "the lot", neighborhood: "bushwick", date: fridayDate.adding(days: 2, calendar: calendar),
            dateDisplay: "Sun May 3", timeDisplay: "noon", vibes: ["outside", "cheap"], note: nil, imageUrl: nil, igHandle: nil, igUrl: nil, diceUrl: nil,
            letterboxdUrl: nil, raUrl: nil, movieMetadata: nil, isPublic: false, visibility: .friends, createdBy: lenaId, createdAt: t.addingTimeInterval(-10 * 3600),
            creator: .init(displayName: "Lena", avatarLetter: "L"))
        feed.eventDowns[fleaEventId] = [moId]
        return Built(me: me, feed: feed, squads: SquadsRaw(), chats: [:], notifications: [], friends: FriendsRaw(), now: now)
    }
}
