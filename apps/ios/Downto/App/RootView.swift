// App/RootView.swift — switches on resolveGate(...) and drives the boot sequence (ARCHITECTURE §4.4.1, §6.1, §7.3).
import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var drained = false

    static func gateInput(_ env: AppEnvironment) -> GateInput {
        _ = env.profile.gateNudge
        return GateInput(
            session: env.session.state,
            me: env.profile.gateProfile,
            meLoaded: env.profile.meLoaded,
            feedLoaded: env.feed.phase.isSettled,
            feedHasChecks: env.feed.hasChecks,
            preGateDone: env.preGateDone,
            seenNotifPrompt: Defaults.seenNotifPrompt,
            hasSharedCheck: Defaults.pendingCheckId != nil || Defaults.activeSharedCheckId != nil || env.profile.me?.referredByCheckId != nil,
            justOnboardedThisSession: env.profile.justOnboardedThisSession,
            skippedFirstCheck: Defaults.skippedFirstCheck
        )
    }

    static func currentGate(_ env: AppEnvironment) -> Gate { resolveGate(gateInput(env)) }

    private var gate: Gate { Self.currentGate(env) }

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            screen
                .id(gate)
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
        .animation(.smooth(duration: 0.35), value: gate)
        .task { env.session.start(); env.reachability.start() }
        .onChange(of: env.session.state, initial: true) { _, state in
            switch state {
            case .signedIn(let id): Task { await env.loadMeForGate(userId: id) }
            case .signedOut: if env.bootedForUser != nil || env.profile.me != nil { env.teardownOnLogout() }
            case .booting: break
            }
        }
        .onChange(of: gate, initial: true) { _, g in advance(g) }
    }

    /// The §4.4.1 ladder: pre-gate as soon as the profile has a name; boot once the gate has passed setup; drain once on .main.
    private func advance(_ g: Gate) {
        guard case .signedIn(let id) = env.session.state else { return }
        if env.profile.meLoaded, let me = env.profile.me, !me.displayName.isEmpty { env.runPreGate() }
        switch g {
        case .enableNotifications, .friendGate, .firstCheck, .main:
            if env.preGateDone { env.bootAfterLogin(userId: id) }
        case .booting:
            // A not-onboarded user holds .booting until preGateDone && feedLoaded — kick the boot once the pre-gate is done.
            if env.preGateDone, env.profile.me.map({ !$0.displayName.isEmpty }) == true { env.bootAfterLogin(userId: id) }
        default: break
        }
        if g == .main, !drained, env.feed.phase.isSettled {
            drained = true
            env.router.drainPending(env: env)
            Task { await env.router.drainPendingIntents(env: env) }
        }
    }

    @ViewBuilder private var screen: some View {
        switch gate {
        case .booting: BootView()
        case .auth: AuthView()
        case .profileSetup: ProfileSetupView()
        case .enableNotifications: EnableNotificationsView()
        case .friendGate: FriendGateView()
        case .firstCheck: FirstCheckView()
        case .main: MainShell().onChange(of: env.feed.phase.isSettled, initial: true) { _, _ in advance(gate) }
        }
    }
}

/// `.booting` — nothing but paper and the wordmark; never a spinner on day one.
struct BootView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("down to").dtFont(.masthead).foregroundStyle(Color.ink)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color.paper)
        .dtGrain()
    }
}
