// Stores/LoadPhase.swift — the one load-state enum every store publishes (ARCHITECTURE §4.2, §4.9).
import Foundation

nonisolated enum LoadPhase: Equatable, Sendable {
    case idle
    case loading
    case loaded(at: Date, stale: Bool)
    case failed(AppError, hadSnapshot: Bool)

    /// `.loaded` or `.failed` — the gate's `feedLoaded` (a failed feed must not trap the user in `.booting`).
    var isSettled: Bool {
        switch self {
        case .loaded, .failed: true
        case .idle, .loading: false
        }
    }
    var isLoading: Bool { self == .loading }
    var isStale: Bool { if case .loaded(_, let stale) = self { stale } else { false } }
    var loadedAt: Date? { if case .loaded(let at, _) = self { at } else { nil } }
    var error: AppError? { if case .failed(let e, _) = self { e } else { nil } }
    var hadSnapshot: Bool { if case .failed(_, let had) = self { had } else { false } }
}
