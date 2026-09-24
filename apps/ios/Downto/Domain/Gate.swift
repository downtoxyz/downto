// Domain/Gate.swift — resolveGate + GateInput + GateProfile (ARCHITECTURE §6.1). Pure: RootView switches on the result.
// Web parity: src/features/auth/hooks/useOnboarding.tsx gate order (INVENTORY §4).
import Foundation

nonisolated enum Gate: Hashable, Sendable {
    case booting, auth, profileSetup, enableNotifications, friendGate, firstCheck, main
}

/// Domain-side slice of Profile (Domain never imports Data/Models — §1.0). ProfileStore exposes `me?.gateProfile`.
nonisolated struct GateProfile: Hashable, Sendable {
    var onboarded: Bool
    var displayName: String
    var referredByCheckId: CheckID?

    init(onboarded: Bool, displayName: String, referredByCheckId: CheckID? = nil) {
        self.onboarded = onboarded
        self.displayName = displayName
        self.referredByCheckId = referredByCheckId
    }
}

nonisolated struct GateInput: Hashable, Sendable {
    var session: SessionState
    /// nil while loading, or after the abandoned-onboarding sweep deleted the row.
    var me: GateProfile?
    var meLoaded: Bool
    /// feed.phase is .loaded or .failed (a failed feed must not trap the user in .booting).
    var feedLoaded: Bool
    /// feed.hasChecks — real or synthetic (§4.2).
    var feedHasChecks: Bool
    /// §7.1 sequence (redeem token → respond-shared) finished; false until then.
    var preGateDone: Bool
    /// dt.seenNotifPrompt
    var seenNotifPrompt: Bool
    /// dt.pendingCheckId != nil || dt.activeSharedCheckId != nil || me.referredByCheckId != nil
    var hasSharedCheck: Bool
    var justOnboardedThisSession: Bool
    /// dt.skippedFirstCheck
    var skippedFirstCheck: Bool

    init(session: SessionState, me: GateProfile?, meLoaded: Bool, feedLoaded: Bool, feedHasChecks: Bool, preGateDone: Bool,
         seenNotifPrompt: Bool, hasSharedCheck: Bool, justOnboardedThisSession: Bool, skippedFirstCheck: Bool) {
        self.session = session
        self.me = me
        self.meLoaded = meLoaded
        self.feedLoaded = feedLoaded
        self.feedHasChecks = feedHasChecks
        self.preGateDone = preGateDone
        self.seenNotifPrompt = seenNotifPrompt
        self.hasSharedCheck = hasSharedCheck
        self.justOnboardedThisSession = justOnboardedThisSession
        self.skippedFirstCheck = skippedFirstCheck
    }
}

nonisolated func resolveGate(_ i: GateInput) -> Gate {
    switch i.session {
    case .booting: return .booting
    case .signedOut: return .auth
    case .signedIn:
        guard i.meLoaded else { return .booting }
        guard let me = i.me else { return .auth }                                    // abandoned-onboarding sweep → treated as signed out
        if !me.onboarded && me.displayName.isEmpty { return .profileSetup }
        if !me.onboarded && !i.seenNotifPrompt && !i.hasSharedCheck { return .enableNotifications }   // shared-check arrivals skip the push ask (web parity)
        if !me.onboarded { return (i.preGateDone && i.feedLoaded) ? .friendGate : .booting }          // friend gate waits for redeem/respond-shared + feed
        // First-check screen only for a brand-new user with an EMPTY feed and no shared check — web handleFriendGateDone.
        if i.justOnboardedThisSession && !i.skippedFirstCheck && !i.hasSharedCheck && !i.feedHasChecks { return .firstCheck }
        return .main
    }
}
