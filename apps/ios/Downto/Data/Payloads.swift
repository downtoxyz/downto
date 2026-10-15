// Data/Payloads.swift — every RPC / API result and request shape that no table defines (ARCHITECTURE §3.9).
// All `nonisolated` (§1.0). Column lists were re-read from the migrations and the Next routes on 2026-09-23.
import Foundation

// MARK: - RPC results (JSON.decoder, snake_case)

/// get_shared_check(p_check_id) → RETURNS TABLE (20260319000004). Array of 0 or 1 rows.
nonisolated struct SharedCheck: Codable, Identifiable, Hashable, Sendable {
    let id: CheckID
    let text: String
    let authorId: UserID
    let authorName: String
    /// author_avatar CHAR(1)
    let authorAvatar: String
    let eventDate: LocalDate?
    let eventTime: String?
    let location: String?
    let expiresAt: Date?
    let createdAt: Date
    /// BIGINT
    let responseCount: Int
    /// NOT returned by the RPC today (§7.3 lists adding it as a web-repo deliverable). nil = unknown → the pre-login banner masks.
    let mystery: Bool?
}

/// get_check_state(p_check_id) → TABLE(active BOOLEAN, is_mine BOOLEAN) (20260425000003). snake_case — INVENTORY's `{active, isMine}` is the web wrapper's copy.
nonisolated struct CheckState: Codable, Hashable, Sendable {
    let active: Bool
    let isMine: Bool

    init(active: Bool, isMine: Bool) {
        self.active = active
        self.isMine = isMine
    }
}

/// join_squad_if_room(p_squad_id) → JSONB `{"status": "joined" | "waitlisted"}` (20260429000001 — it was TEXT before that migration).
nonisolated enum JoinResult: String, TolerantEnum {
    case joined, waitlisted, unknown
}

nonisolated struct JoinResultEnvelope: Codable, Hashable, Sendable {
    let status: JoinResult
}

/// redeem_friend_link(p_token) → JSONB: {"success":true,"creator_id":uuid,"creator_name":text} | {"error":text,"already_friends"?:true}
nonisolated struct RedeemResult: Codable, Hashable, Sendable {
    let success: Bool?
    let creatorId: UserID?
    let creatorName: String?
    let error: String?
    let alreadyFriends: Bool?

    enum Outcome: Hashable, Sendable {
        case friends(id: UserID, name: String)
        case alreadyFriends
        case invalid(String)
    }

    var outcome: Outcome {
        if success == true, let creatorId {
            return .friends(id: creatorId, name: creatorName ?? "")
        }
        if alreadyFriends == true { return .alreadyFriends }
        return .invalid(error ?? "Link not found")
    }
}

/// get_friends_of_friends() → TABLE(suggested_user_id, mutual_friend_id, mutual_friend_name) (20260325000005). Profiles fetched separately by id.
nonisolated struct FoFSuggestion: Codable, Hashable, Sendable {
    let suggestedUserId: UserID
    let mutualFriendId: UserID
    let mutualFriendName: String
}

/// get_fof_check_annotations() → TABLE(check_id, via_friend_name) (20260323000001).
nonisolated struct FoFAnnotation: Codable, Hashable, Sendable {
    let checkId: CheckID
    let viaFriendName: String
}

/// get_event_squad_members(p_event_id) → TABLE(user_id, squad_id, squad_name) (20260317000002). Waitlisted members are excluded server-side. M2.
nonisolated struct EventSquadMember: Codable, Hashable, Sendable {
    let userId: UserID
    let squadId: SquadID
    let squadName: String
}

/// get_unread_squad_ids(p_user_id) → TABLE(squad_id) (20260327000001).
nonisolated struct UnreadSquadRow: Codable, Hashable, Sendable {
    let squadId: SquadID
}

