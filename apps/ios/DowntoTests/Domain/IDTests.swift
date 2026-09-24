import Foundation
import Testing
@testable import Downto

@Suite("ID<Tag>")
struct IDTests {
    @Test func roundTripsThroughJSONAsAString() throws {
        let id = CheckID(UUID(uuidString: "A1B2C3D4-0000-4000-8000-000000000001")!)
        let data = try JSONEncoder().encode([id])
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"A1B2C3D4-0000-4000-8000-000000000001\""))
        let back = try JSONDecoder().decode([CheckID].self, from: data)
        #expect(back == [id])
    }

    @Test func decodesLowercasePostgrestUUIDs() throws {
        let data = Data("\"a1b2c3d4-0000-4000-8000-000000000001\"".utf8)
        let id = try JSONDecoder().decode(UserID.self, from: data)
        #expect(id.raw.uuidString == "A1B2C3D4-0000-4000-8000-000000000001")
    }

    @Test func descriptionIsLowercase() {
        let id = SquadID(UUID(uuidString: "3F2504E0-4F89-11D3-9A0C-0305E82C3301")!)
        #expect(id.description == "3f2504e0-4f89-11d3-9a0c-0305e82c3301")
        #expect("\(id)" == "3f2504e0-4f89-11d3-9a0c-0305e82c3301")
    }

    @Test func stringInitRejectsGarbage() {
        #expect(CheckID("not-a-uuid") == nil)
        #expect(CheckID("") == nil)
        #expect(CheckID("3f2504e0-4f89-11d3-9a0c-0305e82c3301") != nil)
    }

    @Test func idsAreDictionaryKeysThatEncodeAsObjects() throws {
        let a = CheckID(UUID()), b = CheckID(UUID())
        let dict: [CheckID: Int] = [a: 1, b: 2]
        let data = try JSONEncoder().encode(dict)
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.hasPrefix("{"), "ID-keyed dictionaries must encode as JSON objects, not pair arrays")
        let back = try JSONDecoder().decode([CheckID: Int].self, from: data)
        #expect(back == dict)
    }

    @Test func differentTagsAreDifferentTypes() {
        // Compile-time property: CheckID and SquadID share a UUID but are not interchangeable.
        let raw = UUID()
        let check = CheckID(raw), squad = SquadID(raw)
        #expect(check.raw == squad.raw)
        #expect(type(of: check) != type(of: squad))
    }

    @Test func decodesOffTheMainActor() async throws {
        // Proves the Codable conformance is nonisolated (ARCHITECTURE §1.0) — this would fail to compile/run under MainActor isolation.
        let data = Data("\"a1b2c3d4-0000-4000-8000-000000000001\"".utf8)
        let id = try await Task.detached {
            try JSONDecoder().decode(UserID.self, from: data)
        }.value
        #expect(id.description == "a1b2c3d4-0000-4000-8000-000000000001")
    }
}
