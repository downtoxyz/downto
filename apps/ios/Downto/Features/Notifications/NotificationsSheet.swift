// Features/Notifications/NotificationsSheet.swift — the bell (DESIGN §7.9; ARCHITECTURE §15 "Notifications").
// Opening marks all read except friend requests; unread bands fade 600 ms after presentation — the fade IS the marking.
import SwiftUI

struct NotificationsSheet: View {
    @Environment(AppEnvironment.self) private var env
    @State private var unreadAtOpen: Set<NotificationID> = []
    @State private var faded = false

    var body: some View {
        DTSheetShell(title: "notifications", trailingAction: env.notifications.unreadCount > 0 ? ("\(min(env.notifications.unreadCount, 99))\(env.notifications.unreadCount > 99 ? "+" : "") unread", {}) : nil) {
            content
        }
        .task {
            unreadAtOpen = Set(env.notifications.items.filter { !$0.isRead }.map(\.id))
            env.push.clearBadge()
            if !env.notifications.phase.isSettled { await env.notifications.hydrate() }
            await env.notifications.markAllReadExceptFriendRequests()
            try? await Task.sleep(for: .milliseconds(600))
            withAnimation(.easeOut(duration: 0.6)) { faded = true }
        }
    }

    @ViewBuilder private var content: some View {
        let items = env.notifications.items
        let pinned = env.friends.incoming
        let rest = items.filter { $0.type != .friendRequest || !unreadAtOpen.contains($0.id) }
        if items.isEmpty && pinned.isEmpty {
            if env.notifications.phase.isLoading {
                VStack(spacing: 0) { Skeleton(kind: .notifications) }.padding(.horizontal, Space.sheetGutter)
            } else if let e = env.notifications.phase.error {
                ErrorColophon(cause: e.toastCopy) { Task { await env.notifications.refresh() } }.padding(.top, 24)
            } else {
                EmptyState(headline: "quiet in here.", line: "when someone's down, you'll hear about it").padding(.top, 24)
            }
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    if !pinned.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(pinned) { req in FriendRequestRow(request: req) }
                        }
                        .background(Color.checkNew)
                    }
                    ForEach(Array(rest.enumerated()), id: \.element.id) { i, n in
                        NotificationRow(notification: n, body_: env.notifications.rowBody(for: n),
                                        wasUnread: unreadAtOpen.contains(n.id) && n.type != .friendRequest, fadeUnread: faded) {
                            Task { await env.notifications.tap(n) }
                        }
                        .dtStaggered(i)
                    }
                    Color.clear.frame(height: 24)
                }
            }
        }
    }
}

/// Pinned incoming request: ACCEPT / DECLINE (DESIGN §7.9).
struct FriendRequestRow: View {
    let request: FriendRequest
    @Environment(AppEnvironment.self) private var env
    @State private var busy = false
    @State private var accepted = 0

    var body: some View {
        HStack(spacing: 12) {
            AvatarLetter(presence: .person(request.person), size: .medium, ring: .checkNew)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(request.person.displayName) wants to be friends").dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(2)
                if !request.person.username.isEmpty { Text("@\(request.person.username)").dtFont(.meta).foregroundStyle(.inkMuted) }
            }
            Spacer(minLength: 8)
            DTButton(title: "ACCEPT", variant: .primary, disabled: busy) {
                busy = true
                Task { await env.friends.accept(request.id); accepted += 1; await markRead(); busy = false }
            }
            DTButton(title: "DECLINE", variant: .text, disabled: busy) {
                busy = true
                Task { await env.friends.decline(request.id); await markRead(); busy = false }
            }
        }
        .padding(.horizontal, Space.sheetGutter)
        .padding(.vertical, 10)
        .frame(minHeight: 64)
        .dtFeedback(.success, trigger: accepted)
    }

    private func markRead() async {
        for n in env.notifications.pendingFriendRequests where n.relatedUserId == request.person.id {
            await env.notifications.markRead(n.id)
        }
    }
}

/// The feed's `Color.checkNew` band under the masthead (DESIGN §7.4): "Devon wants to be friends" · ACCEPT / LATER.
/// Reads `env.friends.incoming`; the feed lane mounts it. Collapses with DTSpring.page.
struct FriendRequestBanner: View {
    @Environment(AppEnvironment.self) private var env
    @State private var dismissed: Set<FriendshipID> = []
    @State private var busy = false

    private var request: FriendRequest? { env.friends.incoming.first { !dismissed.contains($0.id) } }

    var body: some View {
        Group {
            if let r = request {
                HStack(spacing: 12) {
                    Text("\(r.person.displayName) wants to be friends").dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(1)
                    Spacer(minLength: 8)
                    Button { busy = true; Task { await env.friends.accept(r.id); busy = false } } label: {
                        Text("ACCEPT").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain).disabled(busy)
                    Button { withAnimation(DTSpring.page) { _ = dismissed.insert(r.id) } } label: {
                        Text("LATER").dtFont(.button).foregroundStyle(.inkMuted).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Space.gutter)
                .frame(height: 44)
                .frame(maxWidth: .infinity)
                .background(Color.checkNew)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(DTSpring.page, value: request?.id)
    }
}
