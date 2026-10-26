// Stores/ToastCenter.swift — the slip queue (ARCHITECTURE §4.5, §5.3; look is DESIGN §4.8 / Slip.swift).
// One SlipItem on screen at a time; keyed slips that arrive within 5 s of another with the same key are dropped,
// which is how the optimistic DOWN path and the DB's squad_invite notification end up as ONE slip.
import Foundation
import Observation

@Observable final class ToastCenter {
    static let dedupeWindow: TimeInterval = 5

    private(set) var current: SlipItem?
    private var queue: [(item: SlipItem, action: ToastAction?)] = []
    private var actions: [UUID: ToastAction] = [:]
    private var lastKeyed: [String: Date] = [:]
    /// Set by AppEnvironment: what a slip's action button does (routes through Router).
    var perform: (ToastAction) -> Void = { _ in }
    var now: () -> Date = { .now }

    /// `key` dedupes; `action` adds the trailing button (title from `actionTitle`, default per action).
    func show(_ text: String, key: String? = nil, style: SlipStyle = .plain, action: ToastAction? = nil, actionTitle: String? = nil, countdown: Bool = false) {
        if let key {
            let t = now()
            if let last = lastKeyed[key], t.timeIntervalSince(last) < Self.dedupeWindow { return }
            lastKeyed[key] = t
        }
        let title = actionTitle ?? action.map(Self.defaultTitle)
        let item = SlipItem(text, action: title, style: style, countdown: countdown)
        if let action { actions[item.id] = action }
        if current == nil { current = item } else { queue.append((item, action)) }
    }

    func show(_ error: AppError) { show(error.toastCopy, style: .error) }

    /// Binding target for `SlipHost`.
    var binding: SlipItem? {
        get { current }
        set { if newValue == nil { advance() } else { current = newValue } }
    }

    func tapped(_ item: SlipItem) {
        if let a = actions.removeValue(forKey: item.id) { perform(a) }
        advance()
    }

    /// Removes a keyed slip that has not been shown yet (e.g. undo window closed).
    func dismiss(matching text: String) {
        if current?.text == text { advance() }
        queue.removeAll { $0.item.text == text }
    }

    private func advance() {
        if let c = current { actions[c.id] = nil }
        if queue.isEmpty { current = nil } else { current = queue.removeFirst().item }
    }

    func reset() { current = nil; queue.removeAll(); actions.removeAll(); lastKeyed.removeAll() }

    nonisolated static func defaultTitle(_ a: ToastAction) -> String {
        switch a {
        case .openSquad: "OPEN"
        case .undoArchive: "UNDO"
        case .openCheck: "OPEN"
        case .retry: "RETRY"
        }
    }
}
