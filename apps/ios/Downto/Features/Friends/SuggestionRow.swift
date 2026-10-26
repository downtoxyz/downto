// Features/Friends/SuggestionRow.swift — PEOPLE YOU MAY KNOW row: `PersonRow`'s state pill plus the "via Sara" annotation (DESIGN §7.12 block 4).
import SwiftUI

struct SuggestionRow: View {
    let suggestion: SuggestionDisplay
    @Environment(AppEnvironment.self) private var env
    @State private var busy = false

    var body: some View {
        HStack(spacing: 12) {
            AvatarLetter(presence: .person(suggestion.person), size: .medium)
            VStack(alignment: .leading, spacing: 2) {
                Text(suggestion.person.displayName).dtFont(.headline).foregroundStyle(Color.ink).lineLimit(1)
                HStack(spacing: 6) {
                    if !suggestion.person.username.isEmpty { Text("@\(suggestion.person.username)").dtFont(.meta).foregroundStyle(.inkMuted) }
                    Text("via \(suggestion.mutualFriendName)").dtFont(.meta).foregroundStyle(.inkMuted)
                }
            }
            Spacer(minLength: 8)
            switch env.friends.relationship(with: suggestion.person.id) {
            case .outgoing: Text("REQUESTED").dtFont(.button).foregroundStyle(.inkMuted)
            case .friends: Text("FRIENDS ✓").dtFont(.button).foregroundStyle(.inkMuted)
            case .incoming(let f): DTButton(title: "ACCEPT", variant: .primary, disabled: busy) { busy = true; Task { await env.friends.accept(f); busy = false } }
            default: DTButton(title: "ADD", variant: .text, disabled: busy) { busy = true; Task { await env.friends.request(suggestion.person.id); busy = false } }
            }
        }
        .frame(minHeight: 56)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
        .contentShape(Rectangle())
        .onTapGesture { env.router.present(.userProfile(suggestion.person.id)) }
    }
}
