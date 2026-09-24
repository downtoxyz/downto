// Domain/Enums.swift — TolerantEnum + every DB CHECK-backed enum (ARCHITECTURE §3.2, §3.4).
//
// Every enum here mirrors the LATEST `CHECK (col IN (…))` constraint in supabase/migrations for its column;
// `scripts/check-enums.sh` diffs the two (the `// column:` comment above each enum is what the script reads).
// A value the server adds later decodes as `.unknown` instead of failing the whole row.
import Foundation

/// A String-backed enum whose decode never fails: unknown raw values map to `.unknown`.
nonisolated protocol TolerantEnum: RawRepresentable, Codable, Hashable, Sendable, CaseIterable where RawValue == String {
    static var unknown: Self { get }
}

extension TolerantEnum {
    nonisolated init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.unknown
    }

    nonisolated func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

// column: profiles.availability
nonisolated enum Availability: String, TolerantEnum {
    case open, awkward, notAvailable = "not-available", unknown
}

// column: check_responses.response  (20260316000001 — 'maybe'/'nah' were removed)
nonisolated enum ResponseKind: String, TolerantEnum {
    case down, waitlist, unknown
}

// column: check_co_authors.status
nonisolated enum CoAuthorStatus: String, TolerantEnum {
    case pending, accepted, declined, unknown
}

// column: events.visibility
nonisolated enum EventVisibility: String, TolerantEnum {
    case `public`, friends, unknown
}

// column: squads.date_status
nonisolated enum DateStatus: String, TolerantEnum {
    case proposed, locked, unknown
}

// column: squad_members.role  (no CHECK constraint in the schema; values come from join_squad_if_room / triggers)
nonisolated enum SquadRole: String, TolerantEnum {
    case member, waitlist, unknown
}

// column: messages.message_type  (no CHECK constraint in the schema; values written by the API routes)
nonisolated enum MessageType: String, TolerantEnum {
    case text, poll, dateConfirm = "date_confirm", unknown
}

// column: squad_polls.status
nonisolated enum PollStatus: String, TolerantEnum {
    case active, closed, unknown
}

// column: squad_polls.poll_type
nonisolated enum PollType: String, TolerantEnum {
    case text, dates, availability, when, unknown
}

// column: squad_polls.collection_style
nonisolated enum CollectionStyle: String, TolerantEnum {
    case preference, availability, unknown
}

// column: squad_date_confirms.response
nonisolated enum ConfirmResponse: String, TolerantEnum {
    case yes, no, unknown
}

// column: squad_join_requests.status
nonisolated enum JoinRequestStatus: String, TolerantEnum {
    case pending, accepted, declined, unknown
}

// column: friendships.status
nonisolated enum FriendshipStatus: String, TolerantEnum {
    case pending, accepted, blocked, unknown
}

// column: notifications.type
nonisolated enum NotificationType: String, TolerantEnum {
    case friendRequest = "friend_request"
    case friendAccepted = "friend_accepted"
    case checkResponse = "check_response"
    case squadMessage = "squad_message"
    case squadInvite = "squad_invite"
    case friendCheck = "friend_check"
    case dateConfirm = "date_confirm"
    case checkTag = "check_tag"
    case checkComment = "check_comment"
    case pollCreated = "poll_created"
    case squadJoinRequest = "squad_join_request"
    case squadMention = "squad_mention"
    case commentMention = "comment_mention"
    case friendEvent = "friend_event"
    case eventReminder = "event_reminder"
    case eventDown = "event_down"
    case checkDateUpdated = "check_date_updated"
    case checkTextUpdated = "check_text_updated"
    case eventDateUpdated = "event_date_updated"
    case checkArchived = "check_archived"
    case checkRevived = "check_revived"
    case squadDateNudge = "squad_date_nudge"
    case unknown
}

// Report enums are strict (the client only ever WRITES them; a bad value must fail loudly, not become `.unknown`).

// column: reported_content.target_type
nonisolated enum ReportTarget: String, Codable, Hashable, Sendable, CaseIterable {
    case profile, check, squadMessage = "squad_message", eventComment = "event_comment", checkComment = "check_comment"
}

// column: reported_content.reason
nonisolated enum ReportReason: String, Codable, Hashable, Sendable, CaseIterable {
    case harassment, spam, impersonation, inappropriate, threats, other
}
