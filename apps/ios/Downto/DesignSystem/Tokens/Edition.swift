// DesignSystem/Tokens/Edition.swift — the two editions (web: src/lib/themes). guava = the cream/magenta default; dragonfruit =
// dark warm-gray paper, magenta rules, lime accent, Instrument Serif + Space Mono. Colour tokens resolve through `Edition.current`
// (Color+DT.swift) and faces through `DTTextStyle.descriptor` (Typography.swift); RootView re-ids the tree on change.
import Foundation
import Observation

nonisolated enum Edition: String, CaseIterable, Sendable, Codable {
    case guava, dragonfruit

    static let defaultsKey = "dt.edition"

    /// Process-wide current edition. Read on every token/face resolution; written only by `EditionStore`.
    nonisolated(unsafe) static var current: Edition = {
        UserDefaults.standard.string(forKey: defaultsKey).flatMap(Edition.init(rawValue:)) ?? .guava
    }()

    var isDark: Bool { self == .dragonfruit }
    var label: String { rawValue }
}

@Observable final class EditionStore {
    private(set) var current: Edition = Edition.current

    func set(_ e: Edition) {
        guard e != current else { return }
        Edition.current = e
        UserDefaults.standard.set(e.rawValue, forKey: Edition.defaultsKey)
        current = e
    }
}
