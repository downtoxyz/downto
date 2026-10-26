// DowntoTests/Stores/MysteryLeakTests.swift — §9.3: the WHOLE display output of a locked squad carries no name, username or id.
import Foundation
import Testing
@testable import Downto

@Suite("Mystery leak — squads lane")
struct MysteryLeakTests {
    /// Names appear quoted in `String(reflecting:)`; ids never do. Quoting avoids false hits like "mo" inside "kaomoji".
    static func forbidden(_ profiles: [UserID: Profile]) -> [String] {
        profiles.values.flatMap { ["\"\($0.displayName)\"", "\"\($0.username)\"", $0.id.description] }
    }

    @Test func chatDisplayCarriesNoIdentity() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let chat = SquadsTestSupport.chat(env, w, w.mystery)
        #expect(chat.isMysteryLocked)
        let dump = String(reflecting: (chat.members, chat.messages, chat.pendingConfirm, chat.polls, chat.votes, chat.confirms))
        for needle in Self.forbidden(w.squads.profiles) {
            #expect(!dump.localizedCaseInsensitiveContains(needle), "leaked \(needle)")
        }
        #expect(!dump.contains("@sara"))                              // stripAtMentions on message text
        #expect(!chat.messages.contains { $0.isSystem })
        #expect(!chat.messages.contains { if case .dateConfirm = $0.kind { true } else { false } })
        #expect(!chat.messages.contains { if case .pollPlaceholder = $0.kind { true } else { false } })
        #expect(chat.members.map(\.id.description).allSatisfy { $0.hasPrefix("k:") })
        #expect(chat.userId(for: chat.members[0].id) == nil)
    }

    @Test func squadRowCarriesNoIdentityAndNoSystemPreview() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let row = try #require(env.squads.rows.first { $0.id == w.mystery })
        let dump = String(reflecting: row)
        for needle in Self.forbidden(w.squads.profiles) {
            #expect(!dump.localizedCaseInsensitiveContains(needle), "leaked \(needle)")
        }
        #expect(row.lastMessage == nil)                               // newest row is a system line → no preview, no unread
        #expect(!row.hasUnread)
        #expect(row.members.allSatisfy { $0.isMasked })
    }

    @Test func unlockedSquadsStillShowPeople() throws {
        let (env, w) = try SquadsTestSupport.environment()
        let row = try #require(env.squads.rows.first { $0.id == w.movieNight })
        #expect(row.members.contains { $0.label == "Sara" })
        #expect(row.lastMessage?.sender?.label == "Sara")
    }
}
