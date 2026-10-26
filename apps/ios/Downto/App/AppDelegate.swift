// App/AppDelegate.swift — APNs callbacks + UNUserNotificationCenterDelegate (ARCHITECTURE §8.2).
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Set by DowntoApp right after the environment is built.
    var env: AppEnvironment?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        env?.push.didRegister(token: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        env?.push.didFailToRegister(error)
    }

    /// Foreground suppression rules (§8.2).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let info = notification.request.content.userInfo
        let type = info["type"] as? String ?? ""
        let related = (info["relatedId"] as? String)?.lowercased()
        guard let env else { return [.banner, .sound, .list] }
        let squadTypes: Set<String> = ["squad_message", "squad_invite", "squad_mention", "squad_join_request", "poll_created", "date_confirm", "squad_date_nudge"]
        if squadTypes.contains(type), let open = env.router.openSquadId, related == open.description { return [] }
        if (type.hasPrefix("check_") || type.hasPrefix("friend_")), env.realtime.status == .connected { return [] }
        return [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let type = info["type"] as? String,
              let route = mapPushToRoute(type: type, relatedId: info["relatedId"] as? String) else { return }
        guard let env else { return }
        if env.bootedForUser != nil, env.profile.me?.onboarded == true {
            env.router.go(route, env: env, fromTap: true)
        } else {
            env.router.enqueue(route)
        }
    }
}
