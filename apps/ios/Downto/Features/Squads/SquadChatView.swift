// Features/Squads/SquadChatView.swift — the chat (ARCHITECTURE §7.5, §7.6; DESIGN §4.10, §7.8). Hidden nav bar + ChatHeader in the
// top inset, transcript with the §7.6 scroll contract, DateConfirmBar + ComposerSlot in one bottom inset, "↓" circle floating.
import SwiftUI

struct SquadChatView: View {
    let squadId: SquadID
    @Environment(AppEnvironment.self) private var env
    @State private var chat: ChatStore?
    @State private var text = ""
    @State private var position = ScrollPosition(edge: .bottom)
    @State private var topArmed = true
    @State private var now = Date.now
    @State private var flashId: MessageID?
    @State private var sends = 0
    @State private var successes = 0
    @State private var lastLifecycle: SquadLifecycle = .live
    @State private var keyboardShown = false
    @FocusState private var composerFocused: Bool

    var body: some View {
        Group {
            if let chat { content(chat) } else { Color.paper.ignoresSafeArea() }
        }
        .background(Color.paper.ignoresSafeArea())
        .background(InteractivePopEnabler().frame(width: 0, height: 0))
        .toolbar(.hidden, for: .navigationBar)
        .task(id: squadId) {
            let store = ChatStore(squadId: squadId, env: env)
            chat = store
            text = store.draft
            await withTaskCancellationHandler {
                await store.hydrate()
                await store.markRead()
                env.push.clearBadge()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(30))
                    now = .now
                    store.tick()
                }
            } onCancel: {
                Task { @MainActor in store.teardown() }
            }
        }
        .onChange(of: text) { _, v in chat?.draft = v }
    }

    @ViewBuilder private func content(_ chat: ChatStore) -> some View {
        if chat.lifecycle == .purged {
            VStack {
                ChatHeader(chat: chat, now: now, onBack: pop, onMore: {})
                ErrorColophon(headline: "that squad is gone.", cause: nil, retry: nil)
                DTButton(title: "BACK", variant: .text) { pop() }
                Spacer()
            }
        } else {
            transcript(chat)
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        ChatHeader(chat: chat, now: now, onBack: pop, onMore: { env.router.present(.squadSettings(squadId)) })
                        if let req = chat.joinRequests.first, chat.squad?.createdBy == env.me, !chat.isMysteryLocked || true {
                            JoinRequestBanner(model: JoinRequestModel(requester: requester(req, chat), extraCount: chat.joinRequests.count - 1),
                                              onAccept: { Task { await chat.respondJoinRequest(req.id, accept: true) } },
                                              onDecline: { Task { await chat.respondJoinRequest(req.id, accept: false) } },
                                              onSee: { env.router.present(.squadMembers(squadId)) })
                        }
                        if let q = chat.activePollQuestion, let mid = chat.activePollMessageId {
                            Button { scrollTo(mid) } label: {
                                Text("▲ poll: \(q)").dtFont(.meta).foregroundStyle(Color.ink).lineLimit(1)
                                    .padding(.horizontal, 12).frame(height: 28).background(Capsule().fill(Color.deep))
                            }
                            .buttonStyle(.plain)
                            .padding(.vertical, 6)
                        }
                    }
                    .animation(DTSpring.page, value: chat.joinRequests.count)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    VStack(spacing: 0) {
                        if let p = chat.pendingConfirm, !chat.isMysteryLocked {
                            DateConfirmBar(prompt: p) { r in Task { await chat.confirmDate(r) } }
                        }
                        ComposerSlot(chat: chat, text: $text,
                                     onSend: { t, m in sends += 1; Task { await chat.send(text: t, mentions: m) } },
                                     onImage: { data in Task { await chat.sendImage(data) } },
                                     onSetDate: { env.router.present(.dateProposal(squadId)) })
                    }
                    .dtFeedback(.impact(weight: .medium), trigger: sends)
                }
                .overlay(alignment: .bottomTrailing) {
                    if !chat.scroll.isAtBottom {
                        Button { scrollToBottom(animated: true) } label: {
                            ZStack {
                                Circle().fill(Color.ink).frame(width: 32, height: 32).elevation(.lifted)
                                Text("↓").dtFont(.headline).foregroundStyle(Color.paper)
                                if chat.scroll.unseenCount > 0 {
                                    Text("\(chat.scroll.unseenCount)").dtFont(.badge).foregroundStyle(DTContrastAware(token: .onDtFill))
                                        .padding(.horizontal, 5).frame(height: 16).background(Capsule().fill(DTContrastAware(token: .dtFill)))
                                        .offset(x: 14, y: -14)
                                }
                            }
                            .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 12).padding(.bottom, 8)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                        .accessibilityLabel("scroll to newest")
                    }
                }
                .animation(DTSpring.page, value: chat.scroll.isAtBottom)
                .onChange(of: chat.messages.count) { old, new in
                    guard new > old else { return }
                    if chat.scroll.isAtBottom || chat.messages.last?.id == chat.lastOwnSendId { scrollToBottom(animated: true) }
                }
                .onChange(of: chat.lifecycle) { old, new in
                    if old == .ended, new == .live { successes += 1 }
                    lastLifecycle = new
                }
                .onChange(of: chat.myRole) { old, new in if old == .waitlist, new == .member { successes += 1 } }
                .dtFeedback(.success, trigger: successes)
        }
    }

    private func transcript(_ chat: ChatStore) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if chat.isPaging {
                    RoundedRectangle(cornerRadius: 4).fill(Color.surface).frame(height: 12).padding(.horizontal, 80).padding(.vertical, 6).dtShimmer()
                }
                if chat.phase.isLoading && chat.messages.isEmpty {
                    Skeleton(kind: .chat).padding(.top, 12)
                } else if chat.messages.isEmpty, chat.phase.isSettled {
                    Text("say something. or don't.").dtFont(.system).foregroundStyle(.inkMuted).frame(maxWidth: .infinity).padding(.top, 48)
                }
                if chat.isMysteryLocked, let d = chat.check?.eventDate {
                    SystemMessageRow(text: "guests revealed on \(ChatTime.dateLine(d, time: nil))")
                }
                ForEach(ChatRowBuilder.rows(chat.messages, now: now)) { row in
                    rowView(row, chat)
                        .id(row.id)
                        .background(flashId == row.anchorId ? Color.dtSubtle : Color.clear)
                        .padding(.top, row.topGap)
                        .accessibilityIdentifier("msg-\(row.anchorId)")
                }
                Color.clear.frame(height: Space.scrollBottomExtra)
            }
        }
        .scrollPosition($position)
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
        .scrollEdgeEffectStyle(.hard, for: .top)
        .scrollEdgeEffectStyle(.hard, for: .bottom)
        .onScrollGeometryChange(for: Bool.self) { g in
            g.contentOffset.y + g.containerSize.height >= g.contentSize.height - 24
        } action: { _, atBottom in
            chat.setScrollAtBottom(atBottom)
        }
        .onScrollGeometryChange(for: Bool.self) { g in g.contentOffset.y + g.contentInsets.top <= 80 } action: { _, atTop in
            if atTop, topArmed, chat.hasMoreHistory, !chat.isPaging, chat.phase.isSettled, chat.messages.count >= ChatStore.initialPage / 2 {
                topArmed = false
                Task { await prepend(chat) }
            } else if !atTop {
                topArmed = true
            }
        }
    }

    @ViewBuilder private func rowView(_ row: ChatRowBuilder.Row, _ chat: ChatStore) -> some View {
        switch row.kind {
        case .group(let g):
            MessageGroupRow(group: g) { m in if let id = MessageID.parse(m.id) { Task { await chat.retry(id) } } }
                .contextMenu {
                    ForEach(g.messages) { m in
                        Button { UIPasteboard.general.string = m.text } label: { Label(g.messages.count > 1 ? "Copy \"\(m.text.prefix(20))…\"" : "Copy", systemImage: "doc.on.doc") }
                    }
                    if row.failed, let id = MessageID.parse(g.messages.last?.id ?? "") {
                        Button(role: .destructive) { chat.discard(id) } label: { Label("Discard", systemImage: "trash") }
                    }
                }
        case .image(let m):
            ImageMessageRow(message: m, chat: chat)
        case .system(let text, let name):
            SystemMessageRow(text: text, highlightedName: name)
                .transition(.opacity.combined(with: .offset(y: 6)))
        case .dateConfirm(let model):
            DateConfirmCard(model: model).padding(.vertical, 8)
        case .poll(let q):
            PollPlaceholderRow(question: q) {
                UIPasteboard.general.string = AppConfig.webBase.appending(queryItems: [.init(name: "tab", value: "squads"), .init(name: "squadId", value: squadId.description)]).absoluteString
                env.toasts.show("link copied ✶")
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: Scroll contract (§7.6)

    private func scrollToBottom(animated: Bool) {
        if animated { withAnimation(.smooth(duration: 0.25)) { position.scrollTo(edge: .bottom) } } else { position.scrollTo(edge: .bottom) }
    }

    private func scrollTo(_ id: MessageID) {
        withAnimation(DTSpring.page) { position.scrollTo(id: ChatRowBuilder.rowId(for: id), anchor: .center) }
        flashId = id
        Task { try? await Task.sleep(for: .milliseconds(600)); if flashId == id { flashId = nil } }
    }

    /// Prepend 100 older rows without a jump: anchor the previously-topmost row with no animation.
    private func prepend(_ chat: ChatStore) async {
        guard let anchor = chat.messages.first?.id else { return }
        let n = await chat.loadOlder()
        guard n > 0 else { return }
        var t = Transaction(animation: nil)
        t.disablesAnimations = true
        withTransaction(t) { position.scrollTo(id: ChatRowBuilder.rowId(for: anchor), anchor: .top) }
    }

    private func pop() {
        composerFocused = false
        if !env.router.squadPath.isEmpty { env.router.squadPath.removeLast() }
    }

    private func requester(_ req: SquadJoinRequest, _ chat: ChatStore) -> Presence {
        if chat.isMysteryLocked { return .masked(kaomoji: Censor.kaomojiForUser(threadSeed: squadId.description, userId: req.userId), scramble: Censor.wingdings(seed: "\(squadId)::\(req.userId)")) }
        if let p = env.squads.raw.profiles[req.userId] ?? env.friends.raw.profiles[req.userId] {
            return .person(PersonRef(id: p.id, displayName: p.displayName, username: p.username, avatarLetter: p.avatarLetter, isMe: false))
        }
        return .person(PersonRef(id: req.userId, displayName: "someone", username: "", avatarLetter: "?", isMe: false))
    }
}

extension MessageID {
    nonisolated static func parse(_ s: String) -> MessageID? { UUID(uuidString: s).map(MessageID.init) }
}

/// Groups consecutive text messages (same sender, `isGroupStart == false`) into `ChatGroupModel`s; everything else is its own row.
nonisolated enum ChatRowBuilder {
    enum Kind: Hashable {
        case group(ChatGroupModel)
        case image(ChatMessageDisplay)
        case system(String, highlightedName: String?)
        case dateConfirm(DateConfirmModel)
        case poll(String)
    }
    struct Row: Identifiable, Hashable {
        let id: String
        let anchorId: MessageID
        let kind: Kind
        let topGap: CGFloat
        let failed: Bool
    }

    static func rowId(for id: MessageID) -> String { "r:\(id)" }

    static func rows(_ messages: [ChatMessageDisplay], now: Date) -> [Row] {
        var out: [Row] = []
        var i = 0
        while i < messages.count {
            let m = messages[i]
            switch m.kind {
            case .text:
                var group: [ChatGroupModel.Message] = []
                var j = i
                var anyFailed = false
                while j < messages.count, case .text = messages[j].kind, j == i || !messages[j].isGroupStart {
                    let d = messages[j]
                    group.append(.init(id: d.id.description, text: d.plainText ?? "", mentions: d.mentionNames, delivery: delivery(d.delivery)))
                    if d.delivery == .failed { anyFailed = true }
                    j += 1
                }
                let model = ChatGroupModel(id: rowId(for: m.id), sender: m.sender ?? .person(PersonRef(id: UserID(UUID()), displayName: "someone", username: "", avatarLetter: "?", isMe: false)),
                                           timestamp: ChatTime.short(m.createdAt, now: now), messages: group)
                out.append(Row(id: rowId(for: m.id), anchorId: m.id, kind: .group(model), topGap: out.isEmpty ? 8 : 16, failed: anyFailed))
                i = j
            case .image:
                out.append(Row(id: rowId(for: m.id), anchorId: m.id, kind: .image(m), topGap: out.isEmpty ? 8 : (m.isGroupStart ? 16 : 4), failed: m.delivery == .failed))
                i += 1
            case .system(let text):
                out.append(Row(id: rowId(for: m.id), anchorId: m.id, kind: .system(text, highlightedName: nil), topGap: 0, failed: false))
                i += 1
            case .dateConfirm(let date, let time, let responses):
                let proposer = m.sender?.label ?? "someone"
                let rows = responses.map { DateConfirmModel.Row(name: $0.person.label, isMe: $0.person.isMe, answer: $0.response == .yes ? .yes : $0.response == .no ? .no : .waiting) }
                let locked = responses.allSatisfy { $0.response != nil } && responses.contains { $0.response == .yes }
                out.append(Row(id: rowId(for: m.id), anchorId: m.id, kind: .dateConfirm(DateConfirmModel(proposer: proposer, dateText: ChatTime.dateLine(date, time: time), rows: rows, locked: locked)), topGap: 8, failed: false))
                i += 1
            case .pollPlaceholder(let q):
                out.append(Row(id: rowId(for: m.id), anchorId: m.id, kind: .poll(q), topGap: 8, failed: false))
                i += 1
            case .unknown:
                i += 1
            }
        }
        return out
    }

    private static func delivery(_ d: ChatMessageDisplay.Delivery) -> ChatGroupModel.Message.Delivery {
        switch d { case .sent: .sent; case .sending: .sending; case .failed: .failed }
    }
}

/// Image row: max 240 wide at the stored aspect, radius 12, 1 pt rule; tap → full-screen viewer (DESIGN §4.10).
struct ImageMessageRow: View {
    let message: ChatMessageDisplay
    let chat: ChatStore
    @Environment(AppEnvironment.self) private var env
    @State private var image: UIImage?
    @State private var failedLoad = false

    private var size: CGSize {
        guard case .image(_, let w, let h) = message.kind, w > 0, h > 0 else { return CGSize(width: 240, height: 180) }
        let width: CGFloat = 240
        return CGSize(width: width, height: width * CGFloat(h) / CGFloat(w))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if message.isGroupStart, let s = message.sender {
                HStack(spacing: 8) {
                    AvatarLetter(presence: s, size: .inline, ring: nil)
                    Text(s.isMasked ? "hidden member" : s.label).dtFont(.label).foregroundStyle(message.isMine ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .dtInk)))
                    Text("·").dtFont(.meta).foregroundStyle(Color.inkFaint)
                    Text(ChatTime.short(message.createdAt)).dtFont(.meta).foregroundStyle(.inkMuted)
                }
            }
            ZStack {
                RoundedRectangle(cornerRadius: Radius.m).fill(Color.surface)
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else if !failedLoad {
                    Color.clear.dtShimmer()
                }
            }
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: Radius.m))
            .overlay(RoundedRectangle(cornerRadius: Radius.m).strokeBorder(Color.rule, lineWidth: 1))
            .overlay(alignment: .bottom) {
                if message.delivery == .sending { Rectangle().fill(Color.dt).frame(height: 2).dtShimmer() }
                if message.delivery == .failed { Rectangle().fill(Color.danger).frame(height: 2) }
            }
            .opacity(message.delivery == .sent ? 1 : 0.6)
            .onTapGesture { open() }
            .accessibilityLabel("image from \(message.sender?.label ?? "someone")\(message.delivery == .sending ? ", sending" : message.delivery == .failed ? ", failed to send" : "")")
            if message.delivery == .failed {
                HStack(spacing: 0) {
                    Text("didn't send").dtFont(.meta).foregroundStyle(.dangerInk)
                    Text(" · ").dtFont(.meta).foregroundStyle(Color.inkFaint)
                    Button { Task { await chat.retry(message.id) } } label: { Text("RETRY").dtFont(.meta, face: .plex(.medium)).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                    Text(" · ").dtFont(.meta).foregroundStyle(Color.inkFaint)
                    Button { chat.discard(message.id) } label: { Text("DISCARD").dtFont(.meta, face: .plex(.medium)).foregroundStyle(.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, Space.chatGutter)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(message.isMine ? Color.dtFaint : Color.clear)
        .overlay(alignment: .leading) { if message.isMine { Rectangle().fill(Color.dt).frame(width: 2).padding(.leading, 8) } }
        .contextMenu {
            if let image { Button { UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil) } label: { Label("Copy image", systemImage: "square.and.arrow.down") } }
        }
        .task(id: message.id) { await load() }
    }

    private func load() async {
        guard case .image(let path, _, _) = message.kind else { return }
        if path.hasPrefix("local:"), let data = chat.localImages[message.id] { image = UIImage(data: data); return }
        do { image = UIImage(data: try await env.images.chatImageData(path: path)) } catch { failedLoad = true }
    }

    private func open() {
        guard case .image(let path, _, _) = message.kind, !path.hasPrefix("local:") else { return }
        Task {
            if let url = try? await env.images.chatImageURL(path: path) { env.router.cover = .imageViewer(url) }
        }
    }
}
