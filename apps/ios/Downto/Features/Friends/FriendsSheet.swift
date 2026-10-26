// Features/Friends/FriendsSheet.swift — FRIENDS / ADD (DESIGN §7.12; ARCHITECTURE §15 "Friends").
import SwiftUI

struct FriendsSheet: View {
    let initialTab: FriendsTab
    @Environment(AppEnvironment.self) private var env
    @State private var tab: FriendsTab = .friends
    @State private var filter = ""
    @State private var query = ""
    @State private var results: [PersonRef] = []
    @State private var searching = false
    @State private var searchTask: Task<Void, Never>?
    @State private var inviteURL: URL?
    @State private var makingLink = false
    @State private var showAllSuggestions = false
    @State private var cancelConfirm: DTConfirm?
    @State private var cancelTarget: FriendshipID?
    @State private var tabTaps = 0
    @Namespace private var underline
    @FocusState private var focus: Field?
    enum Field { case filter, search }

    var body: some View {
        DTSheetShell(title: "friends") {
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 20) {
                    tabLabel("FRIENDS", .friends, dot: false)
                    tabLabel("ADD", .add, dot: !env.friends.incoming.isEmpty)
                    Spacer()
                    Text("· \(env.friends.friends.count)").dtFont(.meta).foregroundStyle(.inkMuted).dtNumeric(env.friends.friends.count)
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.bottom, 12)
                .dtFeedback(.selection, trigger: tabTaps)

                ScrollView {
                    switch tab {
                    case .friends: friendsTab
                    case .add: addTab
                    }
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .onAppear { tab = initialTab }
        .task { if !env.friends.phase.isSettled { await env.friends.hydrate() } }
        .dtConfirmDialog($cancelConfirm) { _ in
            if let f = cancelTarget { Task { await env.friends.cancel(f) } }
        }
    }

    private func tabLabel(_ title: String, _ t: FriendsTab, dot: Bool) -> some View {
        Button {
            tabTaps += 1
            withAnimation(DTSpring.page) { tab = t }
        } label: {
            HStack(spacing: 6) {
                Text(title).dtFont(.label).foregroundStyle(tab == t ? AnyShapeStyle(Color.ink) : AnyShapeStyle(.inkMuted))
                if dot { NotificationDot() }
            }
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) {
                if tab == t { Rectangle().fill(Color.dt).frame(height: 2).matchedGeometryEffect(id: "friends-tab", in: underline) }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(tab == t ? [.isSelected] : [])
    }

    // MARK: FRIENDS

    private var friendsTab: some View {
        VStack(alignment: .leading, spacing: 0) {
            baselineField("filter", text: $filter, field: .filter)
                .padding(.horizontal, Space.sheetGutter)
                .padding(.bottom, 8)
            let list = env.friends.friends.filter { filter.isEmpty || $0.displayName.localizedCaseInsensitiveContains(filter) || $0.username.localizedCaseInsensitiveContains(filter) }
            if env.friends.friends.isEmpty {
                EmptyState(headline: "no friends yet. brutal.", line: "add some and the feed fills up", cta: "ADD SOME →") {
                    withAnimation(DTSpring.page) { tab = .add }
                }
                .padding(.top, 24)
            } else if list.isEmpty {
                Text("nobody matches").dtFont(.system).foregroundStyle(.inkMuted).padding(Space.sheetGutter)
            } else {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, p in
                    FriendRow(person: p, availability: env.friends.availability(of: p.id)) { env.router.present(.userProfile(p.id)) }
                        .padding(.horizontal, Space.sheetGutter)
                        .dtStaggered(i)
                }
            }
            Color.clear.frame(height: 24)
        }
    }

    // MARK: ADD

    private var addTab: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 1. Search
            VStack(alignment: .leading, spacing: 8) {
                baselineField("name or @username", text: $query, field: .search, shimmer: searching)
                    .onChange(of: query) { _, q in search(q) }
                if !results.isEmpty {
                    ForEach(results, id: \.id) { PersonRow(person: $0) }
                } else if query.trimmingCharacters(in: .whitespaces).count >= 2, !searching {
                    Text("nobody by that name").dtFont(.system).foregroundStyle(.inkMuted).padding(.vertical, 8)
                }
            }
            .padding(.horizontal, Space.sheetGutter)
            .dtStaggered(0)

            // 2. Invite link
            block("invite link", index: 1) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("invite by link").dtFont(.bodySmall).foregroundStyle(Color.ink)
                        Text("one use · 24h").dtFont(.meta).foregroundStyle(.inkMuted)
                    }
                    Spacer()
                    if let url = inviteURL {
                        ShareLink(item: url, message: Text("add me on down to")) {
                            Text("SHARE →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44)
                        }
                        .simultaneousGesture(TapGesture().onEnded { shares += 1 })
                    } else {
                        Button {
                            makingLink = true
                            Task { inviteURL = await env.friends.createInviteLink(); makingLink = false }
                        } label: {
                            Text(makingLink ? "MAKING LINK…" : "MAKE LINK →").dtFont(.button)
                                .foregroundStyle(makingLink ? AnyShapeStyle(.inkMuted) : AnyShapeStyle(.dtInk)).frame(minHeight: 44)
                        }
                        .buttonStyle(.plain).disabled(makingLink)
                    }
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
                .background(RoundedRectangle(cornerRadius: Radius.m).fill(Color.deep))
                .dtFeedback(.impact(flexibility: .rigid), trigger: shares)
            }

