// DowntoTests/Stores/ChatStoreTests.swift — projection, grouping, promotion (§5.6 path 1: zero toasts), mystery lock (§9.3).
import Foundation
import Testing
@testable import Downto

@Suite("ChatStore")
struct ChatStoreTests {
    @Test func projectsTranscriptInOrderWithGroupStarts() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.movieNight)
        #expect(chat.messages.count == 12)
        #expect(chat.messages.map(\.createdAt) == chat.messages.map(\.createdAt).sorted())
        // sara's two consecutive messages 30 s apart: the second is not a group start.
        let saraPair = chat.messages.filter { $0.plainText == "where are we meeting" || $0.plainText == "@kat you said the corner one? https://maps.example/x" }
        #expect(saraPair[0].isGroupStart && !saraPair[1].isGroupStart)
        #expect(saraPair[1].mentionNames == ["kat"])
        // system rows break groups; image rows render as .image with the stored aspect.
        #expect(chat.messages.contains { if case .system("mo just entered the chat") = $0.kind { true } else { false } })
        #expect(chat.messages.contains { if case .image(_, 1200, 1600) = $0.kind { true } else { false } })
        #expect(chat.myRole == .member)
        #expect(chat.isMysteryLocked == false)
        #expect(chat.members.allSatisfy { $0.id.description.hasPrefix("u:") })
    }

    @Test func optimisticSendIsDedupedByTheEcho() async throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.movieNight)
        await chat.send(text: "omw", mentions: [])
        #expect(chat.messages.count == 13)
        #expect(chat.messages.last?.plainText == "omw")
        #expect(chat.messages.last?.isMine == true)
        #expect(chat.lastOwnSendId == chat.messages.last?.id)
        let echo = Message(id: chat.messages.last!.id, squadId: w.movieNight, senderId: UserID(SquadFixtures.uuid(1)), text: "omw", isSystem: false,
                           messageType: .text, mentions: [], imagePath: nil, imageWidth: nil, imageHeight: nil, createdAt: .now)
        await chat.apply(.insert(echo))
        #expect(chat.messages.count == 13)
        #expect(chat.sending.isEmpty)
    }

    @Test func waitlistPromotionFlipsTheRoleWithZeroToasts() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.karaoke)
        #expect(chat.myRole == .waitlist)
        #expect(chat.pendingConfirm == nil)                          // waitlisted members never see the bar
        var raw = w.chats[w.karaoke]!
        let me = UserID(SquadFixtures.uuid(1))
        raw.members = raw.members.map { m in m.userId == me ? SquadMember(id: m.id, squadId: m.squadId, userId: m.userId, role: .member, joinedAt: m.joinedAt) : m }
        let confirmId = ConfirmRowID(SquadFixtures.uuid(420))
        raw.confirms[confirmId] = SquadDateConfirm(id: confirmId, squadId: w.karaoke, messageId: raw.messages.values.first { $0.messageType == .dateConfirm }!.id,
                                                   userId: me, response: nil, respondedAt: nil, createdAt: .now)
        chat.load(raw: raw)
        #expect(chat.myRole == .member)
        #expect(chat.pendingConfirm != nil)                          // the date-confirm bar unfurls after promotion
        #expect(chat.pendingConfirm?.answered == nil)
        #expect(env.toasts.current == nil)                           // §5.6: path 1 emits no toast
    }

    @Test func dateConfirmRowCarriesEveryMembersAnswer() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.karaoke)
        guard let row = chat.messages.first(where: { if case .dateConfirm = $0.kind { true } else { false } }),
              case .dateConfirm(let date, let time, let responses) = row.kind else { Issue.record("no date-confirm row"); return }
        #expect(date.iso == w.squads.checks[w.karaoke]?.eventDate?.iso)
        #expect(time == "9pm")
        #expect(responses.count == 4)
        #expect(responses.filter { $0.response == .yes }.count == 2)
    }

    @Test func mysteryLockDropsSystemPollAndDateConfirmRows() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.mystery)
        #expect(chat.isMysteryLocked)
        #expect(chat.messages.count == 2)
        #expect(chat.messages.allSatisfy { if case .text = $0.kind { true } else { false } })
        #expect(chat.pendingConfirm == nil)
        #expect(chat.activePollQuestion == nil)
        #expect(chat.members.allSatisfy { $0.id.description.hasPrefix("k:") && $0.presence.isMasked })
        #expect(chat.mentionable.isEmpty)
    }

    @Test func realtimeSystemRowWhileLockedNeverFlashesIn() async throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.mystery)
        let before = chat.messages
        await chat.apply(.insert(SquadFixtures.message(77, squad: w.mystery, sender: nil, "lena just entered the chat", at: .now, system: true)))
        #expect(chat.messages == before)
    }

    @Test func lockLiftsOnTheEventDay() throws {
        let eventDay = Calendar.current.date(byAdding: .day, value: 3, to: SquadFixtures.friday)!
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.mystery)
        #expect(chat.isMysteryLocked)
        chat.setNow(eventDay)                                        // the midnight tick re-runs rebuild in place (§4.8)
        #expect(!chat.isMysteryLocked)
        #expect(chat.messages.count == 7)                            // system / poll / date-confirm rows re-included
        #expect(chat.members.allSatisfy { $0.id.description.hasPrefix("u:") })
    }
}
