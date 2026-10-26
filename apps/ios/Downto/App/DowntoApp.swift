// App/DowntoApp.swift — @main. Builds AppConfig (loud crash on a misconfigured build, ARCHITECTURE §1.2) and the AppEnvironment,
// drives ScenePhase, onOpenURL / universal links, and hands the APNs delegate its environment.
import SwiftUI

@main
struct DowntoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var env: AppEnvironment
    @State private var activeDebounce: Task<Void, Never>?

    init() {
        let config: AppConfig
        do { config = try AppConfig() } catch { fatalError("\(error)") }
        let e = FakeWorldBoot.environment(config: config) ?? AppEnvironment(config: config)
        _env = State(initialValue: e)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .onAppear { delegate.env = env }
                .onOpenURL { url in env.router.handle(url: url, env: env, gate: RootView.currentGate(env)) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { env.router.handle(url: url, env: env, gate: RootView.currentGate(env)) }
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        activeDebounce?.cancel()
                        activeDebounce = Task {
                            try? await Task.sleep(for: .seconds(1))
                            guard !Task.isCancelled, env.bootedForUser != nil else { return }
                            await env.becameActive()
                        }
                    case .background:
                        activeDebounce?.cancel()
                        guard env.bootedForUser != nil else { return }
                        Task { await env.becameInactive() }
                    default: break
                    }
                }
        }
    }
}
