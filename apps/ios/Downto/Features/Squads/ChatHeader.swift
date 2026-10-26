// Features/Squads/ChatHeader.swift — the 48 pt custom header under a hidden navigation bar (ARCHITECTURE §7.5; DESIGN §4.10).
import SwiftUI

struct ChatHeader: View {
    let chat: ChatStore
    let now: Date
    var onBack: () -> Void
    var onMore: () -> Void
    @State private var backs = 0

    var body: some View {
        HStack(spacing: 4) {
            Button { backs += 1; onBack() } label: {
                Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink)
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .dtFeedback(.selection, trigger: backs)
            .accessibilityLabel("back")

            VStack(alignment: .leading, spacing: 2) {
                Text(chat.squad?.name ?? " ").dtFont(.title, size: 17).foregroundStyle(Color.ink).lineLimit(1)
                HStack(spacing: 8) {
                    AvatarStack(presences: chat.members.filter { $0.role == .member }.map(\.presence), ring: .surface, size: .micro)
                    countdown
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onMore) {
                Text("⋯").dtFont(.title, size: 24).foregroundStyle(Color.ink).frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("squad settings")
        }
        .padding(.horizontal, 4)
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .background(Color.surface)
        .paperStock(.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.ruleMid).frame(height: 1) }
    }

    @ViewBuilder private var countdown: some View {
        switch chat.lifecycle {
        case .ended, .notMember, .purged:
            Text(endedWord).dtFont(.meta).foregroundStyle(.inkMuted)
        case .expiringSoon:
            if let exp = chat.squad?.expiresAt {
                Text("\(max(1, Int(exp.timeIntervalSince(now) / 60)))m").dtFont(.numeral, size: 20).foregroundStyle(.dangerInk)
                    .dtNumeric(Int(exp.timeIntervalSince(now) / 60), countsDown: true)
            }
        case .live, .grace:
            if env.realtime.status == .reconnecting {
                Text("reconnecting…").dtFont(.meta).foregroundStyle(.inkMuted)
            } else if let exp = chat.squad?.expiresAt {
                let left = exp.timeIntervalSince(now)
                Text(chat.lifecycle == .grace ? "ends in \(ChatTime.left(left).replacingOccurrences(of: " left", with: ""))" : ChatTime.left(left))
                    .dtFont(.meta, face: .plex(.medium))
                    .foregroundStyle(left < 86_400 ? AnyShapeStyle(DTStockInk(token: .dangerInk)) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                    .dtNumeric(Int(left / 60), countsDown: true)
            } else {
                Text("no expiry").dtFont(.meta).foregroundStyle(.inkMuted)
            }
        }
    }

    @Environment(AppEnvironment.self) private var env

    private var endedWord: String {
        if chat.lifecycle == .notMember { return "not in this squad" }
        if let d = chat.squad?.lockedDate, d.startOfDay(in: .current).addingTimeInterval(86_400) < now { return "PAST" }
        return "ENDED"
    }
}
