// App/Reachability.swift — NWPathMonitor debounced 1.5 s (ARCHITECTURE §4.9 offline band).
import Foundation
import Network
import Observation

@Observable final class Reachability {
    private(set) var isOffline = false
    private let monitor = NWPathMonitor()
    private var debounce: Task<Void, Never>?
    static let debounceSeconds: Double = 1.5

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let offline = path.status != .satisfied
            Task { @MainActor in self?.update(offline) }
        }
        monitor.start(queue: DispatchQueue(label: "xyz.downto.reachability"))
    }

    func stop() { monitor.cancel(); debounce?.cancel() }

    private func update(_ offline: Bool) {
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.debounceSeconds))
            guard !Task.isCancelled else { return }
            self?.isOffline = offline
        }
    }

    /// Fake worlds.
    func setFake(offline: Bool) { isOffline = offline }
}
