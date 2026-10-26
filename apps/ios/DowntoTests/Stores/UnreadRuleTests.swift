// DowntoTests/Stores/UnreadRuleTests.swift — the §5.5 rule, pure and through the store.
import Foundation
import Testing
@testable import Downto

@Suite("Squad unread rule (§5.5)")
struct UnreadRuleTests {
    let me = UserID(SquadFixtures.uuid(1))
    let sara = UserID(SquadFixtures.uuid(2))
    let squad = SquadID(SquadFixtures.uuid(200))
    let t = SquadFixtures.friday

    func msg(from: UserID?, at: Date, system: Bool = false) -> Message {
        SquadFixtures.message(1, squad: squad, sender: from, "hi", at: at, system: system)
    }

    @Test func noLastMessageIsRead() {
        #expect(!SquadsStore.hasUnread(lastMessage: nil, me: me, cursor: nil, openSquadId: nil))
    }

    @Test func myOwnMessageIsRead() {
        #expect(!SquadsStore.hasUnread(lastMessage: msg(from: me, at: t), me: me, cursor: nil, openSquadId: nil))
    }

    @Test func othersMessageWithNoCursorIsUnread() {
        #expect(SquadsStore.hasUnread(lastMessage: msg(from: sara, at: t), me: me, cursor: nil, openSquadId: nil))
    }

    @Test func cursorAfterMessageIsRead() {
        #expect(!SquadsStore.hasUnread(lastMessage: msg(from: sara, at: t), me: me, cursor: t.addingTimeInterval(1), openSquadId: nil))
    }

    @Test func cursorBeforeMessageIsUnread() {
        #expect(SquadsStore.hasUnread(lastMessage: msg(from: sara, at: t), me: me, cursor: t.addingTimeInterval(-1), openSquadId: nil))
    }

    @Test func openSquadIsNeverUnread() {
        #expect(!SquadsStore.hasUnread(lastMessage: msg(from: sara, at: t), me: me, cursor: nil, openSquadId: squad))
    }

    @Test func systemRowsAreNotActivity() {
        #expect(!SquadsStore.hasUnread(lastMessage: msg(from: nil, at: t, system: true), me: me, cursor: nil, openSquadId: nil))
    }

    @Test func storeSeedsSectionsFromTheRule() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let rows = env.squads.rows
        #expect(rows.first { $0.id == w.movieNight }?.hasUnread == true)          // sara's "omw 🍿" after my cursor
        #expect(rows.first { $0.id == w.karaoke }?.hasUnread == false)            // waitlisted → never unread
        #expect(env.squads.sections.newMessages.map(\.id) == [w.movieNight])
        #expect(!env.squads.unread.contains(w.karaoke))
    }

    @Test func markReadMovesTheRowOutOfNewMessages() async throws {
        let (env, w) = try SquadsTestSupport.environment()
        await env.squads.markRead(w.movieNight)
        #expect(env.squads.rows.first { $0.id == w.movieNight }?.hasUnread == false)
        #expect(env.squads.sections.newMessages.isEmpty)
    }

    @Test func realtimeInsertFromAFriendMarksUnreadAndUpdatesThePreview() throws {
        let (env, w) = try SquadsTestSupport.environment()
        env.squads.apply(SquadFixtures.message(99, squad: w.karaoke, sender: sara, "wait for me", at: SquadFixtures.friday))
        let row = env.squads.rows.first { $0.id == w.karaoke }
        #expect(row?.lastMessage?.text == "wait for me")
        #expect(env.squads.unread.contains(w.karaoke))
    }

    @Test func membershipsReachTheFeed() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let m = env.feed.raw.mySquadMemberships
        #expect(m.values.contains { $0.squadId == w.karaoke && $0.role == .waitlist })
        #expect(m.values.contains { $0.squadId == w.movieNight && $0.role == .member })
    }
}
