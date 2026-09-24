// DowntoTests/Domain/GateTests.swift — the full resolveGate matrix (ARCHITECTURE §6.1) incl. the sweep case and the shared-check branch.
import Foundation
import Testing
@testable import Downto

@Suite("Gate")
struct GateTests {
    static let me = UserID(DomainTestSupport.uuid(1))
    static let check = CheckID(DomainTestSupport.uuid(9))

    /// A signed-in, fully loaded, onboarded user with an empty feed — every test tweaks from here.
    static func input(
        session: SessionState = .signedIn(me),
        me: GateProfile? = GateProfile(onboarded: true, displayName: "kat"),
        meLoaded: Bool = true,
        feedLoaded: Bool = true,
        feedHasChecks: Bool = false,
        preGateDone: Bool = true,
        seenNotifPrompt: Bool = false,
        hasSharedCheck: Bool = false,
        justOnboardedThisSession: Bool = false,
        skippedFirstCheck: Bool = false
    ) -> GateInput {
        GateInput(session: session, me: me, meLoaded: meLoaded, feedLoaded: feedLoaded, feedHasChecks: feedHasChecks, preGateDone: preGateDone,
                  seenNotifPrompt: seenNotifPrompt, hasSharedCheck: hasSharedCheck, justOnboardedThisSession: justOnboardedThisSession, skippedFirstCheck: skippedFirstCheck)
    }

    static let fresh = GateProfile(onboarded: false, displayName: "")
    static let named = GateProfile(onboarded: false, displayName: "kat")

    // MARK: session

    @Test func bootingSessionIsBooting() {
        #expect(resolveGate(Self.input(session: .booting)) == .booting)
        #expect(resolveGate(Self.input(session: .booting, me: nil, meLoaded: false)) == .booting)
    }

    @Test func signedOutIsAuth() {
        #expect(resolveGate(Self.input(session: .signedOut)) == .auth)
        #expect(resolveGate(Self.input(session: .signedOut, me: nil, meLoaded: false, feedLoaded: false)) == .auth)
    }

    @Test func signedInWaitsForTheProfileRow() {
        #expect(resolveGate(Self.input(me: nil, meLoaded: false)) == .booting)
        #expect(resolveGate(Self.input(me: Self.named, meLoaded: false)) == .booting)
    }

    @Test func abandonedOnboardingSweepIsTreatedAsSignedOut() {
        // profiles.me() returned nil for a valid session: the daily cron deleted the un-onboarded account.
        #expect(resolveGate(Self.input(me: nil, meLoaded: true)) == .auth)
    }

    // MARK: onboarding steps

    @Test func emptyDisplayNameIsProfileSetup() {
        #expect(resolveGate(Self.input(me: Self.fresh)) == .profileSetup)
        // …regardless of everything else.
        #expect(resolveGate(Self.input(me: Self.fresh, feedLoaded: false, preGateDone: false, seenNotifPrompt: true, hasSharedCheck: true)) == .profileSetup)
        // An onboarded user with an empty name (legacy row) is NOT sent back to setup.
        #expect(resolveGate(Self.input(me: GateProfile(onboarded: true, displayName: ""))) == .main)
    }

