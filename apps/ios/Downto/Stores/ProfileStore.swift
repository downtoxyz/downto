// Stores/ProfileStore.swift — `me` (ARCHITECTURE §4.2, §6.1). The profiles row is created by the DB's handle_new_user
// trigger on signup, so setup is an UPDATE; a nil `loadMe()` for a valid session is the sweep case.
import Foundation
import Observation
import Supabase
import os

nonisolated struct ProfilePatch: Hashable, Sendable {
    var displayName: String?
    var username: String?
    var igHandle: String??
    var availability: Availability??
    var onboarded: Bool?
    var timezone: String?

    init(displayName: String? = nil, username: String? = nil, igHandle: String?? = nil, availability: Availability?? = nil, onboarded: Bool? = nil, timezone: String? = nil) {
        self.displayName = displayName
        self.username = username
        self.igHandle = igHandle
        self.availability = availability
        self.onboarded = onboarded
        self.timezone = timezone
    }

    var json: [String: AnyJSON] {
        var o: [String: AnyJSON] = [:]
        if let displayName { o["display_name"] = .string(displayName) }
        if let username { o["username"] = .string(username) }
        if let igHandle { o["ig_handle"] = igHandle.map(AnyJSON.string) ?? .null }
        if let availability { o["availability"] = availability.map { .string($0.rawValue) } ?? .null }
        if let onboarded { o["onboarded"] = .bool(onboarded) }
        if let timezone { o["timezone"] = .string(timezone) }
        return o
    }
}

@Observable final class ProfileStore {
    private(set) var me: Profile?
    private(set) var meLoaded = false
    private(set) var archived: [InterestCheck] = []
    /// In-memory only: FirstCheck is a one-shot (§6.1).
    private(set) var justOnboardedThisSession = false
    /// Bumped when a UserDefaults-backed gate input changes (SwiftUI does not observe UserDefaults) so RootView re-resolves.
    var gateNudge = 0

    private let client: SupabaseClient
    private let rpc: RPC
    private let isFake: Bool
    private let log = Logger(subsystem: "xyz.downto.app", category: "profile")
    private var userId: UserID?

    init(client: SupabaseClient, rpc: RPC, isFake: Bool = false) {
        self.client = client
        self.rpc = rpc
        self.isFake = isFake
    }

    var gateProfile: GateProfile? {
        me.map { GateProfile(onboarded: $0.onboarded, displayName: $0.displayName, referredByCheckId: $0.referredByCheckId) }
    }

    func bind(userId: UserID) { self.userId = userId }

    /// Step A of the boot (§4.4.1). nil → sweep case. Network failure leaves `me` as it was (a cold launch with a cached
    /// profile must not look like the sweep), but still flips `meLoaded` so the gate can proceed on the last known profile.
    @discardableResult
    func loadMe() async -> Profile? {
        guard !isFake else { meLoaded = true; return me }
        guard let userId else { return nil }
        do {
            let rows: [Profile] = try await client.from("profiles").select().eq("id", value: userId).limit(1).execute().value
            me = rows.first
            meLoaded = true
            return me
        } catch {
            log.error("loadMe: \(String(describing: error), privacy: .public)")
            if me != nil { meLoaded = true }
            return me
        }
    }

    /// Profile setup. 23505 on username → AppError.usernameTaken.
    func saveSetup(displayName: String, username: String, igHandle: String?) async throws {
        let ig = igHandle?.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "^@", with: "", options: .regularExpression)
        try await update(ProfilePatch(displayName: displayName.trimmingCharacters(in: .whitespaces), username: username,
                                      igHandle: .some((ig?.isEmpty ?? true) ? nil : ig)))
    }

    /// Live "that one's taken" check for the setup form (§7.2). Errors read as available; the save is the real guard.
    func isUsernameAvailable(_ username: String) async -> Bool {
        guard !isFake, let userId else { return true }
        do {
            let rows: [Profile] = try await client.from("profiles").select("id,username,display_name,avatar_letter,onboarded,is_test,theme_enabled,created_at,updated_at")
                .eq("username", value: username).neq("id", value: userId).limit(1).execute().value
            return rows.isEmpty
        } catch { return true }
    }

    func update(_ patch: ProfilePatch) async throws {
        guard let userId else { throw AppError.unauthenticated }
        if isFake {
            if var m = me {
                if let d = patch.displayName { m.displayName = d }
                if let u = patch.username { m.username = u }
                if let o = patch.onboarded { m.onboarded = o }
                if let a = patch.availability { m.availability = a }
                if let i = patch.igHandle { m.igHandle = i }
                me = m
            }
            return
        }
        do {
            let rows: [Profile] = try await client.from("profiles").update(patch.json).eq("id", value: userId).select().execute().value
            if let row = rows.first { me = row }
        } catch {
            var e = AppError(error)
            if case .usernameCooldown = e, let changed = me?.usernameChangedAt {
                e = .usernameCooldown(until: changed.addingTimeInterval(14 * 86_400))
            }
            throw e
        }
    }

    func syncTimezoneIfNeeded() async {
        guard let me, me.timezone != TimeZone.current.identifier else { return }
        try? await update(ProfilePatch(timezone: TimeZone.current.identifier))
    }

    func setOnboarded() async {
        justOnboardedThisSession = true
        try? await update(ProfilePatch(onboarded: true))
    }

    func loadArchived() async {
        guard !isFake, let userId else { return }
        do {
            archived = try await client.from("interest_checks").select().eq("author_id", value: userId)
                .not("archived_at", operator: .is, value: "null").order("archived_at", ascending: false).execute().value
        } catch { log.error("loadArchived: \(String(describing: error), privacy: .public)") }
    }

    func restore(_ id: CheckID) async throws {
        try await rpc.reviveCheck(id)
        archived.removeAll { $0.id == id }
    }

    /// is_test only: back to the top of onboarding.
    func resetOnboarding() async {
        guard me?.isTest == true else { return }
        try? await update(ProfilePatch(displayName: "", onboarded: false))
        justOnboardedThisSession = false
    }

    func reset() {
        me = nil
        meLoaded = false
        archived = []
        justOnboardedThisSession = false
        userId = nil
    }

    /// Fake worlds.
    func setFake(me profile: Profile) { me = profile; meLoaded = true; userId = profile.id }
}
