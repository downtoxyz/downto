// Features/Feed/FeedView.swift — the broadsheet (ARCHITECTURE §15 "Feed"; DESIGN §7.4, §4.1, §5.1, §7.15).
// Masthead, TIMED / OPEN / HIDDEN sections, pull-to-refresh, skeleton / colophon / stale states, the "N new ↑" hold,
// push highlight, NEW seen-tracking, and the SQUAD FORMED / "you're in" strips.
import SwiftUI

struct FeedView: View {
    let namespace: Namespace.ID
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dtReduceMotion) private var reduceMotion
    @State private var position = ScrollPosition(edge: .top)
    @State private var scrollInteracting = false
    @State private var hiddenOpen = false
    @State private var firstLoadStagger = true
    @State private var stillPrinting = false
    @State private var showColophonTimer: Task<Void, Never>?
    @State private var strip: StripState?
    @State private var stamp: CheckID?
    @State private var runningHeadTaps = 0

    nonisolated struct StripState: Equatable, Sendable {
        let checkId: CheckID
        let outcome: FeedStore.SquadOutcome
        let squadId: SquadID
    }

    private var feed: FeedStore { env.feed }
    private var today: LocalDate { Mystery.localToday(feed.now, calendar: .current) }

    var body: some View {
        @Bindable var feed = env.feed
        VStack(spacing: 0) {
            Masthead(wordmark: "down to", runningHead: runningHead, sort: $feed.sort, unreadCount: env.notifications.unreadCount,
                     glowAdd: Defaults.showAddGlow, isCreateOpen: env.router.isCreateOpen,
                     onBell: { env.router.present(.notifications) }, onAdd: { env.router.isCreateOpen = true })
                .onTapGesture { runningHeadTaps += 1; if env.realtime.status != .connected { Task { await env.realtime.resume(); await env.refreshAll() } } }
            ZStack(alignment: .top) {
                content
                if !feed.heldInserts.isEmpty {
                    NewItemsPill(count: feed.heldInserts.count) { releaseHeld() }
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(DTSpring.page, value: feed.heldInserts.count)
        }
        .background(Color.paper)
        .overlay { if let id = stamp { SquadFormedStamp().onTapGesture { stamp = nil }.id(id) } }
        .onChange(of: env.router.highlightedCheckId) { _, id in if let id { scrollTo(id) } }
        .onChange(of: feed.squadOutcome) { _, outcomes in
            guard let (id, outcome) = outcomes.first, let squad = feed.items.compactMap(\.check).first(where: { $0.id == id })?.mySquad else { return }
            play(outcome, for: id, squad: squad.squadId)
        }
        .onChange(of: feed.phase.isSettled, initial: true) { _, settled in
            if settled { stillPrinting = false; showColophonTimer?.cancel() } else { armPrintingTimers() }
        }
        .task {
            // Seen flags settle on return to the feed (DESIGN §4.1).
            try? await Task.sleep(for: .seconds(1))
            firstLoadStagger = false
        }
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        switch feed.phase {
        case .idle, .loading:
            if feed.items.isEmpty {
                ScrollView { Skeleton(kind: .feed, stillPrinting: stillPrinting) }
                    .accessibilityLabel("loading")
            } else { list }
        case .failed(let e, let hadSnapshot):
            if hadSnapshot, !feed.items.isEmpty { list }
            else {
                ScrollView {
                    ErrorColophon(headline: ErrorColophon.pool[0], cause: cause(e)) { Task { await feed.refresh() } }
                        .padding(.top, 80)
                }
                .dtPull(isOffline: env.reachability.isOffline) { await feed.refresh(); return false }
            }
        case .loaded:
            if feed.items.isEmpty && feed.hidden.isEmpty { empty } else { list }
        }
    }

    private var empty: some View {
        ScrollView {
            EmptyState(headline: "nothing's up yet.", line: "post a check or add a friend — their checks land here.", cta: "NEW CHECK →") {
                env.router.isCreateOpen = true
            }
            .padding(.top, 96)
        }
        .dtPull(isOffline: env.reachability.isOffline) { await feed.refresh(); return false }
    }

    private var list: some View {
        let items = feed.items
        let pinned = items.filter { !$0.expiry.isOpen }
        let chrono = items.filter { $0.expiry.isOpen }
        return ScrollView {
            LazyVStack(spacing: 0, pinnedViews: []) {
                banners
                if !pinned.isEmpty {
                    SectionLabel(text: "timed", count: pinned.count, starred: true)
                        .padding(.horizontal, Space.gutter).padding(.top, Space.sectionAbove).padding(.bottom, Space.sectionBelow)
                    ForEach(Array(pinned.enumerated()), id: \.element.id) { i, item in
                        row(item, isTopOfTimed: i == 0, index: i)
                    }
                }
                if !chrono.isEmpty {
                    SectionLabel(text: "open", count: nil)
                        .padding(.horizontal, Space.gutter).padding(.top, Space.sectionAbove).padding(.bottom, Space.sectionBelow)
                    ForEach(Array(chrono.enumerated()), id: \.element.id) { i, item in
                        row(item, isTopOfTimed: false, index: pinned.count + i)
                    }
                }
                if !feed.hidden.isEmpty { hiddenSection }
                Color.clear.frame(height: 24)
            }
            .animation(DTSpring.page, value: items.map(\.id))
            .animation(DTSpring.settle, value: feed.sort)
        }
        .scrollPosition($position)
        .environment(\.dtScrollInteracting, scrollInteracting)
        .onScrollPhaseChange { _, phase in scrollInteracting = phase == .interacting || phase == .decelerating }
        .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y > 200 } action: { _, deep in
            feed.isScrolledDeep = deep
            if !deep { releaseHeld() }
        }
        .dtPull(isOffline: env.reachability.isOffline) {
            let before = Set(feed.items.map(\.id))
            await feed.refresh()
            return !Set(feed.items.map(\.id)).subtracting(before).isEmpty
        }
    }

    @ViewBuilder private var banners: some View {
        FriendRequestBanner()
        if env.push.authorization != .authorized, !Defaults.notifNudgeDismissed, feed.hasChecks || !env.squads.rows.isEmpty {
            NotifNudgeBanner()
        }
    }

    @ViewBuilder private func row(_ item: FeedItem, isTopOfTimed: Bool, index: Int) -> some View {
        switch item {
        case .check(let c):
            checkRow(c, isTopOfTimed: isTopOfTimed)
                .staggered(index: index, enabled: firstLoadStagger, reduceMotion: reduceMotion)
                .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: -8)), removal: .opacity))
        case .event(let e):
            EventEntry(model: FeedModels.eventModel(e, me: env.me, pending: false, highlighted: false, today: today),
                       onTap: { env.toasts.show("lobby's coming to iOS soon ✶") },
                       onToggle: { ev in
                           switch ev {
                           case .stamped: Task { await feed.setEventDown(e.id, down: true) }
                           case .undone: Task { await feed.setEventDown(e.id, down: false) }
                           default: break
                           }
                       },
                       onResponses: { env.toasts.show("lobby's coming to iOS soon ✶") })
                .id(item.id)
                .staggered(index: index, enabled: firstLoadStagger, reduceMotion: reduceMotion)
                .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: -8)), removal: .opacity))
        }
    }

    private func checkRow(_ c: FeedCheck, isTopOfTimed: Bool) -> some View {
        let model = FeedModels.checkModel(c, pending: feed.inflightIds.contains(c.id),
                                          squadUnread: c.mySquad.map { env.squads.unread.contains($0.squadId) } ?? false,
                                          highlighted: env.router.highlightedCheckId == c.id, isTopOfTimed: isTopOfTimed)
        return VStack(spacing: 0) {
            CheckEntry(model: model,
                       onTap: { env.router.feedPath = [.checkDetail(c.id)] },
                       onToggle: { handleToggle($0, c) },
                       onOpenSquad: { if let s = c.mySquad { env.router.go(.squads(squadId: s.squadId), env: env) } },
                       onMore: { if !c.isSynthetic { env.router.present(.checkActions(c.id)) } },
                       onCoAuthor: { accept in Task { accept ? await feed.acceptTag(c.id) : await feed.declineTag(c.id) } },
                       contextActions: contextActions(c))
                .matchedTransitionSource(id: c.id, in: namespace)
                .onScrollVisibilityChange(threshold: 0.6) { visible in if visible, c.isNew { seen(c.id) } }
            if let s = strip, s.checkId == c.id {
                SquadStrip(state: s, members: c.downs.map(Presence.person), waitlistPosition: c.waitlistPosition) {
                    strip = nil
                    env.router.go(.squads(squadId: s.squadId), env: env)
                }
                .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .opacity), removal: .opacity))
            }
        }
        .id("c:\(c.id)")
        .animation(DTSpring.page, value: strip)
    }

    private func contextActions(_ c: FeedCheck) -> [CheckEntry.ContextAction] {
        c.isMine || c.isSynthetic ? [] : [.init("Hide", systemImage: "eye.slash"), .init("Report", systemImage: "flag", destructive: true)]
    }

    private var hiddenSection: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(DTSpring.page) { hiddenOpen.toggle() }
            } label: {
                HStack(spacing: 6) {
                    SectionLabel(text: "hidden (\(feed.hidden.count))")
                    Text("›").dtFont(.label).foregroundStyle(.inkMuted).rotationEffect(.degrees(hiddenOpen ? 90 : 0))
                }
                .padding(.horizontal, Space.gutter).padding(.top, Space.sectionAbove).padding(.bottom, Space.sectionBelow)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if hiddenOpen {
                ForEach(feed.hidden) { c in
                    CheckEntry(model: FeedModels.checkModel(c, isHidden: true),
                               onTap: { env.router.feedPath = [.checkDetail(c.id)] },
                               onUnhide: { Task { await feed.unhide(c.id) } })
                        .id("h:\(c.id)")
                        .transition(.opacity)
                }
            }
        }
    }

    // MARK: Behaviour

    private func handleToggle(_ ev: DownToggleEvent, _ c: FeedCheck) {
        switch ev {
        case .stamped, .undone: Task { await feed.toggleDown(c.id) }
        case .waitlistTapped: if let s = c.mySquad { env.router.go(.squads(squadId: s.squadId), env: env) }
        case .touchDown: break
        }
    }

    private func scrollTo(_ id: CheckID) {
        withAnimation(DTSpring.page) { position.scrollTo(id: "c:\(id)", anchor: .top) }
    }

    private func releaseHeld() {
        guard !feed.heldInserts.isEmpty else { return }
        withAnimation(DTSpring.page) { position.scrollTo(edge: .top) }
        feed.releaseHeldInserts()
    }

    private func seen(_ id: CheckID) {
        Task {
            try? await Task.sleep(for: .milliseconds(1500))
            feed.markSeen(id)
        }
    }

    private func play(_ outcome: FeedStore.SquadOutcome, for id: CheckID, squad: SquadID) {
        feed.clearSquadOutcome(id)
        withAnimation(DTSpring.page) { strip = StripState(checkId: id, outcome: outcome, squadId: squad) }
        if outcome == .formed, !reduceMotion {
            stamp = id
            Task { await HapticEngine.shared.play(.squadFormed) }
            Task { try? await Task.sleep(for: .milliseconds(1700)); withAnimation(.easeIn(duration: 0.22)) { stamp = nil } }
            env.toasts.show("squad formed! → open", key: "squad:\(squad)", action: .openSquad(squad))
        }
        Task {
            try? await Task.sleep(for: .seconds(outcome == .formed ? 8 : 6))
            if strip?.checkId == id { withAnimation(DTSpring.settle) { strip = nil } }
        }
    }

    private func armPrintingTimers() {
        showColophonTimer?.cancel()
        showColophonTimer = Task {
            try? await Task.sleep(for: .seconds(8))
            guard !Task.isCancelled else { return }
            stillPrinting = true
        }
    }

    private var runningHead: String {
        var parts: [String] = []
        switch feed.phase {
        case .loaded(let at, let stale) where stale: parts.append("updated \(Self.ago(at))")
        case .failed(_, let had) where had: parts.append("updated \(Self.ago(feed.phase.loadedAt ?? .now)) · couldn't refresh")
        default:
            let live = feed.items.compactMap(\.check).filter { !$0.expiry.isOpen }.count
            let day = feed.now.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()).lowercased()
            parts.append(live > 0 ? "\(day) · \(live) timed" : day)
        }
        if env.realtime.status != .connected, env.bootedForUser != nil, !env.reachability.isOffline, !env.isFake { parts.append("· reconnecting") }
        return parts.joined(separator: " ")
    }

    nonisolated static func ago(_ d: Date) -> String {
        let s = Int(Date.now.timeIntervalSince(d))
        if s < 60 { return "just now" }
        if s < 3600 { return "\(s / 60)m ago" }
        if s < 86_400 { return "\(s / 3600)h ago" }
        return "\(s / 86_400)d ago"
    }

    private func cause(_ e: AppError) -> String {
        switch e {
        case .network: "no connection"
        case .unauthenticated: "you got signed out"
        case .api(let status, _): "server said no (\(status))"
        default: e.toastCopy
        }
    }
}

