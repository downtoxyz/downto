// Features/Feed/FeedModels.swift — FeedCheck / FeedEvent → the DesignSystem entry models (DESIGN §4.1, §4.3, §4.5 state tables).
// The store's display models carry the facts; this is the one place they become tints, toggles and lines.
import Foundation
import SwiftUI

nonisolated enum FeedModels {
    static let mentionRegex = try! NSRegularExpression(pattern: #"@([a-z0-9_]{1,30})"#, options: [.caseInsensitive])

    static func mentions(in text: String) -> Set<String> {
        let ns = text as NSString
        return Set(mentionRegex.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)).lowercased() })
    }

    static func entryExpiry(_ e: ExpiryState) -> EntryExpiry? {
        switch e {
        case .open: return nil
        case .expired: return EntryExpiry(elapsedFraction: 1, label: "expired")
        case .remaining(let h, let m, let p):
            let label = h > 0 ? "\(h)h left" : "\(max(1, m))m left"
            return EntryExpiry(elapsedFraction: min(1, max(0, p / 100)), label: label)
        }
    }

    static func toggle(for c: FeedCheck, pending: Bool) -> DownToggleState {
        if c.expiry.isExpired { return .closed }
        if pending { return .pending(target: c.myResponse == .down ? .down : .idle) }
        switch c.myResponse {
        case .down: return .active
        case .waitlist: return .waitlisted(position: c.waitlistPosition ?? 1)
        default: return .idle
        }
    }

    static func tint(for c: FeedCheck) -> CheckEntryModel.Tint {
        if c.myResponse == .down { return .down }
        if c.myResponse == .waitlist { return .waitlisted(position: c.waitlistPosition ?? 1) }
        if c.isMine { return .mine }
        if c.isNew { return .new }
        return .idle
    }

    static func checkModel(_ c: FeedCheck, pending: Bool = false, squadUnread: Bool = false, highlighted: Bool = false, isTopOfTimed: Bool = false, isHidden: Bool? = nil, revealing: Bool = false) -> CheckEntryModel {
        var m = CheckEntryModel(id: c.id.description, author: c.author, text: c.text)
        if revealing, c.mystery == .revealedToday {
            m.revealCue = .init(kaomoji: Censor.kaomoji(seed: c.id.description), scramble: Censor.wingdings(seed: c.id.description), guests: c.downs.count)
        }
        m.isMine = c.isMine
        m.viaFriendName = c.via
        m.expiry = entryExpiry(c.expiry)
        m.mentions = c.mystery == .unrevealed ? [] : mentions(in: c.text)
        m.whenWhere = c.whenWhereParts
        m.responders = c.downs.map(Presence.person)
        m.responseCount = c.downCount ?? 0
        m.tint = tint(for: c)
        m.isNew = c.isNew
        m.isExpired = c.expiry.isExpired
        m.isHidden = isHidden ?? c.isHidden
        m.isMystery = c.mystery == .unrevealed
        if c.isMine, c.mystery != .none { m.ownMaskKaomoji = Censor.kaomoji(seed: c.id.description) }
        m.isHighlighted = highlighted
        m.toggle = toggle(for: c, pending: pending)
        if c.mySquad != nil { m.squadLink = .init(hasUnread: squadUnread) }
        m.coAuthorPending = c.isCoAuthorPending
        m.comments = c.comments.prefix(2).map { .init(author: $0.sender, text: String($0.text.characters)) }
        m.moreCommentsCount = max(0, c.comments.count - 2)
        m.letterboxdURL = c.letterboxdUrl
        m.isTopOfTimed = isTopOfTimed
        if case .countOnly(let n) = c.guests { m.responseCount = n }
        return m
    }

    static func eventModel(_ e: FeedEvent, me: UserID?, pending: Bool = false, highlighted: Bool = false, today: LocalDate) -> EventEntryModel {
        var m = EventEntryModel(id: e.id.description, poster: .person(e.poster), title: e.title)
        m.isMine = e.poster.isMe
        m.dateLine = [e.dateDisplay, e.timeDisplay, e.venue].compactMap { $0 }.filter { !$0.isEmpty }.map { $0.lowercased() }
        m.vibes = e.vibes
        m.responders = e.downs.map(Presence.person)
        let past = e.date.map { $0 < today } ?? false
        m.state = past ? .past : e.myIsDown ? .down : e.poster.isMe ? .mine : .idle
        m.isHighlighted = highlighted
        m.toggle = past ? .closed : pending ? .pending(target: e.myIsDown ? .down : .idle) : (e.myIsDown ? .active : .idle)
        if let d = e.date, d == today { m.isImminent = true; m.imminentText = ["tonight", e.timeDisplay?.lowercased()].compactMap { $0 }.joined(separator: " · ") }
        return m
    }
}
