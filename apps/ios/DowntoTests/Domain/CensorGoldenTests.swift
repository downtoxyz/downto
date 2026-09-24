// DowntoTests/Domain/CensorGoldenTests.swift — the §9.2 golden table + assignment + stripAtMentions + hashSeed over a non-BMP string.
//
// Goldens computed with node 24 from src/lib/censor.ts on 2026-09-23. To regenerate, from the repo root:
//   cp src/lib/censor.ts /tmp/censor.mts && cd /tmp && node --input-type=module -e '
//     import { censorWingdings, censorGlyph, censorKaomoji, kaomojiForUser, kaomojiAssignmentForUsers, stripAtMentions } from "./censor.mts";
//     const hashSeed = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
//     for (const s of ["a1b2c3d4-0000-4000-8000-000000000001","a1b2c3d4-0000-4000-8000-000000000002","3f2504e0-4f89-11d3-9a0c-0305e82c3301","hello","über::naïve","","🎉 party"])
//       console.log(s, hashSeed(s), censorWingdings(s), censorWingdings(s, 12), censorGlyph(s), censorKaomoji(s));
//     const T = "3f2504e0-4f89-11d3-9a0c-0305e82c3301", U = ["a1b2c3d4-0000-4000-8000-000000000001","a1b2c3d4-0000-4000-8000-000000000002","a1b2c3d4-0000-4000-8000-000000000003"];
//     console.log(kaomojiForUser(T, U[0]), [...kaomojiAssignmentForUsers(T, U)], [...kaomojiAssignmentForUsers("hello", ["u1","u2","u3","u4","u5","u6","u7","u8"])]);
//     console.log(stripAtMentions("hey @kat and @sam_1 down?"));'
// (Node ≥ 23.6 strips the TS types itself.) One golden differs from the TS by design: the "hello" kaomoji is `( ˙꒳˙ )` without the
// U+200B the TS string carries — DESIGN §2.2 strips U+200B/U+200C/U+FEFF from the pool; indices are unaffected.
import Foundation
import Testing
@testable import Downto

@Suite("Censor goldens")
struct CensorGoldenTests {
    nonisolated struct Golden {
        let seed: String, hash: UInt32, wingdings: String, w12: String, glyph: String, kaomoji: String
    }

