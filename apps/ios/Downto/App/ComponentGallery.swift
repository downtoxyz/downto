// App/ComponentGallery.swift — ARCHITECTURE §15 "ComponentGallery". Every DesignSystem component with its preview fixtures,
// paged so the whole system can be eyeballed on a device before the stores and screens land. RootView shows this until
// resolveGate(...) wiring arrives (§6.1). First page is a mock feed so it reads like the real app, not a kitchen sink.
import SwiftUI

struct ComponentGallery: View {
    @State private var page = 0
    @State private var sort: FeedSort = .recent
    @State private var tab: Tab = .feed
    @State private var composer = ""

    private let titles = ["feed", "entries", "chat", "pieces", "sheets"]

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.paper.ignoresSafeArea()
            TabView(selection: $page) {
                feed.tag(0)
                entries.tag(1)
                chat.tag(2)
                pieces.tag(3)
                sheets.tag(4)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea(edges: .bottom)

            VStack(spacing: 0) {
                pager
                Folio(selected: $tab, squadUnread: true)
            }
        }
        .dtGrain()
    }

    // Tiny page index so it's obvious there's more to swipe to.
    private var pager: some View {
        HStack(spacing: 14) {
            ForEach(titles.indices, id: \.self) { i in
                Text(titles[i].uppercased())
                    .dtFont(.meta)
                    .foregroundStyle(i == page ? Color.ink : Color.inkMuted)
                    .overlay(alignment: .bottom) { if i == page { Rectangle().fill(Color.ink).frame(height: 1).offset(y: 2) } }
                    .onTapGesture { withAnimation { page = i } }
            }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Color.paper)
    }

    // MARK: Pages

    private var feed: some View {
        VStack(spacing: 0) {
            Masthead(wordmark: "down to", runningHead: "wed oct 15 · 3 friends out tonight", sort: $sort, unreadCount: 3)
            ScrollView {
                LazyVStack(spacing: 0) {
                    SectionLabel(text: "timed", count: 2, starred: true).padding(.horizontal, Space.gutter).padding(.top, 8)
                    CheckEntry(model: .previewNew, contextActions: galleryActions)
                    CheckEntry(model: .previewDown, contextActions: galleryActions)
                    SectionLabel(text: "upcoming", count: 4).padding(.horizontal, Space.gutter).padding(.top, 16)
                    EventEntry(model: .previewIdle)
                    CheckEntry(model: .previewMine, contextActions: galleryActions)
                    CheckEntry(model: .previewMystery, contextActions: galleryActions)
                    EventEntry(model: .previewDown)
                    CheckEntry(model: .previewIdle, contextActions: galleryActions)
                    Color.clear.frame(height: 120)
                }
            }
        }
    }

    private var entries: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                SectionLabel(text: "check entry · every state").padding(.horizontal, Space.gutter).padding(.vertical, 12)
                ForEach([CheckEntryModel.previewIdle, .previewNew, .previewMine, .previewDown, .previewWaitlisted, .previewExpired, .previewMystery, .previewMysteryOwn, .previewHighlighted, .previewHidden, .previewTagged]) { m in
                    CheckEntry(model: m, contextActions: galleryActions)
                }
                SectionLabel(text: "event entry").padding(.horizontal, Space.gutter).padding(.vertical, 12)
                ForEach([EventEntryModel.previewIdle, .previewMine, .previewDown, .previewNew, .previewPast]) { EventEntry(model: $0) }
                Color.clear.frame(height: 120)
            }
        }
    }

    private var chat: some View {
        VStack(spacing: 0) {
            Masthead(wordmark: "squads", hasUnreadDot: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SystemMessageRow(text: "guests revealed on fri oct 10")
                    MessageGroupRow(group: .previewOther)
                    MessageGroupRow(group: .previewMine)
                    SystemMessageRow(text: "sara just entered the chat", highlightedName: "sara")
                    MessageGroupRow(group: .previewFailed)
                    MessageGroupRow(group: .previewMasked)
                    DateConfirmCard(model: DateConfirmModel(proposer: "sara", dateText: "fri oct 3 · 8pm", rows: [.init(name: "sara", isMe: false, answer: .yes), .init(name: "kat", isMe: true, answer: .yes), .init(name: "devon", isMe: false, answer: .no), .init(name: "mo", isMe: false, answer: .waiting)]))
                    JoinRequestBanner(model: JoinRequestModel(requester: PreviewPresence.devon, extraCount: 2))
                    PollPlaceholderRow(question: "thurs or fri?")
                    ComposerView(text: $composer)
                    Color.clear.frame(height: 120)
                }
                .padding(.vertical)
            }
        }
    }

    private var pieces: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                SectionLabel(text: "avatars")
                ForEach(AvatarSize.allCases, id: \.self) { size in
                    HStack(spacing: 12) {
                        AvatarLetter(presence: PreviewPresence.me, size: size)
                        AvatarLetter(presence: PreviewPresence.sara, size: size)
                        AvatarLetter(presence: PreviewPresence.masked, size: size)
                        AvatarLetter(presence: PreviewPresence.sara, size: size, badgeRing: .pool)
                        AvatarLetter(presence: PreviewPresence.sara, size: size, badgeRing: .waitlisted)
                        AvatarLetter(presence: PreviewPresence.sara, size: size, expired: true)
                    }
                }
                AvatarStack(presences: [PreviewPresence.me, PreviewPresence.sara, PreviewPresence.devon, PreviewPresence.mo, PreviewPresence.lena])

                SectionLabel(text: "down toggle")
                ForEach([DownToggleState.idle, .pressed, .active, .activePressed, .waitlisted(position: 2), .pending(target: .down), .closed], id: \.self) { s in
                    HStack { Text(String(describing: s)).dtFont(.meta).foregroundStyle(.inkMuted); Spacer(); DownToggle(state: s) }
                }

                SectionLabel(text: "pills · dots · badges")
                HStack { Pill(text: "chill"); Pill(text: "loud", selected: true); Pill(text: "@sara", style: .mention); Pill(text: "WHEN · tmr 7pm", style: .setting) }
                HStack { Pill(text: "friends", style: .visibility(isPublic: false)); Pill(text: "public", style: .visibility(isPublic: true)); Pill(text: "waitlist", style: .waitlist) }
                HStack(spacing: 16) { NotificationDot(); NotificationBadge(count: 3); NotificationBadge(count: 120); SquadUnreadDot(); NewItemsPill(count: 2); NewFlag() }

                SectionLabel(text: "buttons")
                DTButton(title: "send code →", variant: .primary, size: .buttonLarge)
                HStack { DTButton(title: "can't make it", variant: .outline); DTButton(title: "send report", variant: .inverted); DTButton(title: "open →", variant: .text) }
                DTButton(title: "down first", variant: .primary, size: .buttonLarge, disabled: true)

                SectionLabel(text: "slips")
                Slip(item: SlipItem("check removed — undo?", action: "UNDO", countdown: true))
                Slip(item: SlipItem("squad formed! → open", action: "OPEN", style: .success))
                Slip(item: SlipItem("didn't post — try again", action: "RETRY", style: .error))
                Slip(item: SlipItem("lobby's coming to iOS soon ✶"))

                SectionLabel(text: "text")
                WobbleText(text: "nothing's on.")
                ScrambleText(text: "devon", style: .headline)
                LinkifiedText(text: "who's down for karaoke w/ @sara? https://example.com/x", mentions: ["sara"])

                SectionLabel(text: "expiry rule")
                ForEach([0.1, 0.5, 0.8, 1.0], id: \.self) { f in
                    ExpiryRule(expiry: EntryExpiry(elapsedFraction: f, label: "\(Int((1 - f) * 10))h left"), isTopOfSection: f == 0.1)
                }

                SectionLabel(text: "mystery frame")
                Color.checkNew.frame(height: 140).overlay { MysteryFrame() }
                Color.clear.frame(height: 120)
            }
            .foregroundStyle(Color.ink)
            .padding(Space.gutter)
        }
    }

    private var sheets: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionLabel(text: "skeletons · offline").padding(.horizontal, Space.gutter)
                OfflineBand()
                Skeleton(kind: .feed)
                Skeleton(kind: .squads)
                SectionLabel(text: "empty · error").padding(.horizontal, Space.gutter)
                EmptyState(headline: "nothing's on.", line: "post a check and see who bites", cta: "POST A CHECK →").frame(height: 260)
                ErrorColophon(cause: "no connection", retry: {})
                SectionLabel(text: "sheet shell").padding(.horizontal, Space.gutter)
                DTSheetShell(title: "notifications", trailingAction: ("CLEAR", {})) {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(0..<3) { i in
                            Text("block \(i)").dtFont(.body).foregroundStyle(Color.ink).dtStaggered(i)
                        }
                        Text("OPEN →").dtFont(.button).foregroundStyle(.dtInk)
                    }
                    .padding(.horizontal, Space.sheetGutter)
                }
                .frame(height: 300)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24))
                .elevation(.laid)
                SectionLabel(text: "pull").padding(.horizontal, Space.gutter)
                PullIndicator(pull: 80, phase: .armed)
                PullIndicator(pull: 72, phase: .refreshing)
                Color.clear.frame(height: 120)
            }
            .padding(.vertical, 12)
        }
    }

    private var galleryActions: [CheckEntry.ContextAction] { [.init("Hide", systemImage: "eye.slash"), .init("Report", systemImage: "flag")] }
}

#Preview { ComponentGallery() }