/// get_friends_events() → jsonb ARRAY of `to_jsonb(events) || {creator: {display_name, avatar_letter}}` (20260419000001).
/// Keys are the `events` columns in snake_case — decode with JSON.decoder, NOT camelDecoder. The only nested key is `creator`.
nonisolated struct FriendsEventPayload: Codable, Identifiable, Hashable, Sendable {
    let id: EventID
    let title: String
    let venue: String?
    let neighborhood: String?
    let date: LocalDate?
    let dateDisplay: String?
    let timeDisplay: String?
    let vibes: [String]?
    let note: String?
    let imageUrl: String?
    let igHandle: String?
    let igUrl: String?
    let diceUrl: String?
    let letterboxdUrl: String?
    let raUrl: String?
    let movieMetadata: MovieMetadata?
    let isPublic: Bool
    let visibility: EventVisibility
    let createdBy: UserID?
    let createdAt: Date
    let creator: Creator

    nonisolated struct Creator: Codable, Hashable, Sendable {
        let displayName: String?
        let avatarLetter: String?
    }
}

/// events-by-squad lite row: `events` select `id,title,date,date_display,time_display,venue` (SquadsRaw.events, §3.9).
nonisolated struct SquadEventLite: Codable, Identifiable, Hashable, Sendable {
    let id: EventID
    let title: String
    let date: LocalDate?
    let dateDisplay: String?
    let timeDisplay: String?
    let venue: String?
}

// MARK: - /api/* results and requests (DowntoAPI, camelCase JSON as the Next routes emit / accept)

/// Decodes any JSON object; used for routes that answer `{ ok: true }`.
nonisolated struct Empty: Codable, Hashable, Sendable {
    init() {}
}

/// POST /api/scrape → the Instagram / DICE / RA / Letterboxd parser result. `type` is "event" or "movie". M2; every field optional
/// because the four parsers emit different subsets.
nonisolated struct ScrapeResult: Codable, Hashable, Sendable {
    let type: String?
    let title: String?
    let venue: String?
    let neighborhood: String?
    let date: String?
    let time: String?
    let vibes: [String]?
    let note: String?
    let thumbnail: String?
    let imageUrl: String?
    let sourceUrl: String?
    let igHandle: String?
    let year: String?
    let director: String?
    let url: String?
}

/// POST /api/search-letterboxd → `{found: false}` | `{found: true, movie: {title, year, director, thumbnail, url}}`. M2.
nonisolated struct MovieHit: Codable, Hashable, Sendable {
    let title: String
    let year: String?
    let director: String?
    let thumbnail: String?
    let url: String?
}

nonisolated struct LetterboxdSearchResponse: Codable, Hashable, Sendable {
    let found: Bool
    let movie: MovieHit?
}

/// POST /api/squads/create-poll body (src/app/api/squads/create-poll/route.ts). M2.
nonisolated struct CreatePollRequest: Encodable, Hashable, Sendable {
    let squadId: SquadID
    let pollType: PollType
    let question: String?
    /// `text` polls: `.text` options; `dates` polls: `.date` options.
    let options: [PollOption]?
    let multiSelect: Bool?
    /// `when` polls.
    let slots: [PollSlot]?
    let collectionStyle: CollectionStyle?
    /// Legacy `availability` grid polls.
    let grid: PollGrid?

    init(squadId: SquadID, pollType: PollType, question: String? = nil, options: [PollOption]? = nil, multiSelect: Bool? = nil,
         slots: [PollSlot]? = nil, collectionStyle: CollectionStyle? = nil, grid: PollGrid? = nil) {
        self.squadId = squadId
        self.pollType = pollType
        self.question = question
        self.options = options
        self.multiSelect = multiSelect
        self.slots = slots
        self.collectionStyle = collectionStyle
        self.grid = grid
    }
}

/// One `when`-poll slot: `{date: YYYY-MM-DD, startMin: 0…1440 | null, endMin: 0…1440 | null}`.
nonisolated struct PollSlot: Codable, Hashable, Sendable {
    let date: LocalDate
    let startMin: Int?
    let endMin: Int?
}

nonisolated struct PollGrid: Codable, Hashable, Sendable {
    let dates: [LocalDate]
    let hourStart: Int
    let hourEnd: Int
    /// 30 or 60
    let slotMinutes: Int
}

nonisolated struct CreatePollResponse: Codable, Hashable, Sendable {
    let pollId: PollID
    let messageId: MessageID
}

/// POST /api/squads/extend → `{ ok, expiresAt }` (ISO string).
nonisolated struct ExtendSquadResponse: Codable, Hashable, Sendable {
    let expiresAt: Date
}

/// GET /api/version → `{ buildId }`.
nonisolated struct VersionResponse: Codable, Hashable, Sendable {
    let buildId: String?
}
