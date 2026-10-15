import Foundation
import CoreGraphics
import ImageIO
import Testing
@testable import Downto

@Suite("LocalCache")
struct LocalCacheTests {
    static let me = UserID("11111111-1111-4111-8111-111111111111")!
    static let other = UserID("22222222-2222-4222-8222-222222222222")!

    nonisolated struct Snapshotish: Codable, Equatable, Sendable {
        var checks: [CheckID: InterestCheck]
        var savedAt: Date
    }

    func tempCache() -> LocalCache {
        LocalCache(directory: FileManager.default.temporaryDirectory.appending(path: "LocalCacheTests-\(UUID().uuidString)"))
    }

    @Test func roundTripsAnIDKeyedSnapshot() async throws {
        let cache = tempCache()
        let checks: [InterestCheck] = try FixtureLoader.rows("interest_checks")
        let raw = Snapshotish(checks: Dictionary(uniqueKeysWithValues: checks.map { ($0.id, $0) }), savedAt: PostgresTimestamp.parse("2026-05-01T18:04:11.123Z")!)
        let now = Date(timeIntervalSince1970: 1_777_659_851)
        try await cache.save(raw, name: "feed", userId: Self.me, now: now)
        let back = try #require(await cache.load(Snapshotish.self, name: "feed", userId: Self.me))
        #expect(back.payload == raw)
        #expect(back.savedAt == now)
        // ID-keyed dictionaries must be objects on disk (ARCHITECTURE §3.9 / DECISIONS #36).
        let text = try String(contentsOf: cache.fileURL("feed"), encoding: .utf8)
        #expect(text.contains("\"checks\":{"))
        #expect(text.contains("\"schema\":1"))
        await cache.wipe()
    }

    @Test func rejectsAnotherUsersSnapshotAndDeletesIt() async throws {
        let cache = tempCache()
        try await cache.save(["a"], name: "notifications", userId: Self.me)
        #expect(await cache.load([String].self, name: "notifications", userId: Self.other) == nil)
        #expect(!FileManager.default.fileExists(atPath: cache.fileURL("notifications").path))
        await cache.wipe()
    }

    @Test func corruptFileIsDroppedNotThrown() async throws {
        let cache = tempCache()
        try FileManager.default.createDirectory(at: cache.directory, withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: cache.fileURL("squads"))
        #expect(await cache.load([String].self, name: "squads", userId: Self.me) == nil)
        #expect(!FileManager.default.fileExists(atPath: cache.fileURL("squads").path))
        await cache.wipe()
    }

    @Test func wipeRemovesEverything() async throws {
        let cache = tempCache()
        try await cache.save(1, name: "a", userId: Self.me)
        try await cache.save(2, name: "b", userId: Self.me)
        await cache.wipe()
        #expect(await cache.load(Int.self, name: "a", userId: Self.me) == nil)
        #expect(!FileManager.default.fileExists(atPath: cache.directory.path))
    }
}

@Suite("ImageResizer")
struct ImageResizerTests {
    static func png(width: Int, height: Int) throws -> Data {
        let ctx = try #require(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.setFillColor(CGColor(red: 1, green: 0.27, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try #require(ctx.makeImage())
        let out = NSMutableData()
        let dest = try #require(CGImageDestinationCreateWithData(out, "public.png" as CFString, 1, nil))
        CGImageDestinationAddImage(dest, image, nil)
        #expect(CGImageDestinationFinalize(dest))
        return out as Data
    }

    @Test func downscalesTheLongestEdgeTo1600() throws {
        let resized = try ImageResizer.resizeForChat(try Self.png(width: 3000, height: 2000))
        #expect(resized.width == 1600)
        #expect(resized.height == 1067)
        #expect(resized.data.count > 0)
        #expect(resized.data.prefix(2) == Data([0xFF, 0xD8]), "JPEG magic bytes")
    }

    @Test func neverUpscales() throws {
        let resized = try ImageResizer.resizeForChat(try Self.png(width: 400, height: 300))
        #expect(resized.width == 400 && resized.height == 300)
    }

    @Test func garbageIsUndecodable() {
        #expect(throws: ImageResizer.ResizeError.undecodable) {
            _ = try ImageResizer.resizeForChat(Data("nope".utf8))
        }
    }

    @Test func runsOffTheMainActor() async throws {
        let png = try Self.png(width: 2000, height: 2000)
        let size = try await Task.detached { try ImageResizer.resizeForChat(png).width }.value
        #expect(size == 1600)
    }
}
