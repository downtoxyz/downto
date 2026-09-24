// Domain/Censor.swift — exact port of src/lib/censor.ts (ARCHITECTURE §9.2).
//
// Same hash, same pools in the same order, same index math, so iOS and web show identical scrambles for the same seed.
// `CensorGoldenTests` pins the values against numbers computed with node from censor.ts.
import Foundation

nonisolated enum Censor {
    /// 29 entries, identical order to censor.ts `WINGDINGS_POOL`.
    static let wingdingsPool: [String] = [
        "✦", "✧", "✪", "✰", "✩", "✫", "✬", "✭", "✮",
        "❀", "✿", "❉", "❊", "✤", "✣",
        "◈", "◉", "◇", "◆", "◊",
        "▓", "▒",
        "✱", "✲", "✳", "✴", "✵",
        "★", "☆",
    ]

    /// 20 entries, identical order to censor.ts `KAOMOJI_POOL`.
    /// DESIGN §2.2: the web's `( ˙꒳​˙ )` carries a literal U+200B between `꒳` and `˙`; every pool entry has U+200B / U+200C / U+FEFF
    /// stripped here so width measurement and `minimumScaleFactor` behave. Indices are unchanged, so seeds still agree with the web —
    /// only that one entry differs from the TS string, by the invisible scalar.
    static let kaomojiPool: [String] = [
        "(•‿•)",
        "(◕‿◕)",
        "(´◡`)",
        "(◔‿◔)",
        "(¬‿¬)",
        "(⌐■_■)",
        "(°o°)",
        "(⊙_⊙)",
        "(•_•)",
        "(˘ω˘)",
        "(◠‿◠)",
        "(◕ᴗ◕)",
        "(•ᴗ•)",
        "(=^･^=)",
        "(◡‿◡✿)",
        "(っ˘ω˘ς)",
        "(◍•ᴗ•◍)",
        "( ˙꒳​˙ )",
        "(︶ω︶)",
        "(¯ ͜ʖ ¯)",
    ].map(Censor.stripInvisibles)

    /// Removes U+200B (zero-width space), U+200C (zero-width non-joiner) and U+FEFF (BOM / zero-width no-break space).
    static func stripInvisibles(_ s: String) -> String {
        String(String.UnicodeScalarView(s.unicodeScalars.filter { $0.value != 0x200B && $0.value != 0x200C && $0.value != 0xFEFF }))
    }

    /// djb2 over UTF-16 code units, wrapping at 32 bits — matches JS `charCodeAt` + `>>> 0`.
    static func hashSeed(_ s: String) -> UInt32 {
        var h: UInt32 = 5381
        for u in s.utf16 { h = (h &<< 5) &+ h &+ UInt32(u) }
        return h
    }

    /// Deterministic, fixed-length symbol scramble. Length is intentionally NOT the real name length (that would leak).
    /// JS computes `(h + i * 2654435761) % 29` in doubles (exact below 2^53); UInt64 reproduces that — UInt32 wrapping would not.
    static func wingdings(seed: String, length: Int = 6) -> String {
        let h = UInt64(hashSeed(seed))
        let n = UInt64(wingdingsPool.count)
        var out = ""
        for i in 0..<max(0, length) {
            out += wingdingsPool[Int((h + UInt64(i) * 2_654_435_761) % n)]
        }
        return out
    }

    /// Single deterministic symbol — avatar slots and other one-glyph spots.
    static func glyph(seed: String) -> String {
        wingdingsPool[Int(hashSeed(seed) % UInt32(wingdingsPool.count))]
    }

    /// Deterministic kaomoji for a seed (e.g. `check.id`).
    static func kaomoji(seed: String) -> String {
        kaomojiPool[Int(hashSeed(seed) % UInt32(kaomojiPool.count))]
    }

    /// Same user keeps the same kaomoji throughout one thread; a different thread gives a different one so identity doesn't leak
    /// across mystery checks. `threadSeed` is `check.id` for comments, `squad.id` for squad chat / member lists.
    static func kaomojiForUser(threadSeed: String, userId: UserID) -> String {
        kaomoji(seed: "\(threadSeed)::\(userId.description)")   // `description` is the lowercase uuid, as Postgres/JS render it
    }

    /// Unique kaomoji per user in a fixed-order roster (avoids birthday-paradox collisions). Each user's preferred kaomoji is
    /// taken first; if it is already used, walk forward through the pool to the next unused one. Deterministic for the same
    /// `userIds` order. Past 20 users the walk gives up and the unscoped preferred kaomoji may duplicate (web parity).
    static func kaomojiAssignment(threadSeed: String, userIds: [UserID]) -> [UserID: String] {
        var used = Set<String>()
        var out: [UserID: String] = [:]
        let pool = kaomojiPool
        for uid in userIds {
            let preferred = kaomojiForUser(threadSeed: threadSeed, userId: uid)
            if !used.contains(preferred) {
                used.insert(preferred)
                out[uid] = preferred
                continue
            }
            if used.count >= pool.count {
                out[uid] = preferred
                continue
            }
            let startIdx = pool.firstIndex(of: preferred) ?? 0
            for step in 1..<pool.count {
                let candidate = pool[(startIdx + step) % pool.count]
                if !used.contains(candidate) {
                    used.insert(candidate)
                    out[uid] = candidate
                    break
                }
            }
        }
        return out
    }

    /// Replace `@username` mentions with `@???` for pre-reveal renders (JS `/@\S+/g`).
    static func stripAtMentions(_ text: String) -> String {
        text.replacing(/@\S+/, with: "@???")
    }
}
