// Features/Friends/FriendRow.swift — the FRIENDS-tab row (DESIGN §7.12): avatar medium, name, @username, trailing availability glyph.
// (The ADD-tab / gate rows with the state pill are the shared `PersonRow` in Features/Auth/FriendGateView.swift.)
import SwiftUI

extension Availability {
    /// The status emoji — the one place emoji survive (DESIGN §7.10).
    var glyph: String? {
        switch self {
        case .open: "✨"
        case .awkward: "👀"
        case .notAvailable: "🌙"
        case .unknown: nil
        }
    }
    var word: String {
        switch self {
        case .open: "open"
        case .awkward: "awkward"
        case .notAvailable: "not available"
        case .unknown: ""
        }
    }
}

struct FriendRow: View {
    let person: PersonRef
    var availability: Availability? = nil
    var via: String? = nil
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                AvatarLetter(presence: .person(person), size: .medium)
                VStack(alignment: .leading, spacing: 2) {
                    Text(person.displayName).dtFont(.headline).foregroundStyle(Color.ink).lineLimit(1)
                    HStack(spacing: 6) {
                        if !person.username.isEmpty { Text("@\(person.username)").dtFont(.meta).foregroundStyle(.inkMuted) }
                        if let via { Text("via \(via)").dtFont(.meta).foregroundStyle(.inkMuted) }
                    }
                }
                Spacer(minLength: 8)
                if let a = availability, let g = a.glyph {
                    Text(g).font(.system(size: 14)).accessibilityLabel(a.word)
                }
            }
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(DTPressStyle())
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
        .accessibilityLabel("\(person.displayName), @\(person.username)\(availability?.word.isEmpty == false ? ", \(availability!.word)" : "")")
    }
}
