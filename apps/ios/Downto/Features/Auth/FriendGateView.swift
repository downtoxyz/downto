// Features/Auth/FriendGateView.swift — add at least one person (ARCHITECTURE §7.1 steps 4–6; DESIGN §7.3).
import SwiftUI

struct FriendGateView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var query = ""
    @State private var results: [PersonRef] = []
    @State private var searchTask: Task<Void, Never>?
    @State private var pinned: Profile?
    @State private var continuing = false
    @FocusState private var focused: Bool

    private var canContinue: Bool { env.friends.hasAnyConnection }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("who are you down with?").dtFont(.display).foregroundStyle(Color.ink).padding(.top, 48)

                VStack(alignment: .leading, spacing: 6) {
                    TextField("", text: $query, prompt: Text("search by name or @username").foregroundStyle(Color.inkFaint))
                        .dtFont(.title).foregroundStyle(Color.ink)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focused)
                        .onChange(of: query) { _, q in search(q) }
                    Rectangle().fill(focused ? Color.dt : Color.ruleMid).frame(height: focused ? 2 : 1).animation(DTSpring.settle, value: focused)
                }

                if let p = pinned, p.id != env.me {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("they sent you here").dtFont(.label).foregroundStyle(.inkMuted)
                        PersonRow(person: PersonRef(id: p.id, displayName: p.displayName, username: p.username, avatarLetter: p.avatarLetter, isMe: false))
                    }
                    .padding(.vertical, 8).padding(.horizontal, 12)
                    .background(Color.checkNew)
                }

                if !results.isEmpty {
                    section("results", results)
                } else if !query.isEmpty {
                    Text("nobody by that name yet").dtFont(.meta).foregroundStyle(Color.inkMuted)
                }

                if !env.friends.friends.isEmpty { section("friends", env.friends.friends) }
                if !env.friends.incoming.isEmpty { section("want to be friends", env.friends.incoming.map(\.person)) }
                if !env.friends.suggestions.isEmpty { section("people you might know", env.friends.suggestions.map(\.person)) }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 140)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                DTButton(title: "CONTINUE →", variant: .primary, size: .buttonLarge, disabled: !canContinue || continuing) {
                    continuing = true
                    Task { await env.profile.setOnboarded(); if !hasSharedCheck { Defaults.showAddGlow = true } }
                }
                if !canContinue {
                    Text("add at least one person — that's the whole point ✶").dtFont(.meta).foregroundStyle(Color.inkMuted)
                }
            }
            .padding(.horizontal, Space.gutter).padding(.bottom, 8)
            .background(Color.paper)
        }
        .task { await loadPinned() }
    }

    private var hasSharedCheck: Bool { Defaults.activeSharedCheckId != nil || env.profile.me?.referredByCheckId != nil }

    private func section(_ title: String, _ people: [PersonRef]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: title, count: people.count)
            ForEach(people, id: \.id) { PersonRow(person: $0) }
        }
    }

    private func search(_ q: String) {
        searchTask?.cancel()
        let trimmed = q.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else { results = []; return }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            let r = await env.friends.search(trimmed)
            guard !Task.isCancelled else { return }
            results = r
        }
    }

    private func loadPinned() async {
        guard let id = Defaults.activeSharedCheckId ?? env.profile.me?.referredByCheckId else { return }
        pinned = try? await env.rpc.sharedCheckAuthor(id)
    }
}

/// 56 pt row: avatar medium, name headline, @username meta, trailing state button (DESIGN §7.3 / §7.12).
struct PersonRow: View {
    let person: PersonRef
    @Environment(AppEnvironment.self) private var env
    @State private var busy = false

    var body: some View {
        HStack(spacing: 12) {
            AvatarLetter(presence: .person(person), size: .medium)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.displayName).dtFont(.headline).foregroundStyle(Color.ink)
                if !person.username.isEmpty { Text("@\(person.username)").dtFont(.meta).foregroundStyle(Color.inkMuted) }
            }
            Spacer()
            trailing
        }
        .frame(minHeight: 56)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }

    @ViewBuilder private var trailing: some View {
        switch env.friends.relationship(with: person.id) {
        case .friends: Text("FRIENDS").dtFont(.button).foregroundStyle(Color.inkMuted)
        case .outgoing: Text("REQUESTED").dtFont(.button).foregroundStyle(Color.inkMuted)
        case .incoming(let f): DTButton(title: "ACCEPT", variant: .text, disabled: busy) { run { await env.friends.accept(f) } }
        case .blocked: Text("BLOCKED").dtFont(.button).foregroundStyle(Color.inkMuted)
        case .none:
            if person.id == env.me { EmptyView() } else { DTButton(title: "ADD", variant: .text, disabled: busy) { run { await env.friends.request(person.id) } } }
        }
    }

    private func run(_ op: @escaping () async -> Void) { busy = true; Task { await op(); busy = false } }
}
