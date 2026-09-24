// App/DowntoApp.swift — @main. Builds AppConfig (loud crash on a misconfigured build, ARCHITECTURE §1.2).
// AppEnvironment / Router / MainShell / AppDelegate are added by later work; this file only owns the entry point.
import SwiftUI

@main
struct DowntoApp: App {
    let config: AppConfig

    init() {
        do {
            config = try AppConfig()
        } catch {
            fatalError("\(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
