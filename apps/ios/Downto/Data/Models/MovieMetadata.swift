// Data/Models/MovieMetadata.swift — the `movie_metadata` JSONB shared by interest_checks and events (ARCHITECTURE §3.2).
// Shape from src/lib/types.ts: { title, year?, director?, thumbnail?, vibes? }.
import Foundation

nonisolated struct MovieMetadata: Codable, Hashable, Sendable {
    let title: String
    let year: String?
    let director: String?
    let thumbnail: String?
    let vibes: [String]?

    init(title: String, year: String? = nil, director: String? = nil, thumbnail: String? = nil, vibes: [String]? = nil) {
        self.title = title
        self.year = year
        self.director = director
        self.thumbnail = thumbnail
        self.vibes = vibes
    }
}
