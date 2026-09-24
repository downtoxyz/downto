// Domain/Presence.swift — Presence, PersonRef, GuestList (ARCHITECTURE §3.5, §9).
// A masked presence carries NO id and NO name — the view literally cannot render the real person.
import Foundation

/// Who a row is attributed to, after mystery redaction.
nonisolated enum Presence: Hashable, Sendable {
    case person(PersonRef)
    case masked(kaomoji: String, scramble: String)

    var kaomojiOrLetter: String {
        switch self {
        case .person(let p): p.avatarLetter
        case .masked(let k, _): k
        }
    }

    var label: String {
        switch self {
        case .person(let p): p.displayName
        case .masked(_, let s): s
        }
    }

    var isMasked: Bool {
        if case .masked = self { true } else { false }
    }

    var isMe: Bool {
        if case .person(let p) = self { p.isMe } else { false }
    }
}

nonisolated struct PersonRef: Hashable, Sendable {
    let id: UserID
    let displayName: String
    let username: String
    let avatarLetter: String
    let isMe: Bool

    init(id: UserID, displayName: String, username: String, avatarLetter: String, isMe: Bool) {
        self.id = id
        self.displayName = displayName
        self.username = username
        self.avatarLetter = avatarLetter
        self.isMe = isMe
    }
}

nonisolated enum GuestList: Hashable, Sendable {
    case revealed(downs: [PersonRef], waitlist: [PersonRef])
    /// "guests revealed on the day" — no count either (a count leaks).
    case hidden
    /// Synthetic shared-link card (§7.1): get_shared_check gives response_count, no list.
    case countOnly(Int)
}
