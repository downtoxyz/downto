// Data/Supabase.swift — SupabaseClient factory, JSON coders, PostgresTimestamp strategy (ARCHITECTURE §3.1).
import Foundation
import Supabase

nonisolated enum JSON {
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom(PostgresTimestamp.decode)
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .custom(PostgresTimestamp.encode)   // ISO8601 with fractional seconds, "Z"
        return e
    }()

    /// Reserved for any RPC that returns camelCase JSON. As of 2026-09-23 NONE does: get_check_state is a TABLE (snake_case),
    /// get_friends_events is `to_jsonb(events)` (snake_case). INVENTORY's `{active, isMine}` is the web wrapper's camelised copy. See §3.9.
    static let camelDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom(PostgresTimestamp.decode)
        return d
    }()
}

/// Accepts every timestamptz shape Postgres / PostgREST / RPC JSON emit:
///   2026-09-23T18:04:11.123456+00:00 | 2026-09-23T18:04:11+00:00 | 2026-09-23T18:04:11.123Z | 2026-09-23 18:04:11.123456+00
nonisolated enum PostgresTimestamp {
    static func decode(_ decoder: any Decoder) throws -> Date {
        let c = try decoder.singleValueContainer()
        let s = try c.decode(String.self)
        guard let d = parse(s) else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unparseable Postgres timestamp \"\(s)\"")
        }
        return d
    }

    static func encode(_ date: Date, _ encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(format(date))
    }

    /// "2026-09-23T18:04:11.123Z"
    static func format(_ date: Date) -> String {
        Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date)
    }

    /// One regex-validated path for every form. (`Date.ISO8601FormatStyle.parse` was tried first in an earlier draft, but it
    /// silently rolls "25:99:99" over into the next day; a bad server value must surface as `dataCorrupted`, not a wrong Date.)
    static func parse(_ s: String) -> Date? {
        parseLoose(s)
    }

    // "T" or space separator, 0–9 fractional digits, offset "+00:00" / "+00" / "+0530" / "Z" / absent (= UTC).
    private static let loose = try! NSRegularExpression(
        pattern: #"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$"#,
        options: [.caseInsensitive]
    )

    private static func parseLoose(_ s: String) -> Date? {
        let ns = s as NSString
        guard let m = loose.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        func group(_ i: Int) -> String? {
            let r = m.range(at: i)
            return r.location == NSNotFound ? nil : ns.substring(with: r)
        }
        guard let y = group(1).flatMap(Int.init), let mo = group(2).flatMap(Int.init), let d = group(3).flatMap(Int.init),
              let h = group(4).flatMap(Int.init), let mi = group(5).flatMap(Int.init), let se = group(6).flatMap(Int.init),
              (1...12).contains(mo), (1...31).contains(d), (0...23).contains(h), (0...59).contains(mi), (0...59).contains(se)   // Calendar would silently roll 25:99:99 over
        else { return nil }

        var offsetSeconds = 0
        if let off = group(8), off.uppercased() != "Z" {
            let sign = off.hasPrefix("-") ? -1 : 1
            let digits = off.dropFirst().replacingOccurrences(of: ":", with: "")
            guard let hh = Int(digits.prefix(2)) else { return nil }
            let mm = digits.count >= 4 ? (Int(digits.dropFirst(2).prefix(2)) ?? 0) : 0
            offsetSeconds = sign * (hh * 3600 + mm * 60)
        }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: offsetSeconds) ?? .gmt
        var comps = DateComponents()
        comps.year = y; comps.month = mo; comps.day = d
        comps.hour = h; comps.minute = mi; comps.second = se
        guard let base = cal.date(from: comps) else { return nil }
        // Range guards cannot catch "2026-09-31" or "2026-02-29": Calendar.date(from:) silently rolls those into the next
        // month. Re-extract the fields and require an exact match, so a bad server value surfaces instead of shifting a day.
        let back = cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: base)
        guard back.year == y, back.month == mo, back.day == d, back.hour == h, back.minute == mi, back.second == se else { return nil }

        var fraction: TimeInterval = 0
        if let f = group(7) {
            // pad/truncate to 9 digits → nanoseconds
            let padded = f.padding(toLength: 9, withPad: "0", startingAt: 0)
            fraction = TimeInterval(Int(padded) ?? 0) / 1_000_000_000
        }
        return base.addingTimeInterval(fraction)
    }
}

/// The single SupabaseClient for the app (ARCHITECTURE §3.1). Built once by AppEnvironment.
func makeSupabaseClient(config: AppConfig) -> SupabaseClient {
    SupabaseClient(
        supabaseURL: config.supabaseURL,
        supabaseKey: config.supabaseAnonKey,
        options: .init(
            db: .init(encoder: JSON.encoder, decoder: JSON.decoder),
            // SupabaseClientOptions.AuthOptions at v2.55.2 (Sources/Supabase/Types.swift), EXACT labels, in declaration order:
            //   init(storage:, redirectToURL: = nil, storageKey: = nil, flowType: = .pkce, encoder: = …, decoder: = …, autoRefreshToken: = true)
            auth: .init(
                storage: KeychainLocalStorage(service: "xyz.downto.app", accessGroup: nil),   // already kSecAttrAccessibleAfterFirstUnlock (§6)
                flowType: .implicit,                 // matches web
                autoRefreshToken: true               // v2.55.2 label. On `main` this is `automaticallyRefreshesToken:` — the package is pinned (§1.1), do NOT "fix" this label
                // `emitsSessionEvents` is NOT a field and must not appear. `authStateChanges` always emits.
            ),
            global: .init(headers: ["x-client-info": "downto-ios/\(config.build)"]),
            realtime: .init(heartbeatInterval: 25, reconnectDelay: 2)
        )
    )
}
