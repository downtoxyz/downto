// Features/Friends/UserProfileSheet.swift — someone else's profile (DESIGN §7.10 "UserProfileOverlay"; ARCHITECTURE §15 "Friends").
import SwiftUI

struct UserProfileSheet: View {
    let userId: UserID
    @Environment(AppEnvironment.self) private var env
    @State private var profile: Profile?
    @State private var loading = true
    @State private var busy = false
    @State private var confirm: DTConfirm?
    @State private var blocked = 0

    private var person: PersonRef? { profile?.personRef(me: env.me) }
    private var isMe: Bool { userId == env.me }

    var body: some View {
        DTSheetShell {
            Group {
                if let profile, let person {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .top, spacing: 16) {
                            AvatarLetter(presence: .person(person), size: .display)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(profile.displayName).dtFont(.display).foregroundStyle(Color.ink).lineLimit(2)
                                Text("@\(profile.username)").dtFont(.body).foregroundStyle(.inkMuted)
                                if let via = env.friends.via(for: userId) { Text("via \(via)").dtFont(.meta).foregroundStyle(.inkMuted) }
                                if let ig = profile.igHandle, !ig.isEmpty, let url = URL(string: "https://instagram.com/\(ig)") {
                                    Link(destination: url) { Text("@\(ig) on instagram").dtFont(.meta).foregroundStyle(.dtInk) }
                                }
                                if let a = profile.availability, let g = a.glyph {
                                    Text("\(g) \(a.word)").dtFont(.meta).foregroundStyle(.inkMuted).padding(.top, 2)
                                }
                            }
                        }
                        if !isMe { actionRow }
                        Spacer(minLength: 0)
                        if !isMe {
                            HStack(spacing: 16) {
                                Button { confirm = DTConfirm("block \(profile.displayName)?", message: "removes the friendship and hides everything from each other", actions: [.init("BLOCK", destructive: true)]) } label: {
                                    Text("block").dtFont(.meta).foregroundStyle(.inkMuted).frame(minHeight: 44)
                                }
                                .buttonStyle(.plain)
                                Text("·").dtFont(.meta).foregroundStyle(.inkMuted)
                                Button { env.router.present(.report(.profile, userId.raw)) } label: {
                                    Text("report").dtFont(.meta).foregroundStyle(.inkMuted).frame(minHeight: 44)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, Space.sheetGutter)
                    .padding(.top, 8)
                    .padding(.bottom, 16)
                } else if loading {
                    Skeleton(kind: .sheetRows).padding(.horizontal, Space.sheetGutter)
                } else {
                    EmptyState(headline: "who?", line: "couldn't load that profile").padding(.top, 24)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 300, alignment: .topLeading)
        }
        .presentationDetents([.height(360), .large])
        .task(id: userId) {
            loading = true
            profile = await env.friends.profile(id: userId)
            loading = false
        }
        .dtConfirmDialog($confirm) { a in
            if a.title == "REMOVE" {
                if let f = friendshipId { run { await env.friends.remove(f) } }
            } else {
                busy = true
                Task { await env.friends.block(userId); blocked += 1; busy = false; env.router.sheet = nil }
            }
        }
        .dtFeedback(.warning, trigger: blocked)
    }

    @ViewBuilder private var actionRow: some View {
        switch env.friends.relationship(with: userId) {
        case .none:
            DTButton(title: "ADD", variant: .primary, size: .buttonLarge, disabled: busy) { run { await env.friends.request(userId) } }
        case .friends:
            DTButton(title: "REMOVE", variant: .outline, size: .buttonLarge, disabled: busy) {
                confirm = DTConfirm("remove \(profile?.displayName ?? "them") as a friend?", actions: [.init("REMOVE", destructive: true)])
            }
        case .incoming(let f):
            DTButton(title: "ACCEPT", variant: .primary, size: .buttonLarge, disabled: busy) { run { await env.friends.accept(f) } }
        case .outgoing(let f):
            HStack(spacing: 12) {
                Text("REQUESTED").dtFont(.button).foregroundStyle(.inkMuted)
                Spacer()
                DTButton(title: "CANCEL REQUEST", variant: .outline, disabled: busy) { run { await env.friends.cancel(f) } }
            }
        case .blocked:
            DTButton(title: "UNBLOCK", variant: .outline, size: .buttonLarge, disabled: busy) { run { await env.friends.unblock(userId) } }
        }
    }

    private var friendshipId: FriendshipID? {
        env.friends.raw.friendships.values.first { ($0.requesterId == userId || $0.addresseeId == userId) && $0.status == .accepted }?.id
    }

    private func run(_ op: @escaping () async -> Void) { busy = true; Task { await op(); busy = false } }
}
