// DowntoTests/Support/FixtureLoader.swift — loads DowntoTests/Fixtures/rows/*.json from the test bundle.
// (Not `Fixtures` — that name is the app's Preview/Fixtures.swift world builder.)
import Foundation
@testable import Downto

private final class FixtureBundleToken {}

nonisolated enum FixtureLoader {
    static let bundle = Bundle(for: FixtureBundleToken.self)

    /// Raw bytes of `rows/<name>.json` (xcodegen flattens resource folders into the bundle root).
    static func data(_ name: String) throws -> Data {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: "\(name).json"])
        }
        return try Data(contentsOf: url)
    }

    /// Decodes a fixture with the production PostgREST coder.
    static func rows<T: Decodable>(_ name: String, as _: T.Type = T.self, decoder: JSONDecoder = JSON.decoder) throws -> T {
        try decoder.decode(T.self, from: data(name))
    }
}