/// First feed load: the first six entries stagger in 40 ms apart (DESIGN §5.1).
private struct Staggered: ViewModifier {
    let index: Int
    let enabled: Bool
    let reduceMotion: Bool
    @State private var shown = false
    func body(content: Content) -> some View {
        content
            .opacity(shown || !enabled || reduceMotion ? 1 : 0)
            .offset(y: shown || !enabled || reduceMotion ? 0 : 12)
            .onAppear {
                guard enabled, !reduceMotion else { shown = true; return }
                let delay = Double(min(index, DTCurve.maxStaggered)) * DTCurve.stagger
                withAnimation(DTSpring.page.delay(delay)) { shown = true }
            }
    }
}

extension View {
    func staggered(index: Int, enabled: Bool, reduceMotion: Bool) -> some View { modifier(Staggered(index: index, enabled: enabled, reduceMotion: reduceMotion)) }
}

// MARK: - SQUAD FORMED / "you're in" (DESIGN §5.6)

struct SquadStrip: View {
    let state: FeedView.StripState
    let members: [Presence]
    var waitlistPosition: Int?
    var onOpen: () -> Void

    private var isWaitlisted: Bool { waitlistPosition != nil && state.outcome == .joined }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                if !members.isEmpty { AvatarStack(presences: members, ring: isWaitlisted ? .waitlistBg : .deep, size: .small) }
                if let p = waitlistPosition, isWaitlisted {
                    Text("you're #\(p) on the waitlist").dtFont(.bodySmall).foregroundStyle(Color.ink)
                } else if state.outcome == .joined {
                    HStack(spacing: 4) {
                        Text("✓").dtFont(.bodySmall).foregroundStyle(.successInk)
                        Text("you're in · \(names)").dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(1)
                    }
                } else {
                    Text(names).dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(1)
                }
                Spacer()
                Text("OPEN →").dtFont(.button).foregroundStyle(.dtInk)
            }
            .padding(.horizontal, Space.gutter)
            .frame(height: state.outcome == .formed ? 56 : 48)
            .frame(maxWidth: .infinity)
            .background(isWaitlisted ? Color.waitlistBg : Color.deep)
            .paperStock(.deep)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(state.outcome == .formed ? "squad formed, open" : "you're in the squad, open")
    }

    private var names: String {
        let others = members.filter { !$0.isMe }.map(\.label)
        let shown = others.prefix(2).joined(separator: ", ")
        let extra = others.count - 2
        var s = shown
        if extra > 0 { s += " + \(extra)" }
        return s.isEmpty ? "just you so far" : s + " + you"
    }
}

