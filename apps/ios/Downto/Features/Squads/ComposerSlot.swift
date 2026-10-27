// Features/Squads/ComposerSlot.swift — the bottom inset: DateConfirmBar + the composer slot that switches on
// (squad.lifecycle, myRole) with the lifecycle strips (DESIGN §4.10 table), plus the @mention picker overlay.
import SwiftUI
import PhotosUI

struct ComposerSlot: View {
    let chat: ChatStore
    @Binding var text: String
    var onSend: (String, [UserID]) -> Void
    var onImage: (Data) -> Void
    var onSetDate: () -> Void

    @Environment(AppEnvironment.self) private var env
    @State private var pickerItem: PhotosPickerItem?
    @State private var showPicker = false
    @State private var mentionIds: [UserID] = []
    @State private var extends = 0
    @State private var revives = 0
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            switch chat.lifecycle {
            case .purged:
                EmptyView()
            case .notMember:
                strip("you're no longer in this squad.")
            case .ended:
                HStack(spacing: 8) {
                    Text("this chat ended.").dtFont(.system).foregroundStyle(.inkMuted)
                    Spacer()
                    Button { revives += 1; Task { await chat.revive() } } label: { Text("REVIVE IT →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                }
                .padding(.horizontal, Space.chatGutter).frame(minHeight: 52).frame(maxWidth: .infinity)
                .background(Color.surface).paperStock(.surface).elevation(.laid)
                .dtFeedback(.success, trigger: revives)
            case .live, .grace, .expiringSoon:
                if chat.myRole == .waitlist {
                    Text("you're on the waitlist — manifesting a spot").dtFont(.system).foregroundStyle(.inkMuted)
                        .frame(minHeight: 44).frame(maxWidth: .infinity).background(Color.waitlistBg)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else {
                    if chat.lifecycle == .grace, !chat.isMysteryLocked { graceStrip }
                    if chat.lifecycle == .expiringSoon { extendStrip }
                    composer
                }
            }
        }
        .animation(DTSpring.page, value: chat.lifecycle)
        .animation(DTSpring.page, value: chat.myRole)
        .overlay(alignment: .top) {
            if let q = mentionQuery, !chat.isMysteryLocked {
                MentionPicker(candidates: chat.mentionable.filter { q.isEmpty || $0.username.hasPrefix(q) || $0.displayName.lowercased().hasPrefix(q) }) { pick in
                    insertMention(pick)
                }
                .alignmentGuide(.top) { $0[.bottom] }
            }
        }
        .photosPicker(isPresented: $showPicker, selection: $pickerItem, matching: .images)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            pickerItem = nil
            Task { if let data = try? await item.loadTransferable(type: Data.self) { onImage(data) } }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 4) {
            if !chat.isMysteryLocked {
                Button { showPicker = true } label: {
                    Image(systemName: "photo").font(.system(size: 20)).foregroundStyle(.inkMuted).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(env.reachability.isOffline)
                .accessibilityLabel("send a photo")
                Text("▲").dtFont(.headline).foregroundStyle(Color.inkFaint).frame(width: 44, height: 44)
                    .accessibilityLabel("poll").accessibilityHint("polls are on web for now")
            }
            TextField("", text: $text, prompt: Text("say something").foregroundStyle(Color.inkFaint), axis: .vertical)
                .accessibilityIdentifier("composer")
                .dtFont(.body)
                .foregroundStyle(Color.ink)
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.rule, lineWidth: 1))
            Button { send() } label: {
                Text("↑").dtFont(.headline).foregroundStyle(DTContrastAware(token: .onDtFill))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(text.trimmingCharacters(in: .whitespaces).isEmpty ? AnyShapeStyle(Color.ruleLight) : AnyShapeStyle(DTContrastAware(token: .dtFill))))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || env.reachability.isOffline)
            .animation(DTSpring.ink, value: text.isEmpty)
            .accessibilityLabel("send")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(Color.surface)
        .paperStock(.surface)
        .elevation(.laid)
    }