    @Test func namedButNotOnboardedAsksForNotificationsFirst() {
        #expect(resolveGate(Self.input(me: Self.named, seenNotifPrompt: false)) == .enableNotifications)
        // Even while the pre-gate / feed are still loading — the prompt comes first.
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: false, preGateDone: false, seenNotifPrompt: false)) == .enableNotifications)
    }

    @Test func friendGateWaitsForPreGateAndFeed() {
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: false, preGateDone: false, seenNotifPrompt: true)) == .booting)
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: true, preGateDone: false, seenNotifPrompt: true)) == .booting)
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: false, preGateDone: true, seenNotifPrompt: true)) == .booting)
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: true, preGateDone: true, seenNotifPrompt: true)) == .friendGate)
    }

    @Test func aFailedFeedStillCountsAsLoaded() {
        // GateInput.feedLoaded is true for .loaded OR .failed — the caller maps the phase; the gate must not distinguish.
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: true, preGateDone: true, seenNotifPrompt: true)) == .friendGate)
    }

    // MARK: shared-check branch (§7.1)

    @Test func sharedCheckArrivalsSkipTheNotificationPrompt() {
        #expect(resolveGate(Self.input(me: Self.named, seenNotifPrompt: false, hasSharedCheck: true)) == .friendGate)
        #expect(resolveGate(Self.input(me: Self.named, feedLoaded: false, seenNotifPrompt: false, hasSharedCheck: true)) == .booting)
        #expect(resolveGate(Self.input(me: Self.named, preGateDone: false, seenNotifPrompt: false, hasSharedCheck: true)) == .booting)
    }

    @Test func sharedCheckBlocksFirstCheck() {
        #expect(resolveGate(Self.input(feedHasChecks: false, hasSharedCheck: true, justOnboardedThisSession: true)) == .main)
    }

    @Test func returningUserWithAPendingLinkNeverWaitsOnThePreGate() {
        // onboarded: true + dt.pendingCheckId set → .main regardless of preGateDone (§7.1 guard; the link is drained in §7.4).
        #expect(resolveGate(Self.input(me: GateProfile(onboarded: true, displayName: "kat"), preGateDone: false, hasSharedCheck: true)) == .main)
        #expect(resolveGate(Self.input(me: GateProfile(onboarded: true, displayName: "kat"), feedLoaded: false, preGateDone: false, hasSharedCheck: true)) == .main)
    }

    @Test func preGateDoneFalseHoldsBootingOnlyWhenNotOnboarded() {
        #expect(resolveGate(Self.input(me: Self.named, preGateDone: false, seenNotifPrompt: true)) == .booting)
        #expect(resolveGate(Self.input(me: GateProfile(onboarded: true, displayName: "kat"), preGateDone: false)) == .main)
    }

    @Test func hasSharedCheckRecoveredFromReferredByCheckId() {
        // The caller derives hasSharedCheck from dt.pendingCheckId || dt.activeSharedCheckId || me.referredByCheckId; the profile
        // slice carries the id so that derivation is possible after a reinstall with empty defaults.
        let p = GateProfile(onboarded: false, displayName: "kat", referredByCheckId: Self.check)
        #expect(p.referredByCheckId == Self.check)
        #expect(resolveGate(Self.input(me: p, seenNotifPrompt: false, hasSharedCheck: p.referredByCheckId != nil)) == .friendGate)
    }

    // MARK: first check

    @Test func brandNewUserWithEmptyFeedSeesFirstCheck() {
        #expect(resolveGate(Self.input(feedHasChecks: false, justOnboardedThisSession: true)) == .firstCheck)
    }

    @Test func feedWithChecksSkipsFirstCheck() {
        #expect(resolveGate(Self.input(feedHasChecks: true, justOnboardedThisSession: true)) == .main)
    }

    @Test func skippedFirstCheckFallsThroughToMain() {
        #expect(resolveGate(Self.input(feedHasChecks: false, justOnboardedThisSession: true, skippedFirstCheck: true)) == .main)
    }

    @Test func firstCheckIsOneShot() {
        // A relaunch after Continue: justOnboardedThisSession is in-memory only → .main.
        #expect(resolveGate(Self.input(feedHasChecks: false, justOnboardedThisSession: false)) == .main)
    }

    @Test func onboardedUserIsMainWhateverTheFlags() {
        for seen in [true, false] {
            for feed in [true, false] {
                for pre in [true, false] {
                    #expect(resolveGate(Self.input(feedLoaded: feed, preGateDone: pre, seenNotifPrompt: seen)) == .main)
                }
            }
        }
    }
}
