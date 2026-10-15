// Data/RPC.swift — typed wrappers over every RPC the client calls (INVENTORY §2, ARCHITECTURE §3.6).
// Each body is two lines; return shapes are the ones the LATEST migration declares (see Payloads.swift).
// Errors are thrown raw (PostgrestError etc.); stores wrap them in AppError.
import Foundation
import Supabase

nonisolated struct RPC: Sendable {
    let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    // MARK: Checks

    /// get_check_state(p_check_id) → TABLE(active, is_mine). An empty result is treated as "gone, not mine".
    func getCheckState(_ id: CheckID) async throws -> CheckState {
        let rows: [CheckState] = try await client.rpc("get_check_state", params: ["p_check_id": id.raw]).execute().value
        return rows.first ?? CheckState(active: false, isMine: false)
    }

    /// archive_interest_check(p_check_id) → VOID (also archives the linked squad, 20260602000001).
    func archiveCheck(_ id: CheckID) async throws {
        try await client.rpc("archive_interest_check", params: ["p_check_id": id.raw]).execute()
    }

    /// revive_interest_check(p_check_id) → VOID.
    func reviveCheck(_ id: CheckID) async throws {
        try await client.rpc("revive_interest_check", params: ["p_check_id": id.raw]).execute()
    }

    /// get_fof_check_annotations() → (check_id, via_friend_name) for FoF-only checks.
    func fofAnnotations() async throws -> [CheckID: String] {
        let rows: [FoFAnnotation] = try await client.rpc("get_fof_check_annotations").execute().value
        return Dictionary(rows.map { ($0.checkId, $0.viaFriendName) }, uniquingKeysWith: { _, new in new })
    }

    /// get_shared_check(p_check_id) — SECURITY DEFINER, callable by anon; nil when not shared / archived.
    func sharedCheck(_ id: CheckID) async throws -> SharedCheck? {
        let rows: [SharedCheck] = try await client.rpc("get_shared_check", params: ["p_check_id": id.raw]).execute().value
        return rows.first
    }

    /// get_shared_check_author(p_check_id) → SETOF profiles.
    func sharedCheckAuthor(_ id: CheckID) async throws -> Profile? {
        let rows: [Profile] = try await client.rpc("get_shared_check_author", params: ["p_check_id": id.raw]).execute().value
        return rows.first
    }

    // MARK: Squads

    /// join_squad_if_room(p_squad_id) → `{status: 'joined' | 'waitlisted'}`.
    func joinSquadIfRoom(_ id: SquadID) async throws -> JoinResult {
        let envelope: JoinResultEnvelope = try await client.rpc("join_squad_if_room", params: ["p_squad_id": id.raw]).execute().value
        return envelope.status
    }

    /// leave_squad(p_squad_id) → VOID (writes `left_checks`, promotes the next waitlisted).
    func leaveSquad(_ id: SquadID) async throws {
        try await client.rpc("leave_squad", params: ["p_squad_id": id.raw]).execute()
    }

    /// reactivate_squad(p_squad_id) → squads row (discarded; the store refetches).
    func reactivateSquad(_ id: SquadID) async throws {
        try await client.rpc("reactivate_squad", params: ["p_squad_id": id.raw]).execute()
    }

    /// get_event_squad_members(p_event_id) → (user_id, squad_id, squad_name). M2.
    func eventSquadMembers(_ id: EventID) async throws -> [EventSquadMember] {
        try await client.rpc("get_event_squad_members", params: ["p_event_id": id.raw]).execute().value
    }

    /// get_unread_squad_ids(p_user_id) → TABLE(squad_id).
    func unreadSquadIds(userId: UserID) async throws -> Set<SquadID> {
        let rows: [UnreadSquadRow] = try await client.rpc("get_unread_squad_ids", params: ["p_user_id": userId.raw]).execute().value
        return Set(rows.map(\.squadId))
    }

    // MARK: Events

    /// get_friends_events() → jsonb array of `to_jsonb(events) || {creator}` rows (friends + FoF), snake_case.
    func friendsEvents() async throws -> [FriendsEventPayload] {
        try await client.rpc("get_friends_events").execute().value
    }

    // MARK: Friends

    /// get_friends_of_friends() → (suggested_user_id, mutual_friend_id, mutual_friend_name).
    func friendsOfFriends() async throws -> [FoFSuggestion] {
        try await client.rpc("get_friends_of_friends").execute().value
    }

    /// create_friend_link() → UUID token (24 h, one use).
    func createFriendLink() async throws -> UUID {
        try await client.rpc("create_friend_link").execute().value
    }

    /// redeem_friend_link(p_token) → JSONB (see RedeemResult.outcome).
    func redeemFriendLink(_ token: UUID) async throws -> RedeemResult {
        try await client.rpc("redeem_friend_link", params: ["p_token": token]).execute().value
    }
}