            // 3. Requests + sent
            if !env.friends.incoming.isEmpty {
                block("requests", count: env.friends.incoming.count, index: 2) {
                    VStack(spacing: 0) { ForEach(env.friends.incoming) { FriendRequestRow(request: $0) } }
                        .background(Color.checkNew)
                        .padding(.horizontal, -Space.sheetGutter)
                }
            }
            if !env.friends.outgoing.isEmpty {
                block("sent", index: 3) {
                    ForEach(env.friends.outgoing) { r in
                        Button {
                            cancelTarget = r.id
                            cancelConfirm = DTConfirm("cancel the request to \(r.person.displayName)?", actions: [.init("CANCEL REQUEST", destructive: true)])
                        } label: {
                            HStack(spacing: 12) {
                                AvatarLetter(presence: .person(r.person), size: .medium)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.person.displayName).dtFont(.headline).foregroundStyle(Color.ink)
                                    if !r.person.username.isEmpty { Text("@\(r.person.username)").dtFont(.meta).foregroundStyle(.inkMuted) }
                                }
                                Spacer()
                                Text("REQUESTED").dtFont(.button).foregroundStyle(.inkMuted)
                            }
                            .frame(minHeight: 56).contentShape(Rectangle())
                        }
                        .buttonStyle(DTPressStyle())
                        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
                    }
                }
            }

            // 4. People you may know
            if !env.friends.suggestions.isEmpty {
                block("people you may know", index: 4) {
                    let all = env.friends.suggestions
                    let shown = showAllSuggestions ? all : Array(all.prefix(10))
                    ForEach(shown) { s in SuggestionRow(suggestion: s) }
                    if all.count > 10 && !showAllSuggestions {
                        DTButton(title: "MORE", variant: .text) { withAnimation(DTSpring.page) { showAllSuggestions = true } }
                    }
                }
            }
            Color.clear.frame(height: 24)
        }
    }

    @State private var shares = 0

    private func block<Content: View>(_ title: String, count: Int? = nil, index: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: title, count: count).padding(.leading, Space.sheetGutter - Space.gutter)
            content().padding(.horizontal, Space.sheetGutter)
        }
        .dtStaggered(index)
    }

    private func baselineField(_ prompt: String, text: Binding<String>, field: Field, shimmer: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("", text: text, prompt: Text(prompt).foregroundStyle(Color.inkFaint))
                .dtFont(.body).foregroundStyle(Color.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .focused($focus, equals: field)
                .frame(minHeight: 32)
            Rectangle().fill(focus == field ? Color.dt : Color.ruleMid).frame(height: focus == field ? 2 : 1)
                .animation(DTSpring.settle, value: focus)
        }
    }

    private func search(_ q: String) {
        searchTask?.cancel()
        guard q.trimmingCharacters(in: .whitespaces).count >= 2 else { results = []; searching = false; return }
        searching = true
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            let r = await env.friends.search(q)
            guard !Task.isCancelled else { return }
            results = r
            searching = false
        }
    }
}
