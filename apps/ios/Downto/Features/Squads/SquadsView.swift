// Features/Squads/SquadsView.swift — the squad list (DESIGN §7.7, §7.15; ARCHITECTURE §4.9, §5.5).
// NEW MESSAGES / UPCOMING / FADING ✶ sections, 72 pt rows, pull-to-refresh, skeleton + colophon + empty states.
import SwiftUI

struct SquadsView: View {
    @Environment(AppEnvironment.self) private var env

    private var store: SquadsStore { env.squads }

    var body: some View {
        VStack(spacing: 0) {
            Masthead(wordmark: "squads", runningHead: runningHead, unreadCount: env.notifications.unreadCount, showsAdd: false,
                     onBell: { env.router.present(.notifications) })
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    content
                    Color.clear.frame(height: Space.scrollBottomExtra)
                }
            }
            .scrollEdgeEffectStyle(.hard, for: .top)
            .dtPull(isOffline: env.reachability.isOffline) {
                await store.refresh()
                return store.phase.error == nil
            }
        }
        .background(Color.paper)
    }

    private var runningHead: String? {
        switch store.phase {
        case .loaded(let at, let stale):
            if stale { return "updated \(ago(at))" }
            return env.realtime.status == .reconnecting ? "· reconnecting" : nil
        case .failed(_, let had): return had ? "updated \(ago(store.phase.loadedAt ?? .now)) · couldn't refresh" : nil
        default: return nil
        }
    }

    private func ago(_ d: Date) -> String {
        let m = max(1, Int(Date.now.timeIntervalSince(d) / 60))
        return m < 60 ? "\(m)m ago" : "\(m / 60)h ago"
    }

    @ViewBuilder private var content: some View {
        let s = store.sections
        if store.phase.isLoading && s.isEmpty {
            Skeleton(kind: .squads).padding(.horizontal, Space.gutter).padding(.top, 8)
        } else if case .failed(let e, let had) = store.phase, !had, s.isEmpty {
            ErrorColophon(cause: e.toastCopy) { Task { await store.refresh() } }.padding(.top, 48)
        } else if s.isEmpty {
            EmptyState(headline: "no squads yet.", line: "tap DOWN on a check and the squad forms itself", cta: "go to the feed") {
                env.router.tab = .feed
            }
            .padding(.top, 64)
        } else {
            if !s.newMessages.isEmpty { section("new messages", s.newMessages, show: s.showHeaders) }
            if !s.upcoming.isEmpty { section("upcoming", s.upcoming, show: s.showHeaders) }
            if !s.fading.isEmpty { section("fading", s.fading, show: s.showHeaders, starred: true) }
            if let at = store.phase.loadedAt {
                Text("updated \(ago(at))").dtFont(.meta).foregroundStyle(.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, Space.gutter).padding(.top, 16)
            }
        }
    }

    private func section(_ title: String, _ rows: [SquadRow], show: Bool, starred: Bool = false) -> some View {
        Section {
            ForEach(rows) { row in
                SquadRowView(row: row, now: store.now, fading: starred) { env.router.squadPath = [row.id] }
                    .hairline()
            }
        } header: {
            if show {
                SectionLabel(text: title, count: rows.count, starred: starred)
                    .padding(.horizontal, Space.gutter).padding(.top, Space.sectionAbove).padding(.bottom, Space.sectionBelow)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.paper)
            }
        }
    }
}

