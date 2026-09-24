import Foundation
import Testing
@testable import Downto

@Suite("TolerantEnum")
struct EnumTests {
    nonisolated struct Row<E: TolerantEnum>: Codable { let value: E }

    private func decode<E: TolerantEnum>(_ raw: String, as _: E.Type) throws -> E {
        try JSONDecoder().decode(Row<E>.self, from: Data("{\"value\":\"\(raw)\"}".utf8)).value
    }

    @Test func knownValuesDecode() throws {
        #expect(try decode("down", as: ResponseKind.self) == .down)
        #expect(try decode("waitlist", as: ResponseKind.self) == .waitlist)
        #expect(try decode("not-available", as: Availability.self) == .notAvailable)
        #expect(try decode("date_confirm", as: MessageType.self) == .dateConfirm)
        #expect(try decode("squad_date_nudge", as: NotificationType.self) == .squadDateNudge)
        #expect(try decode("public", as: EventVisibility.self) == .public)
    }

    @Test func unknownValuesDecodeToUnknownInsteadOfThrowing() throws {
        #expect(try decode("maybe", as: ResponseKind.self) == .unknown)          // removed in 20260316000001
        #expect(try decode("nah", as: ResponseKind.self) == .unknown)
        #expect(try decode("brand_new_type", as: NotificationType.self) == .unknown)
        #expect(try decode("", as: DateStatus.self) == .unknown)
        #expect(try decode("MEMBER", as: SquadRole.self) == .unknown)          // case-sensitive, like Postgres
    }

    @Test func encodesTheRawValue() throws {
        let data = try JSONEncoder().encode(Row(value: MessageType.dateConfirm))
        #expect(String(decoding: data, as: UTF8.self) == "{\"value\":\"date_confirm\"}")
    }

    @Test func unknownRoundTripsAsTheLiteralString() throws {
        // `.unknown` is never written by the client, but if it were it must not crash.
        let data = try JSONEncoder().encode(Row(value: ResponseKind.unknown))
        #expect(try JSONDecoder().decode(Row<ResponseKind>.self, from: data).value == .unknown)
    }

    @Test func everyTolerantEnumHasUnknownAsACase() {
        // CaseIterable lets check-enums.sh and this test see the whole list.
        #expect(Availability.allCases.contains(.unknown))
        #expect(ResponseKind.allCases.contains(.unknown))
        #expect(CoAuthorStatus.allCases.contains(.unknown))
        #expect(EventVisibility.allCases.contains(.unknown))
        #expect(DateStatus.allCases.contains(.unknown))
        #expect(SquadRole.allCases.contains(.unknown))
        #expect(MessageType.allCases.contains(.unknown))
        #expect(PollStatus.allCases.contains(.unknown))
        #expect(PollType.allCases.contains(.unknown))
        #expect(CollectionStyle.allCases.contains(.unknown))
        #expect(ConfirmResponse.allCases.contains(.unknown))
        #expect(JoinRequestStatus.allCases.contains(.unknown))
        #expect(FriendshipStatus.allCases.contains(.unknown))
        #expect(NotificationType.allCases.contains(.unknown))
        #expect(NotificationType.allCases.count == 23)   // 22 DB values + unknown (20260603000001)
    }

    @Test func strictEnumsStillThrowOnUnknown() {
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder().decode([ReportReason].self, from: Data("[\"boredom\"]".utf8))
        }
    }

    @Test func decodesOffTheMainActor() async throws {
        let kind = try await Task.detached {
            try JSONDecoder().decode([ResponseKind].self, from: Data("[\"down\",\"whatever\"]".utf8))
        }.value
        #expect(kind == [.down, .unknown])
    }
}
