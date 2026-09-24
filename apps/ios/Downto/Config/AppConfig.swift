// Config/AppConfig.swift — fail fast, no force-unwraps (ARCHITECTURE §1.2).
// Values arrive through Info.plist, which xcodegen fills from Config/*.xcconfig via $(VAR) build-setting expansion.
import Foundation

nonisolated struct AppConfig: Sendable {
    enum Env: String, Sendable { case local, staging, prod }

    enum ConfigError: Error, CustomStringConvertible, Equatable {
        case missing(String)
        case malformed(String, String)

        var description: String {
            switch self {
            case .missing(let k): "Info.plist is missing \(k). Check Config/*.xcconfig and run `make gen`."
            case .malformed(let k, let v): "Info.plist key \(k) has malformed value \(v)."
            }
        }
    }

    let env: Env
    let supabaseURL: URL
    let supabaseAnonKey: String
    let apiBase: URL
    /// "1.0.0 (42)"
    let build: String
    /// Share links always point at prod web.
    static let webBase = URL(string: "https://downto.xyz")!

    init(bundle: Bundle = .main) throws {
        try self.init(info: { bundle.object(forInfoDictionaryKey: $0) })
    }

    /// Testable seam: `AppConfigTests` passes a dictionary lookup with keys removed.
    init(info: (String) -> Any?) throws {
        func str(_ k: String) throws -> String {
            guard let v = info(k) as? String, !v.isEmpty else { throw ConfigError.missing(k) }
            return v
        }
        func url(_ k: String) throws -> URL {
            let s = try str(k)
            guard let u = URL(string: s), u.scheme != nil, u.host != nil else { throw ConfigError.malformed(k, s) }
            return u
        }
        let e = try str("APP_ENV")
        guard let env = Env(rawValue: e) else { throw ConfigError.malformed("APP_ENV", e) }
        self.env = env
        supabaseURL = try url("SUPABASE_URL")
        supabaseAnonKey = try str("SUPABASE_ANON_KEY")
        apiBase = try url("API_BASE_URL")
        build = "\(try str("CFBundleShortVersionString")) (\(try str("CFBundleVersion")))"
    }
}