/// 72 pt row: unread dot / stack / name + preview / time + countdown (DESIGN §7.7).
struct SquadRowView: View {
    let row: SquadRow
    let now: Date
    var fading = false
    var onTap: () -> Void = {}
    @State private var pressed = false

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(Color.unreadSquad).frame(width: 8, height: 8).opacity(row.hasUnread ? 1 : 0)
            AvatarStack(presences: row.members, ring: .paper, size: .small).opacity(fading ? 0.7 : 1)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(row.name).dtFont(.headline, face: row.hasUnread ? .inter(wght: 700, opsz: 14, tabular: false) : nil)
                        .foregroundStyle(Color.ink).lineLimit(1)
                    if row.myRole == .waitlist { Pill(text: "waitlist", style: .waitlist) }
                }
                if let m = row.lastMessage {
                    Text(previewText(m)).dtFont(.bodySmall).foregroundStyle(fading ? AnyShapeStyle(Color.inkExpired) : AnyShapeStyle(DTStockInk(token: .inkMuted))).lineLimit(1)
                } else {
                    Text("say something. or don't.").dtFont(.bodySmall).foregroundStyle(.inkMuted).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if let m = row.lastMessage { Text(ChatTime.short(m.createdAt, now: now)).dtFont(.meta).foregroundStyle(.inkMuted) }
                countdownText
            }
        }
        .padding(.horizontal, Space.gutter)
        .frame(minHeight: 72)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(pressed ? Color.dtFaint : Color.clear)
        .overlay(alignment: .leading) { if fading { Rectangle().fill(Color.warn).frame(width: 3) } }
        .contentShape(Rectangle())
        .scaleEffect(pressed ? 0.99 : 1)
        .animation(DTSpring.ink, value: pressed)
        // A real Button (same press primitive as CheckEntry): the earlier onLongPress(0.04 s) + onTapGesture pair raced and dropped taps.
        .pressButton(onPressChange: { pressed = $0 }, onTap: onTap)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("squad-row")
    }

    private func previewText(_ m: MessagePreview) -> String {
        guard let s = m.sender else { return m.text }
        let name = s.isMe ? "you" : s.label
        return "\(name): \(m.text)"
    }

    @ViewBuilder private var countdownText: some View {
        if row.isEnded {
            Text(row.countdown(now: now)?.label == "PAST" ? "PAST" : "ENDED").dtFont(.meta).foregroundStyle(.inkMuted)
        } else if let c = row.countdown(now: now) {
            Text(c.sub.map { "\(c.label) · \($0)" } ?? c.label)
                .dtFont(.meta, face: .plex(.medium))
                .foregroundStyle(c.urgent ? AnyShapeStyle(DTStockInk(token: .dangerInk)) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                .dtNumeric(c.label, countsDown: true)
        } else if let exp = row.expiresAt {
            let left = exp.timeIntervalSince(now)
            Text(left < 0 ? "ENDED" : ChatTime.left(left))
                .dtFont(.meta).foregroundStyle(left < 86_400 ? AnyShapeStyle(DTStockInk(token: .dangerInk)) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
        }
    }
}

/// Time strings shared by the list and the chat.
nonisolated enum ChatTime {
    /// "8:12pm" today, "wed" this week, "oct 3" otherwise.
    static func short(_ d: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        if calendar.isDate(d, inSameDayAs: now) { return clock(d) }
        if now.timeIntervalSince(d) < 6 * 86_400 { return d.formatted(.dateTime.weekday(.abbreviated)).lowercased() }
        return d.formatted(.dateTime.month(.abbreviated).day()).lowercased()
    }
    static func clock(_ d: Date) -> String {
        d.formatted(.dateTime.hour(.defaultDigits(amPM: .abbreviated)).minute()).lowercased().replacingOccurrences(of: " ", with: "")
    }
    /// "58m left" / "23h left" / "6d left".
    static func left(_ s: TimeInterval) -> String {
        if s < 3600 { return "\(max(1, Int(s / 60)))m left" }
        if s < 86_400 { return "\(Int(s / 3600))h left" }
        return "\(Int(s / 86_400))d left"
    }
    static func dateLine(_ date: LocalDate, time: String?, calendar: Calendar = .current) -> String {
        let d = date.startOfDay(in: calendar)
        let label = d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()).lowercased()
        return time.map { "\(label) · \($0)" } ?? label
    }
}
