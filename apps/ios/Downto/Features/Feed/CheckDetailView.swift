// Features/Feed/CheckDetailView.swift — the zoomed page (DESIGN §7.5, §5.4; ARCHITECTURE §7, §7.1 synthetic card).
// Full text, byline with co-authors, DOWN + WAITLIST grids, comments transcript with a pinned composer, full-width DOWN bar.
import SwiftUI

struct CheckDetailView: View {
    let checkId: CheckID
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dtReduceMotion) private var reduceMotion
    @State private var comment = ""
    @State private var sending = false
    @State private var landed = false
    @State private var loadFailed = false
    @FocusState private var composerFocused: Bool

    private var check: FeedCheck? {
        env.feed.items.compactMap(\.check).first { $0.id == checkId }
            ?? env.feed.hidden.first { $0.id == checkId }
            ?? env.feed.leftChecks.first { $0.id == checkId }
    }

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            if let c = check { page(c) } else if loadFailed { missing } else { ScrollView { Skeleton(kind: .feed) } }
        }
        .background(InteractivePopEnabler().frame(width: 0, height: 0))
        .safeAreaInset(edge: .top) { topBar }
        .task(id: checkId) {
            if check == nil { loadFailed = !(await env.feed.ensureLoaded(checkId)) }
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(DTSpring.page) { landed = true }
        }
    }

    private var topBar: some View {
        HStack {
            Button { env.router.feedPath = [] } label: {
                Text("‹").dtFont(.display).foregroundStyle(Color.ink).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("back")
            Spacer()
            if let c = check, !c.isSynthetic {
                if c.isMine {
                    Button { env.router.present(.editCheck(c.id)) } label: { Text("EDIT").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                } else {
                    Button { env.router.present(.checkActions(c.id)) } label: { Text("⋯").dtFont(.headline).foregroundStyle(.inkDim).frame(width: 44, height: 44) }.buttonStyle(.plain)
                        .accessibilityLabel("more")
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 48)
        .background(Color.paper)
    }

    private var missing: some View {
        ErrorColophon(headline: "couldn't load that.", cause: env.reachability.isOffline ? "no connection" : "that check may be gone") {
            loadFailed = false
            Task { loadFailed = !(await env.feed.ensureLoaded(checkId)) }
        }
    }

    private func page(_ c: FeedCheck) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if c.isSynthetic { contextBand(c) }
                byline(c)
                if let url = c.letterboxdUrl, !url.isEmpty, let u = URL(string: url) {
                    Link(destination: u) { Text("LETTERBOXD →").dtFont(.button).foregroundStyle(.dtInk) }
                }
                LinkifiedText(text: c.text, mentions: c.mystery == .unrevealed ? [] : FeedModels.mentions(in: c.text), style: .display, masked: c.mystery == .unrevealed && !c.isMine)
                    .foregroundStyle(c.expiry.isExpired ? Color.inkExpired : Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !c.whenWhereParts.isEmpty {
                    MetaLine(c.whenWhereParts).dtFont(.body).foregroundStyle(.inkMuted)
                }
                if let e = FeedModels.entryExpiry(c.expiry) {
                    Text(e.isExpired ? "expired" : e.label).dtFont(.meta).foregroundStyle(e.isDanger ? AnyShapeStyle(.dangerInk) : AnyShapeStyle(.inkMuted))
                }
                if c.isCoAuthorPending { taggedStrip(c) }
                Group {
                    guests(c)
                    if !c.isSynthetic { comments(c) }
                }
                .opacity(landed || reduceMotion ? 1 : 0)
                .offset(y: landed || reduceMotion ? 0 : 8)
                Color.clear.frame(height: 24)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 8)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { bottomBar(c) }
        .dtConfirmDialog(.constant(nil)) { _ in }
    }

    private func contextBand(_ c: FeedCheck) -> some View {
        Text("\(c.author.label) sent you this").dtFont(.bodySmall).foregroundStyle(Color.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 10).padding(.horizontal, 12)
            .background(Color.checkNew)
    }

    private func byline(_ c: FeedCheck) -> some View {
        HStack(spacing: 8) {
            AvatarLetter(presence: c.author, size: .small)
            if c.author.isMe || (c.isMine && !c.author.isMasked) {
                Text("you").dtFont(.meta, face: .plex(.semiBold)).foregroundStyle(Color.ink)
            } else if case .masked(_, let s) = c.author {
                ScrambleText(text: s, style: .meta, revealed: c.mystery == .revealedToday)
                    .foregroundStyle(.inkMuted)
            } else {
                Text(c.author.label).dtFont(.meta, face: .plex(.medium)).foregroundStyle(.dtInk)
            }
            let accepted = c.coAuthors.filter { $0.status == .accepted }
            if !accepted.isEmpty {
                Text("with \(accepted.map(\.person.label).joined(separator: ", "))").dtFont(.meta).foregroundStyle(.inkMuted).lineLimit(1)
            }
            if let via = c.via { Text("via \(via)").dtFont(.meta).foregroundStyle(.inkDim) }
            Spacer()
        }
    }

    private func taggedStrip(_ c: FeedCheck) -> some View {
        HStack(spacing: 16) {
            Text("you were tagged").dtFont(.label).foregroundStyle(.inkMuted)
            Spacer()
            Button { Task { await env.feed.acceptTag(c.id) } } label: { Text("ACCEPT").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
            Button { Task { await env.feed.declineTag(c.id) } } label: { Text("DECLINE").dtFont(.button).foregroundStyle(.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private func guests(_ c: FeedCheck) -> some View {
        switch c.guests {
        case .hidden:
            VStack(spacing: 8) {
                Text("?").dtFont(.display).foregroundStyle(Color.dt)
                Text(c.eventDate.map { "guests revealed on \(DateParse.label($0.startOfDay(in: .current), calendar: .current).lowercased())" } ?? "guests revealed on the day")
                    .dtFont(.bodySmall).foregroundStyle(.inkMuted)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 24)
            .background(Radius.shape(Radius.m).fill(Color.deep))
            .paperStock(.deep)
        case .countOnly(let n):
            SectionLabel(text: "down", count: n)
            Text(n == 0 ? "nobody yet" : "\(n) \(n == 1 ? "person" : "people") down").dtFont(.bodySmall).foregroundStyle(.inkMuted)
        case .revealed(let downs, let waitlist):
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel(text: "down", count: downs.count)
                if downs.isEmpty { Text("no responses yet").dtFont(.bodySmall).foregroundStyle(.inkMuted) }
                else { grid(downs.sorted { $0.isMe && !$1.isMe }, ordinals: false) }
                if !waitlist.isEmpty {
                    SectionLabel(text: "waitlist", count: waitlist.count).padding(.top, 8)
                    grid(waitlist, ordinals: true)
                }
            }
        }
    }

    private func grid(_ people: [PersonRef], ordinals: Bool) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 12) {
            ForEach(Array(people.enumerated()), id: \.element.id) { i, p in
                Button { if !p.isMe { env.router.present(.userProfile(p.id)) } } label: {
                    VStack(spacing: 4) {
                        AvatarLetter(presence: .person(p), size: .medium, ring: p.isMe ? .dt : nil)
                        if ordinals { Text("#\(i + 1)").dtFont(.badge).foregroundStyle(.inkMuted) }
                        Text(p.isMe ? "you" : p.displayName).dtFont(.meta).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.center)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func comments(_ c: FeedCheck) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "comments", count: c.comments.isEmpty ? nil : c.comments.count).padding(.top, 8)
            if c.comments.isEmpty {
                Text("say something. or don't.").dtFont(.system).foregroundStyle(.inkMuted)
            }
            ForEach(c.comments) { k in
                HStack(alignment: .top, spacing: 8) {
                    AvatarLetter(presence: k.sender, size: .inline)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(k.sender.isMe ? "you" : k.sender.label).dtFont(.meta, face: .plex(.medium)).foregroundStyle(k.sender.isMe ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .dtInk)))
                            Text(k.createdAt.formatted(.relative(presentation: .numeric))).dtFont(.meta).foregroundStyle(.inkDim)
                        }
                        Text(k.text).dtFont(.bodySmall).foregroundStyle(Color.ink)
                    }
                }
                .contextMenu { Button("Copy") { UIPasteboard.general.string = String(k.text.characters) } }
            }
        }
    }

    private func bottomBar(_ c: FeedCheck) -> some View {
        VStack(spacing: 0) {
            if !c.isSynthetic, !c.isMine {
                composer(c)
            }
            if !c.isMine {
                downBar(c)
            } else {
                HStack {
                    Text(c.mystery == .unrevealed ? "\(c.downCount ?? 0) ?" : "\(c.downCount ?? 0) down").dtFont(.meta).foregroundStyle(.inkMuted)
                    Spacer()
                    if let s = c.mySquad {
                        Button { env.router.go(.squads(squadId: s.squadId), env: env) } label: { Text("OPEN SQUAD →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Space.gutter).padding(.vertical, 8)
            }
        }
        .background(Color.paper)
        .elevation(.laid)
    }

    private func composer(_ c: FeedCheck) -> some View {
        HStack(spacing: 8) {
            TextField("", text: $comment, prompt: Text("say something").foregroundStyle(Color.inkFaint), axis: .vertical)
                .dtFont(.bodySmall).foregroundStyle(Color.ink).lineLimit(1...4)
                .focused($composerFocused)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.card))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.rule, lineWidth: 1))
            if comment.count >= 240 { Text("\(280 - comment.count)").dtFont(.meta).foregroundStyle(comment.count > 280 ? AnyShapeStyle(.dangerInk) : AnyShapeStyle(.inkMuted)) }
            Button { Task { await send(c) } } label: {
                Text("↑").dtFont(.headline).foregroundStyle(DTContrastAware(token: .onDtFill))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(comment.isEmpty ? AnyShapeStyle(Color.ruleLight) : AnyShapeStyle(DTContrastAware(token: .dtFill))))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(comment.trimmingCharacters(in: .whitespaces).isEmpty || sending || comment.count > 280)
            .accessibilityLabel("post comment")
        }
        .padding(.horizontal, Space.gutter).padding(.top, 8)
    }

    private func send(_ c: FeedCheck) async {
        sending = true
        defer { sending = false }
        let mentions = FeedModels.mentions(in: comment).compactMap { h in env.friends.friends.first { $0.username == h }?.id }
        do {
            try await env.feed.addComment(checkId: c.id, text: comment, mentions: mentions)
            comment = ""
        } catch {
            env.toasts.show("didn't post — try again", style: .error)
        }
    }

    private func downBar(_ c: FeedCheck) -> some View {
        let state = FeedModels.toggle(for: c, pending: env.feed.inflightIds.contains(c.id))
        return HStack(spacing: 12) {
            if let s = c.mySquad {
                Button { env.router.go(.squads(squadId: s.squadId), env: env) } label: { Text("OPEN SQUAD →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
            }
            Button {
                switch state {
                case .idle, .active: Task { await env.feed.toggleDown(c.id) }
                case .waitlisted: if let s = c.mySquad { env.router.go(.squads(squadId: s.squadId), env: env) }
                default: break
                }
            } label: {
                Text(state.label).dtFont(.buttonLarge)
                    .foregroundStyle(barInk(state))
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Capsule().fill(barFill(state)))
                    .overlay(Capsule().strokeBorder(barStroke(state), style: StrokeStyle(lineWidth: 1, dash: state.label == "WAITLISTED" ? [3, 3] : [])))
                    .opacity(state.isInteractive || state.label == "WAITLISTED" ? 1 : 0.9)
            }
            .buttonStyle(DTPressStyle())
            .disabled(!state.isInteractive && state.label != "WAITLISTED" || env.reachability.isOffline)
            .accessibilityValue(state.accessibilityValue)
        }
        .padding(.horizontal, Space.gutter).padding(.vertical, 8)
    }

    private func barFill(_ s: DownToggleState) -> AnyShapeStyle {
        switch s {
        case .active, .activePressed: AnyShapeStyle(DTContrastAware(token: .dtFill))
        case .pending(let t): t == .down ? AnyShapeStyle(DTContrastAware(token: .dtFill)) : AnyShapeStyle(Color.downIdle)
        case .waitlisted: AnyShapeStyle(Color.waitlistBg)
        case .closed: AnyShapeStyle(Color.clear)
        default: AnyShapeStyle(Color.downIdle)
        }
    }
    private func barInk(_ s: DownToggleState) -> AnyShapeStyle {
        switch s {
        case .active, .activePressed: AnyShapeStyle(DTContrastAware(token: .onDtFill))
        case .pending(let t): t == .down ? AnyShapeStyle(DTContrastAware(token: .onDtFill)) : AnyShapeStyle(DTStockInk(token: .dtInk))
        case .waitlisted: AnyShapeStyle(Color.warnInk)
        case .closed: AnyShapeStyle(DTStockInk(token: .inkMuted))
        default: AnyShapeStyle(DTStockInk(token: .dtInk))
        }
    }
    private func barStroke(_ s: DownToggleState) -> Color {
        switch s {
        case .active, .activePressed: .clear
        case .waitlisted: .warnInk
        case .closed: .inkFaint
        default: .downIdleRule
        }
    }
}