    nonisolated static let table: [Golden] = [
        Golden(seed: "a1b2c3d4-0000-4000-8000-000000000001", hash: 3_109_329_050, wingdings: "✰▒✿☆◇✬", w12: "✰▒✿☆◇✬✳✤✪▓❀★", glyph: "✰", kaomoji: "(◠‿◠)"),
        Golden(seed: "a1b2c3d4-0000-4000-8000-000000000002", hash: 3_109_329_051, wingdings: "✩✱❉✦◆✭", w12: "✩✱❉✦◆✭✴✣✰▒✿☆", glyph: "✩", kaomoji: "(◕ᴗ◕)"),
        Golden(seed: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", hash: 2_111_062_628, wingdings: "✧◊✮✵◈✩", w12: "✧◊✮✵◈✩✱❉✦◆✭✴", glyph: "✧", kaomoji: "(•_•)"),
        Golden(seed: "hello", hash: 261_238_937, wingdings: "✬✳✤✪▓❀", w12: "✬✳✤✪▓❀★◉✫✲❊✧", glyph: "✬", kaomoji: "( ˙꒳˙ )"),
        Golden(seed: "über::naïve", hash: 3_911_048_391, wingdings: "◆✭✴✣✰▒", w12: "◆✭✴✣✰▒✿☆◇✬✳✤", glyph: "◆", kaomoji: "(◕ᴗ◕)"),
        Golden(seed: "", hash: 5381, wingdings: "◉✫✲❊✧◊", w12: "◉✫✲❊✧◊✮✵◈✩✱❉", glyph: "◉", kaomoji: "(◕‿◕)"),
        Golden(seed: "🎉 party", hash: 3_864_828_602, wingdings: "✲❊✧◊✮✵", w12: "✲❊✧◊✮✵◈✩✱❉✦◆", glyph: "✲", kaomoji: "(´◡`)"),   // 🎉 is two UTF-16 units
        Golden(seed: "a", hash: 177_670, wingdings: "◉✫✲❊✧◊", w12: "◉✫✲❊✧◊✮✵◈✩✱❉", glyph: "◉", kaomoji: "(◠‿◠)"),
        Golden(seed: "the quick brown fox jumps over the lazy dog", hash: 2_012_963_070, wingdings: "◊✮✵◈✩✱", w12: "◊✮✵◈✩✱❉✦◆✭✴✣", glyph: "◊", kaomoji: "(◠‿◠)"),
    ]

    @Test("hashSeed matches djb2 over UTF-16 code units with >>> 0", arguments: table.map { ($0.seed, $0.hash) })
    func hash(_ seed: String, _ expected: UInt32) {
        #expect(Censor.hashSeed(seed) == expected)
    }

    @Test("wingdings / glyph / kaomoji match the web for the same seed", arguments: table.indices)
    func scramble(_ i: Int) {
        let g = Self.table[i]
        #expect(Censor.wingdings(seed: g.seed) == g.wingdings)
        #expect(Censor.wingdings(seed: g.seed, length: 12) == g.w12)
        #expect(Censor.glyph(seed: g.seed) == g.glyph)
        #expect(Censor.kaomoji(seed: g.seed) == g.kaomoji)
        #expect(Censor.wingdings(seed: g.seed).count == 6)
    }

    @Test("non-BMP seed hashes over two UTF-16 units, not one scalar")
    func nonBMP() {
        // "🎉".utf16 == [0xD83C, 0xDF89]; hashing scalars (one 0x1F389 unit) would give a different number.
        #expect("🎉".utf16.count == 2)
        #expect(Censor.hashSeed("🎉 party") == 3_864_828_602)
        var scalarHash: UInt32 = 5381
        for u in "🎉 party".unicodeScalars { scalarHash = (scalarHash &<< 5) &+ scalarHash &+ UInt32(u.value) }
        #expect(scalarHash != 3_864_828_602)
    }

    @Test("wingdings index math runs in 64 bits (h + i * 2654435761 exceeds UInt32 for every i ≥ 1)")
    func sixtyFourBitIndex() {
        // With UInt32 wrapping arithmetic the 2nd glyph of "a1b2…0001" would come out differently; the golden pins the double math.
        #expect(Censor.wingdings(seed: "a1b2c3d4-0000-4000-8000-000000000001").dropFirst().first == "▒")
        #expect(Censor.wingdings(seed: "x", length: 0) == "")
        #expect(Censor.wingdings(seed: "x", length: -3) == "")
    }

    @Test("pools are the web's, in order, with invisibles stripped")
    func pools() {
        #expect(Censor.wingdingsPool.count == 29)
        #expect(Censor.kaomojiPool.count == 20)
        #expect(Censor.wingdingsPool.first == "✦" && Censor.wingdingsPool.last == "☆")
        #expect(Censor.kaomojiPool.first == "(•‿•)" && Censor.kaomojiPool.last == "(¯ ͜ʖ ¯)")
        for k in Censor.kaomojiPool {
            #expect(!k.unicodeScalars.contains { $0.value == 0x200B || $0.value == 0x200C || $0.value == 0xFEFF }, Comment(rawValue: k))
        }
        #expect(Censor.kaomojiPool[17] == "( ˙꒳˙ )")
        #expect(Censor.stripInvisibles("( ˙꒳\u{200B}˙ )") == "( ˙꒳˙ )")
        #expect(Censor.stripInvisibles("\u{FEFF}a\u{200C}b") == "ab")
    }

    // MARK: kaomojiForUser / kaomojiAssignment

    static let thread = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    static let u1 = UserID(DomainTestSupport.uuid(1)), u2 = UserID(DomainTestSupport.uuid(2)), u3 = UserID(DomainTestSupport.uuid(3))

    @Test("kaomojiForUser seeds with the lowercase uuid")
    func forUser() {
        #expect(Censor.kaomojiForUser(threadSeed: Self.thread, userId: Self.u1) == "(◕‿◕)")
        // Same as hashing the "{thread}::{lowercase uuid}" string directly — and NOT the uppercase form Foundation prints by default.
        #expect(Censor.kaomoji(seed: "\(Self.thread)::a1b2c3d4-0000-4000-8000-000000000001") == "(◕‿◕)")
        #expect(Self.u1.description == "a1b2c3d4-0000-4000-8000-000000000001")
    }

    @Test("kaomojiAssignment keeps every preferred kaomoji when none collide (the §9.2 trio)")
    func assignment() {
        // node: kaomojiForUser for …0001/…0002/…0003 under this thread is (◕‿◕) / (´◡`) / (◔‿◔) — all distinct, so the
        // assignment equals the preferences. (ARCHITECTURE §9.2's aside that 0002 "collides and walks forward" is not what
        // censor.ts computes; the golden values themselves are right.)
        let a = Censor.kaomojiAssignment(threadSeed: Self.thread, userIds: [Self.u1, Self.u2, Self.u3])
        #expect(a == [Self.u1: "(◕‿◕)", Self.u2: "(´◡`)", Self.u3: "(◔‿◔)"])
        #expect(Censor.kaomojiForUser(threadSeed: Self.thread, userId: Self.u2) == "(´◡`)")
        #expect(Set(a.values).count == 3)
    }

    @Test("kaomojiAssignment walks forward on a real collision, in roster order")
    func assignmentCollision() {
        // node: …0018 prefers (◕‿◕) under this thread, the same as …0001. Whoever comes first in the roster keeps it; the other
        // walks one step forward in the pool to (´◡`).
        let u18 = UserID(DomainTestSupport.uuid(18))
        #expect(Censor.kaomojiForUser(threadSeed: Self.thread, userId: u18) == "(◕‿◕)")
        #expect(Censor.kaomojiAssignment(threadSeed: Self.thread, userIds: [Self.u1, u18]) == [Self.u1: "(◕‿◕)", u18: "(´◡`)"])
        #expect(Censor.kaomojiAssignment(threadSeed: Self.thread, userIds: [u18, Self.u1]) == [u18: "(◕‿◕)", Self.u1: "(´◡`)"])
    }

    @Test("kaomojiAssignment is stable for the same order and unique up to the pool size")
    func assignmentStableAndUnique() {
        let ids = (1...20).map { UserID(DomainTestSupport.uuid($0)) }
        let a = Censor.kaomojiAssignment(threadSeed: "hello", userIds: ids)
        let b = Censor.kaomojiAssignment(threadSeed: "hello", userIds: ids)
        #expect(a == b)
        #expect(Set(a.values).count == 20)
        // The 21st user falls back to the unscoped preferred kaomoji (duplicates allowed past the pool size).
        let extra = UserID(DomainTestSupport.uuid(21))
        let c = Censor.kaomojiAssignment(threadSeed: "hello", userIds: ids + [extra])
        #expect(c[extra] == Censor.kaomojiForUser(threadSeed: "hello", userId: extra))
        #expect(Censor.kaomojiAssignment(threadSeed: "hello", userIds: []).isEmpty)
    }

    @Test("stripAtMentions replaces every @token with @???")
    func strip() {
        #expect(Censor.stripAtMentions("hey @kat and @sam_1 down?") == "hey @??? and @??? down?")
        #expect(Censor.stripAtMentions("@kat\n@sam\ttail @") == "@???\n@???\ttail @")
        #expect(Censor.stripAtMentions("no mentions") == "no mentions")
        #expect(Censor.stripAtMentions("") == "")
    }
}
