// Data/LocalCache.swift — snapshot JSON to Application Support (ARCHITECTURE §4.6). NOT offline-first: snapshots only
// paint the first frame (tagged stale) until the live hydrate lands. Envelope `{schema, userId, savedAt, payload}`;
// wiped on logout, on a schema bump, and when `userId` mismatches.
import Foundation
import os

actor LocalCache {
    static let schema = 1
    static let folderName = "DowntoCache"

    nonisolated struct Envelope<Payload: Codable & Sendable>: Codable, Sendable {
        let schema: Int
        let userId: UserID
        let savedAt: Date
        let payload: Payload
    }

    nonisolated struct Snapshot<Payload: Sendable>: Sendable {
        let payload: Payload
        let savedAt: Date
    }

    nonisolated let directory: URL
    private let log = Logger(subsystem: "xyz.downto.app", category: "cache")

    /// Default: `Application Support/DowntoCache`. Tests pass a temp directory.
    init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else {
            let support = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
                ?? FileManager.default.temporaryDirectory
            self.directory = support.appending(path: Self.folderName, directoryHint: .isDirectory)
        }
    }

    /// Atomic write of `{schema, userId, savedAt, payload}` to `{name}.json`.
    func save<Payload: Codable & Sendable>(_ payload: Payload, name: String, userId: UserID, now: Date = .now) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let envelope = Envelope(schema: Self.schema, userId: userId, savedAt: now, payload: payload)
        // camelCase coders: the file is private, and a snake_case key strategy would mangle the UUID dictionary keys of the raw stores.
        let data = try JSON.camelEncoder.encode(envelope)
        try data.write(to: fileURL(name), options: .atomic)
        // Keep snapshots out of iCloud/iTunes backups — they are a cache, rebuilt on the next hydrate.
        var url = fileURL(name)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    /// nil when missing, unreadable, from another schema or another user. A corrupt or foreign file is deleted.
    func load<Payload: Codable & Sendable>(_: Payload.Type = Payload.self, name: String, userId: UserID) -> Snapshot<Payload>? {
        let url = fileURL(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        do {
            let envelope = try JSON.camelDecoder.decode(Envelope<Payload>.self, from: data)
            guard envelope.schema == Self.schema, envelope.userId == userId else {
                log.notice("dropping snapshot \(name, privacy: .public): schema/user mismatch")
                remove(name: name)
                return nil
            }
            return Snapshot(payload: envelope.payload, savedAt: envelope.savedAt)
        } catch {
            log.error("corrupt snapshot \(name, privacy: .public): \(String(describing: error), privacy: .public)")
            remove(name: name)
            return nil
        }
    }

    func remove(name: String) {
        try? FileManager.default.removeItem(at: fileURL(name))
    }

    /// Deletes every snapshot (logout, schema bump).
    func wipe() {
        try? FileManager.default.removeItem(at: directory)
    }

    nonisolated func fileURL(_ name: String) -> URL {
        directory.appending(path: "\(name).json", directoryHint: .notDirectory)
    }
}
