// Data/ImageCache.swift — actor over URLCache for hero + chat images (ARCHITECTURE §2, §4.6).
// Memory 50 MB / disk 200 MB. Chat images live in the private `squad-chat-images` bucket and are fetched through
// signed URLs (1 h); the signed URL is cached for 55 min per path so a scrolling transcript does not re-sign.
import Foundation
import Supabase

actor ImageCache {
    static let chatBucket = "squad-chat-images"
    static let signedURLTTL = 3600
    /// Re-sign a little before the server-side expiry.
    static let signedURLReuse: TimeInterval = 55 * 60

    private let session: URLSession
    private let storage: SupabaseStorageClient?
    private var signed: [String: (url: URL, expires: Date)] = [:]
    private var inflight: [URL: Task<Data, any Error>] = [:]

    init(storage: SupabaseStorageClient?, memoryMB: Int = 50, diskMB: Int = 200) {
        self.storage = storage
        let cache = URLCache(memoryCapacity: memoryMB * 1_048_576, diskCapacity: diskMB * 1_048_576, diskPath: "DowntoImages")
        let config = URLSessionConfiguration.default
        config.urlCache = cache
        config.requestCachePolicy = .returnCacheDataElseLoad
        config.timeoutIntervalForRequest = 20
        self.session = URLSession(configuration: config)
    }

    /// Bytes for any public image URL (event hero, movie thumbnail). Coalesces concurrent requests for the same URL.
    func data(for url: URL) async throws -> Data {
        if let task = inflight[url] { return try await task.value }
        let session = self.session
        let task = Task<Data, any Error> {
            let (data, response) = try await session.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw AppError.api(status: http.statusCode, message: "image \(http.statusCode)")
            }
            return data
        }
        inflight[url] = task
        defer { inflight[url] = nil }
        return try await task.value
    }

    /// Signed URL for a `squad-chat-images` path (`{squad_id}/{uuid}.{ext}`), cached until shortly before it expires.
    func chatImageURL(path: String, now: Date = .now) async throws -> URL {
        if let hit = signed[path], hit.expires > now { return hit.url }
        guard let storage else { throw AppError.unknown("no storage client") }
        let url = try await storage.from(Self.chatBucket).createSignedURL(path: path, expiresIn: Self.signedURLTTL)
        signed[path] = (url, now.addingTimeInterval(Self.signedURLReuse))
        return url
    }

    /// Bytes for a chat image: sign (cached) then fetch (cached).
    func chatImageData(path: String) async throws -> Data {
        try await data(for: chatImageURL(path: path))
    }

    /// Uploads a resized chat image to `{squadId}/{uuid}.jpg` and returns the storage path for `messages.image_path`.
    func uploadChatImage(_ resized: ImageResizer.Resized, squadId: SquadID) async throws -> String {
        guard let storage else { throw AppError.unknown("no storage client") }
        let path = "\(squadId)/\(UUID().uuidString.lowercased()).jpg"
        _ = try await storage.from(Self.chatBucket).upload(path, data: resized.data, options: FileOptions(contentType: "image/jpeg"))
        return path
    }

    func clear() {
        signed.removeAll()
        session.configuration.urlCache?.removeAllCachedResponses()
    }
}
