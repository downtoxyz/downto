// Preview/SquadFixtures.swift — the squads slice of `Fixtures.world(.busyFriday)` (ARCHITECTURE §11.3). The feed lane owns
// `Fixtures.swift`; this file is composable: pass `me` and the shared profiles in, get SquadsRaw + per-squad ChatRaw back.
import Foundation

nonisolated enum SquadFixtures {
    nonisolated struct Built: Sendable {
        let squads: SquadsRaw
        let chats: [SquadID: ChatRaw]
        let movieNight: SquadID
        let karaoke: SquadID
        let mystery: SquadID
    }

    /// 2026-05-01 18:00 America/Los_Angeles.
    static let friday: Date = {
        var c = DateComponents(); c.year = 2026; c.month = 5; c.day = 1; c.hour = 18
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return cal.date(from: c)!
    }()

    /// Shares id space with `Fixtures` (feed lane): people 1…5 and checks 101…106 resolve to the same rows there, so squads' checkId
    /// matches the feed's check and mySquadMemberships line up.
    static func uuid(_ n: Int) -> UUID {
        switch n {
        case 1...5: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", n))!
        case 101...106: UUID(uuidString: String(format: "10000000-0000-0000-0000-%012d", n - 100))!
        default: UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", n))!
        }
    }

    static func profile(_ n: Int, _ name: String) -> Profile {
        Profile(id: UserID(uuid(n)), username: name.lowercased(), displayName: name, avatarUrl: nil, avatarLetter: String(name.prefix(1)).uppercased(),
                availability: .open, igHandle: nil, onboarded: true, isTest: true, timezone: "America/Los_Angeles", themeEnabled: false,
                calendarToken: nil, referredByCheckId: nil, usernameChangedAt: nil, createdAt: friday.addingTimeInterval(-86_400 * 30), updatedAt: friday)
    }

    /// The five §11.3 people, keyed by id. `me` is kat (1).
    static func people() -> [UserID: Profile] {
        let ps = [profile(1, "Kat"), profile(2, "Sara"), profile(3, "Devon"), profile(4, "Mo"), profile(5, "Lena")]
        return Dictionary(uniqueKeysWithValues: ps.map { ($0.id, $0) })
    }

    static func check(_ n: Int, author: UserID, text: String, date: LocalDate? = nil, time: String? = nil, mystery: Bool = false, max: Int? = nil, expiresAt: Date? = nil, now: Date) -> InterestCheck {
        InterestCheck(id: CheckID(uuid(100 + n)), authorId: author, text: text, expiresAt: expiresAt, eventDate: date,
                      eventDateLabel: date.map { _ in "sat may 2" }, eventTime: time, eventTz: nil, dateFlexible: date == nil, timeFlexible: time == nil,
                      location: mystery ? "somewhere in bushwick" : nil, maxSquadSize: max, mystery: mystery, letterboxdUrl: nil, movieMetadata: nil,
                      sharedAt: nil, archivedAt: nil, lastRalliedAt: nil, createdAt: now.addingTimeInterval(-3600 * 5))
    }

    static func message(_ n: Int, squad: SquadID, sender: UserID?, _ text: String, at: Date, system: Bool = false, type: MessageType = .text,
                        image: (path: String, w: Int, h: Int)? = nil, mentions: [UserID] = []) -> Message {
        Message(id: MessageID(uuid(1000 + n)), squadId: squad, senderId: sender, text: text, isSystem: system, messageType: type, mentions: mentions,
                imagePath: image?.path, imageWidth: image?.w, imageHeight: image?.h, createdAt: at)
    }

    /// `.busyFriday`: "movie night" (3 members, unread: sara "omw 🍿"), "karaoke sat" (capped 4, full, I'm waitlisted) and the
    /// mystery "???" squad (devon, event date = friday + 3 → locked) with system / poll / date-confirm rows for MysteryLeakTests.
    static func busyFriday(me: UserID = UserID(uuid(1)), profiles: [UserID: Profile] = people(), now: Date = friday, longChat: Bool = false) -> Built {
        let kat = me, sara = UserID(uuid(2)), devon = UserID(uuid(3)), mo = UserID(uuid(4)), lena = UserID(uuid(5))
        let cal = Calendar.current
        let movieNight = SquadID(uuid(200)), karaoke = SquadID(uuid(201)), mystery = SquadID(uuid(202))

        let movieCheck = check(1, author: sara, text: "movie night?", now: now)
        let karaokeCheck = check(3, author: mo, text: "karaoke sat", date: LocalDate(now, calendar: cal).adding(days: 1, calendar: cal), time: "9pm", max: 4, now: now)
        let mysteryCheck = check(4, author: devon, text: "??? @sara knows", date: LocalDate(now, calendar: cal).adding(days: 3, calendar: cal), time: "8pm", mystery: true, now: now)

        var raw = SquadsRaw()
        raw.profiles = profiles
        raw.squads[movieNight] = Squad(id: movieNight, name: "movie night", checkId: movieCheck.id, eventId: nil, createdBy: sara, meetingSpot: nil, arrivalTime: nil,
                                       transportNotes: nil, expiresAt: nil, graceStartedAt: nil, warnedAt: nil, archivedAt: nil, dateNudgeSentAt: nil,
                                       lockedDate: nil, dateStatus: nil, createdAt: now.addingTimeInterval(-3600 * 4))
        raw.squads[karaoke] = Squad(id: karaoke, name: "karaoke sat", checkId: karaokeCheck.id, eventId: nil, createdBy: mo, meetingSpot: nil, arrivalTime: nil,
                                    transportNotes: nil, expiresAt: now.addingTimeInterval(86_400 * 2), graceStartedAt: nil, warnedAt: nil, archivedAt: nil,
                                    dateNudgeSentAt: nil, lockedDate: karaokeCheck.eventDate, dateStatus: .proposed, createdAt: now.addingTimeInterval(-3600 * 20))
        raw.squads[mystery] = Squad(id: mystery, name: "???", checkId: mysteryCheck.id, eventId: nil, createdBy: devon, meetingSpot: nil, arrivalTime: nil,
                                    transportNotes: nil, expiresAt: now.addingTimeInterval(86_400 * 4), graceStartedAt: nil, warnedAt: nil, archivedAt: nil,
                                    dateNudgeSentAt: nil, lockedDate: nil, dateStatus: nil, createdAt: now.addingTimeInterval(-3600 * 30))
        raw.checks = [movieNight: movieCheck, karaoke: karaokeCheck, mystery: mysteryCheck]
        func member(_ n: Int, _ s: SquadID, _ u: UserID, _ role: SquadRole = .member, hoursAgo: Double) -> SquadMember {
            SquadMember(id: uuid(300 + n), squadId: s, userId: u, role: role, joinedAt: now.addingTimeInterval(-3600 * hoursAgo))
        }
        raw.members[movieNight] = [member(1, movieNight, sara, hoursAgo: 4), member(2, movieNight, kat, hoursAgo: 3.5), member(3, movieNight, mo, hoursAgo: 3)]
        raw.members[karaoke] = [member(4, karaoke, mo, hoursAgo: 20), member(5, karaoke, sara, hoursAgo: 19), member(6, karaoke, lena, hoursAgo: 18),
                                member(7, karaoke, devon, hoursAgo: 17), member(8, karaoke, kat, .waitlist, hoursAgo: 2)]
        raw.members[mystery] = [member(9, mystery, devon, hoursAgo: 30), member(10, mystery, kat, hoursAgo: 25), member(11, mystery, sara, hoursAgo: 24), member(12, mystery, mo, hoursAgo: 10)]
        raw.readCursors = [movieNight: now.addingTimeInterval(-3600), karaoke: now.addingTimeInterval(-600), mystery: now.addingTimeInterval(-600)]

        // movie night: 12 messages incl. system rows + one image; sara's "omw 🍿" is newest and after my cursor → unread.
        let t0 = now.addingTimeInterval(-3600 * 3.5)
        var movie: [Message] = [
            message(1, squad: movieNight, sender: nil, "sara just entered the chat", at: t0, system: true),
            message(2, squad: movieNight, sender: nil, "kat just entered the chat", at: t0.addingTimeInterval(60), system: true),
            message(3, squad: movieNight, sender: sara, "where are we meeting", at: t0.addingTimeInterval(120)),
            message(4, squad: movieNight, sender: sara, "@kat you said the corner one? https://maps.example/x", at: t0.addingTimeInterval(150), mentions: [kat]),
            message(5, squad: movieNight, sender: kat, "yeah the one with the neon", at: t0.addingTimeInterval(400)),
            message(6, squad: movieNight, sender: kat, "7:30?", at: t0.addingTimeInterval(430)),
            message(7, squad: movieNight, sender: nil, "mo just entered the chat", at: t0.addingTimeInterval(900), system: true),
            message(8, squad: movieNight, sender: mo, "sold", at: t0.addingTimeInterval(1000)),
            message(9, squad: movieNight, sender: mo, "", at: t0.addingTimeInterval(1100), image: ("\(movieNight)/poster.jpg", 1200, 1600)),
            message(10, squad: movieNight, sender: sara, "omg yes", at: t0.addingTimeInterval(2000)),
            message(11, squad: movieNight, sender: kat, "see you there", at: t0.addingTimeInterval(2600)),
            message(12, squad: movieNight, sender: sara, "omw 🍿", at: now.addingTimeInterval(-900)),
        ]
        if longChat {
            // 300-row variant for the §11.4 prepend assertion: 288 filler rows before the twelve above.
            let start = t0.addingTimeInterval(-86_400)
            let filler = (0..<288).map { i in
                message(2000 + i, squad: movieNight, sender: [sara, kat, mo][i % 3], "msg \(i)", at: start.addingTimeInterval(Double(i) * 200))
            }
            movie = filler + movie
        }
        // karaoke: 4 messages incl. the date-confirm row.
        let k0 = now.addingTimeInterval(-3600 * 18)
        let karaokeMessages: [Message] = [
            message(20, squad: karaoke, sender: nil, "lena just entered the chat", at: k0, system: true),
            message(21, squad: karaoke, sender: mo, "sat 9pm, who's in", at: k0.addingTimeInterval(100)),
            message(22, squad: karaoke, sender: mo, "mo proposed sat may 2 at 9pm — are you still down?", at: k0.addingTimeInterval(200), type: .dateConfirm),
            message(23, squad: karaoke, sender: lena, "yesss", at: now.addingTimeInterval(-1200)),
        ]
        // mystery: text + the rows the lock must drop (system / poll / dateConfirm).
        let m0 = now.addingTimeInterval(-3600 * 24)
        let mysteryMessages: [Message] = [
            message(30, squad: mystery, sender: nil, "sara just entered the chat", at: m0, system: true),
            message(31, squad: mystery, sender: devon, "see you there", at: m0.addingTimeInterval(100)),
            message(32, squad: mystery, sender: sara, "cannot wait", at: m0.addingTimeInterval(200)),
            message(33, squad: mystery, sender: nil, "mo got kicked from the chat", at: m0.addingTimeInterval(300), system: true),
            message(34, squad: mystery, sender: devon, "thurs or fri?", at: m0.addingTimeInterval(400), type: .poll),
            message(35, squad: mystery, sender: devon, "devon proposed — are you still down?", at: m0.addingTimeInterval(500), type: .dateConfirm),
            message(36, squad: mystery, sender: nil, "sara just entered the chat", at: now.addingTimeInterval(-300), system: true),
        ]
        raw.lastMessages = [movieNight: movie.last!, karaoke: karaokeMessages.last!, mystery: mysteryMessages.last!]

        func chat(_ s: SquadID, _ msgs: [Message]) -> ChatRaw {
            var c = ChatRaw()
            c.squad = raw.squads[s]; c.check = raw.checks[s]; c.members = raw.members[s] ?? []; c.profiles = profiles
            c.messages = Dictionary(uniqueKeysWithValues: msgs.map { ($0.id, $0) })
            c.oldestLoadedAt = msgs.first?.createdAt
            return c
        }
        var karaokeChat = chat(karaoke, karaokeMessages)
        let confirmMsg = karaokeMessages[2]
        karaokeChat.confirms = Dictionary(uniqueKeysWithValues: [mo, sara, lena, devon].enumerated().map { i, u in
            let id = ConfirmRowID(uuid(400 + i))
            return (id, SquadDateConfirm(id: id, squadId: karaoke, messageId: confirmMsg.id, userId: u, response: i < 2 ? .yes : nil, respondedAt: i < 2 ? k0 : nil, createdAt: k0))
        })
        var mysteryChat = chat(mystery, mysteryMessages)
        let poll = SquadPoll(id: PollID(uuid(500)), squadId: mystery, messageId: mysteryMessages[4].id, question: "thurs or fri?", options: [.text("thurs"), .text("fri")],
                             status: .active, createdBy: devon, multiSelect: false, pollType: .text, collectionStyle: nil, gridDates: nil, gridHourStart: nil, gridHourEnd: nil, gridSlotMinutes: nil, createdAt: m0)
        mysteryChat.polls = [poll.id: poll]
        let mid = ConfirmRowID(uuid(410))
        mysteryChat.confirms = [mid: SquadDateConfirm(id: mid, squadId: mystery, messageId: mysteryMessages[5].id, userId: sara, response: .yes, respondedAt: m0, createdAt: m0)]

        return Built(squads: raw, chats: [movieNight: chat(movieNight, movie), karaoke: karaokeChat, mystery: mysteryChat], movieNight: movieNight, karaoke: karaoke, mystery: mystery)
    }
}
