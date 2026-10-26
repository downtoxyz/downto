// Stores/PushStore.swift — APNs registration hardening + delivered-notification housekeeping (ARCHITECTURE §8, §8.1).
import Foundation
import Observation
import UIKit
import UserNotifications
import os

@Observable final class PushStore {
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    private(set) var deviceToken: String?

    unowned let env: AppEnvironment
    private let log = Logger(subsystem: "xyz.downto.app", category: "push")
    static let reregisterAfter: TimeInterval = 24 * 3600

    init(env: AppEnvironment) {
        self.env = env
        deviceToken = Defaults.pushToken
    }

    func refreshAuthorization() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// [.alert, .sound, .badge]; then registerForRemoteNotifications. Returns whether permission is granted.
    @discardableResult
    func requestPermission() async -> Bool {
        Defaults.seenNotifPrompt = true
        guard !env.isFake else { authorization = .authorized; return true }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        await refreshAuthorization()
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    /// Call on launch while signed in: the token can rotate without a permission change.
    func registerIfAuthorized() {
        guard authorization == .authorized || authorization == .provisional, !env.isFake else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func didRegister(token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        Defaults.pushToken = hex
        Task { await syncIfNeeded() }
    }

    func didFailToRegister(_ error: any Error) {
        // The simulator always fails; log and move on.
        log.notice("APNs registration failed: \(String(describing: error), privacy: .public)")
    }

    /// §8.1 — POST push/subscribe when the user, token, or 24 h window changed.
    func syncIfNeeded() async {
        guard !env.isFake, let token = deviceToken, let me = env.session.state.userId else { return }
        let stale = Defaults.pushRegisteredForUser != me
            || Defaults.pushToken != token
            || (Defaults.pushRegisteredAt.map { Date.now.timeIntervalSince($0) > Self.reregisterAfter } ?? true)
        guard stale else { return }
        do {
            try await env.api.pushSubscribe(deviceToken: token)
            Defaults.pushRegisteredForUser = me
            Defaults.pushToken = token
            Defaults.pushRegisteredAt = .now
        } catch {
            log.error("push subscribe: \(String(describing: error), privacy: .public)")
        }
    }

    /// DELETE /api/push/subscribe, best effort with a 3 s cap; clears the registered-* keys.
    func unregister() async {
        defer { Defaults.pushRegisteredForUser = nil; Defaults.pushRegisteredAt = nil }
        guard !env.isFake, let token = deviceToken else { return }
        let api = env.api
        let work = Task { try await api.pushUnsubscribe(deviceToken: token) }
        let timeout = Task { try await Task.sleep(for: .seconds(3)); work.cancel() }
        _ = try? await work.value
        timeout.cancel()
    }

    /// Remove delivered notifications whose userInfo.relatedId is this squad (server sets no thread-id).
    func clearDelivered(for squadId: SquadID?) async {
        guard let squadId, !env.isFake else { return }
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications()
        let ids = delivered.filter { ($0.request.content.userInfo["relatedId"] as? String)?.lowercased() == squadId.description }.map(\.request.identifier)
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
    }

    func clearBadge() {
        guard !env.isFake else { return }
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }

    func reset() {
        guard !env.isFake else { return }
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        clearBadge()
    }
}