    private var graceStrip: some View {
        HStack(spacing: 8) {
            Text(chat.squad?.expiresAt.map { "timer's up · chat ends in \(ChatTime.left($0.timeIntervalSinceNow).replacingOccurrences(of: " left", with: "")) — set a date to keep it" } ?? "timer's up — set a date to keep it")
                .dtFont(.system).foregroundStyle(.inkMuted).lineLimit(2)
            Spacer()
            Button(action: onSetDate) { Text("SET A DATE →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
        }
        .padding(.horizontal, Space.chatGutter).frame(minHeight: 32).frame(maxWidth: .infinity).background(Color.waitlistBg)
    }

    private var extendStrip: some View {
        HStack(spacing: 8) {
            Text(chat.squad?.expiresAt.map { "chat ends in \(max(1, Int($0.timeIntervalSinceNow / 60)))m" } ?? "chat ends soon")
                .dtFont(.system).foregroundStyle(.inkMuted)
            Spacer()
            Button { extends += 1; Task { await chat.extend() } } label: { Text("EXTEND +7 DAYS →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
        }
        .padding(.horizontal, Space.chatGutter).frame(minHeight: 32).frame(maxWidth: .infinity).background(Color.waitlistBg)
        .dtFeedback(.success, trigger: extends)
    }

    private func strip(_ copy: String) -> some View {
        Text(copy).dtFont(.system).foregroundStyle(.inkMuted)
            .frame(minHeight: 52).frame(maxWidth: .infinity).background(Color.surface).paperStock(.surface).elevation(.laid)
    }

    // MARK: Mentions

    /// The "@prefix" token the caret is on (end of text), lowercased, or nil.
    private var mentionQuery: String? {
        guard let at = text.lastIndex(of: "@") else { return nil }
        let tail = text[text.index(after: at)...]
        guard !tail.contains(where: { $0.isWhitespace }) else { return nil }
        if at > text.startIndex, !text[text.index(before: at)].isWhitespace { return nil }
        return tail.lowercased()
    }

    private func insertMention(_ pick: (username: String, displayName: String, id: UserID)) {
        guard let at = text.lastIndex(of: "@") else { return }
        text = String(text[..<at]) + "@\(pick.username) "
        if !mentionIds.contains(pick.id) { mentionIds.append(pick.id) }
    }

    private func send() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let names = Set(t.split(whereSeparator: { $0.isWhitespace }).filter { $0.hasPrefix("@") }.map { String($0.dropFirst()).lowercased() })
        let ids = chat.mentionable.filter { names.contains($0.username.lowercased()) }.map(\.id)
        onSend(t, ids)
        text = ""          // the store clears its draft; the view's text is the source of truth for the field (one-way sync, SquadChatView)
        mentionIds = []
    }
}

/// `Color.deep` list above the composer, rows 40 (DESIGN §4.10).
struct MentionPicker: View {
    let candidates: [(username: String, displayName: String, id: UserID)]
    var onPick: ((username: String, displayName: String, id: UserID)) -> Void
    @State private var picks = 0

    var body: some View {
        if !candidates.isEmpty {
            VStack(spacing: 0) {
                ForEach(candidates.prefix(5), id: \.id) { c in
                    Button { picks += 1; onPick(c) } label: {
                        HStack(spacing: 10) {
                            AvatarLetter(presence: .person(PersonRef(id: c.id, displayName: c.displayName, username: c.username, avatarLetter: String(c.displayName.prefix(1)).uppercased(), isMe: false)), size: .inline)
                            Text(c.displayName).dtFont(.body).foregroundStyle(Color.ink)
                            Text("@\(c.username)").dtFont(.meta).foregroundStyle(.inkMuted)
                            Spacer()
                        }
                        .padding(.horizontal, Space.chatGutter).frame(height: 40).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Color.deep)
            .paperStock(.deep)
            .dtFeedback(.selection, trigger: picks)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

/// "are you still down?" sticky bar above the composer; collapses to the answered strip for 2 s (DESIGN §4.10).
struct DateConfirmBar: View {
    let prompt: DateConfirmPrompt
    var onAnswer: (ConfirmResponse) -> Void
    @State private var answered: ConfirmResponse?
    @State private var hidden = false
    @State private var taps = 0

    var body: some View {
        if !hidden {
            Group {
                if let a = answered ?? prompt.answered {
                    HStack(spacing: 8) {
                        if a == .yes { Text("✓").dtFont(.body).foregroundStyle(.successInk); Text("you're in").dtFont(.bodySmall).foregroundStyle(Color.ink) }
                        else { Text("can't make it").dtFont(.bodySmall).foregroundStyle(.inkMuted) }
                        Spacer()
                    }
                    .padding(.horizontal, Space.chatGutter).frame(height: 32)
                    .overlay(alignment: .leading) { if a == .yes { Rectangle().fill(Color.success).frame(width: 3) } }
                    .task { try? await Task.sleep(for: .seconds(2)); withAnimation(DTSpring.page) { hidden = true } }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("are you still down?").dtFont(.headline).foregroundStyle(Color.ink)
                        Text(ChatTime.dateLine(prompt.date, time: prompt.time)).dtFont(.meta).foregroundStyle(.inkMuted)
                        HStack(spacing: 10) {
                            Button { taps += 1; withAnimation(DTSpring.page) { answered = .yes }; onAnswer(.yes) } label: {
                                Text("STILL DOWN").dtFont(.button).foregroundStyle(DTContrastAware(token: .onDtFill))
                                    .padding(.horizontal, 18).frame(height: 40).background(Capsule().fill(DTContrastAware(token: .dtFill)))
                            }
                            .buttonStyle(.plain)
                            Button { taps += 1; withAnimation(DTSpring.page) { answered = .no }; onAnswer(.no) } label: {
                                Text("CAN'T MAKE IT").dtFont(.button).foregroundStyle(Color.ink)
                                    .padding(.horizontal, 18).frame(height: 40).overlay(Capsule().strokeBorder(Color.ink, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .background(Color.surface)
            .paperStock(.surface)
            .elevation(.laid)
            .dtFeedback(.impact(weight: .medium), trigger: taps)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