/// The −6° stamp: scale 1.6 → 1 with DTSpring.stamp, 1pt ink inset frame (DESIGN §5.6).
struct SquadFormedStamp: View {
    @State private var shown = false
    var body: some View {
        Text("SQUAD FORMED")
            .dtFont(.buttonLarge)
            .foregroundStyle(Color.onDt)
            .padding(.vertical, 12).padding(.horizontal, 20)
            .background(RoundedRectangle(cornerRadius: Radius.stamp, style: .continuous).fill(Color.dt))
            .overlay(RoundedRectangle(cornerRadius: Radius.stamp - 2, style: .continuous).stroke(Color.ink, lineWidth: 1).padding(3))
            .rotationEffect(.degrees(-6))
            .elevation(.lifted)
            .scaleEffect(shown ? 1 : 1.6)
            .opacity(shown ? 1 : 0)
            .onAppear { withAnimation(DTSpring.stamp.delay(0.2)) { shown = true } }
            .transition(.scale(scale: 0.6).combined(with: .opacity))
            .allowsHitTesting(false)
            .accessibilityLabel("squad formed")
    }
}

// MARK: - Banners (DESIGN §7.4)

struct NotifNudgeBanner: View {
    @Environment(AppEnvironment.self) private var env
    @State private var dismissed = false

    var body: some View {
        if !dismissed {
            HStack(spacing: 8) {
                Text("turn on notifications so you know when they're down").dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(2)
                Spacer(minLength: 4)
                Button { enable() } label: { Text("ENABLE").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                Button { withAnimation(DTSpring.page) { dismissed = true }; Defaults.notifNudgeDismissed = true } label: {
                    Text("×").dtFont(.title).foregroundStyle(.inkMuted).frame(width: 44, height: 44)
                }.buttonStyle(.plain).accessibilityLabel("dismiss")
            }
            .padding(.leading, Space.gutter).padding(.trailing, 4)
            .frame(minHeight: 44)
            .background(Color.surface)
            .paperStock(.surface)
            .hairline()
            .transition(.opacity)
        }
    }

    private func enable() {
        if env.push.authorization == .denied, let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url)
        } else {
            Task { if await env.push.requestPermission() { withAnimation(DTSpring.page) { dismissed = true } } }
        }
    }
}
