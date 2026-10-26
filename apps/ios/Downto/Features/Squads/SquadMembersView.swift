// Features/Squads/SquadMembersView.swift — list only in M1 (DESIGN §7.8; ARCHITECTURE §15.1). Pre-reveal: kaomoji rows, no actions.
import SwiftUI

struct SquadMembersView: View {
    let squadId: SquadID
    @Environment(AppEnvironment.self) private var env

    private var members: [MemberDisplay] {
        if let chat = env.squads.openChat, chat.squadId == squadId { return chat.members }
        return env.squads.rows.first { $0.id == squadId }?.members.enumerated().map { i, p in
            MemberDisplay(id: MemberKey("row:\(i)"), presence: p, role: .member, joinedAt: .distantPast)
        } ?? []
    }
    private var createdBy: UserID? { env.squads.raw.squads[squadId]?.createdBy ?? env.squads.openChat?.squad?.createdBy }
    private var locked: Bool { env.squads.openChat?.isMysteryLocked ?? (env.squads.rows.first { $0.id == squadId }?.isMystery ?? false) }

    var body: some View {
        DTSheetShell(title: "members") {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if locked {
                        Text("members revealed on the day").dtFont(.system).foregroundStyle(.inkMuted).padding(.vertical, 8)
                    }
                    ForEach(members) { m in
                        HStack(spacing: 12) {
                            AvatarLetter(presence: m.presence, size: .medium, ring: .surface, badgeRing: m.role == .waitlist ? .waitlisted : .none)
                            VStack(alignment: .leading, spacing: 2) {
                                if case .masked(_, let scramble) = m.presence {
                                    Text(scramble).dtFont(.headline).foregroundStyle(Color.ink).accessibilityLabel("hidden member")
                                } else {
                                    Text(m.presence.isMe ? "you" : m.presence.label).dtFont(.headline).foregroundStyle(Color.ink)
                                    if case .person(let p) = m.presence, !p.username.isEmpty {
                                        Text("@\(p.username)").dtFont(.meta).foregroundStyle(.inkMuted)
                                    }
                                }
                            }
                            Spacer()
                            if m.role == .waitlist { Pill(text: "waitlist", style: .waitlist) }
                            else if case .person(let p) = m.presence, p.id == createdBy { Text("CREATED IT").dtFont(.badge).foregroundStyle(.inkMuted) }
                        }
                        .frame(minHeight: 56)
                        .hairline()
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if case .person(let p) = m.presence, !p.isMe { env.router.present(.userProfile(p.id)) }
                        }
                    }
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.bottom, 24)
            }
        }
    }
}
