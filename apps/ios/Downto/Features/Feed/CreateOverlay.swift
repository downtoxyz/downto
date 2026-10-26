// Features/Feed/CreateOverlay.swift — Create ("+") as a root overlay, IDEA tab only in M1 (DESIGN §7.6, §7.0; ARCHITECTURE §15).
// Display-size editor, setting chips with inline expanders (WHEN / WHERE / TIMER / SQUAD / MYSTERY), @mention co-authors,
// draft persistence, POST. `.first` mode is FirstCheckView's "skip for now" variant (DESIGN §7.3).
import SwiftUI

nonisolated enum CreateMode: Sendable {
    case normal
    /// FirstCheck: "skip for now" top-right; onPosted after the first successful createCheck.
    case first(onSkip: @Sendable @MainActor () -> Void, onPosted: @Sendable @MainActor () -> Void)

    var isFirst: Bool { if case .first = self { true } else { false } }
}

struct CreateOverlay: View {
    let mode: CreateMode
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dtReduceMotion) private var reduceMotion
    @State private var text = ""
    @State private var when = WhenParse()
    @State private var location = ""
    @State private var timerHours: Int? = 24
    @State private var squadSize: Int? = nil
    @State private var mystery = false
    @State private var coAuthors: [PersonRef] = []
    @State private var expanded: Chip?
    @State private var posting = false
    @State private var confirm: DTConfirm?
    @State private var dragY: CGFloat = 0
    @State private var draftRestored = false
    @State private var mentionQuery: String?
    @State private var mentionResults: [PersonRef] = []
    @State private var mentionTask: Task<Void, Never>?
    @State private var successes = 0
    @FocusState private var editorFocused: Bool

    enum Chip: Hashable { case when, `where`, timer, squad, mystery }

    private var draftKey: String { "dt.createDraft.\(env.me?.description ?? "anon")" }
    private var mysteryReady: Bool { !mystery || (when.date != nil && !location.trimmingCharacters(in: .whitespaces).isEmpty) }
    private var canPost: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && mysteryReady && !posting && !env.reachability.isOffline }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if draftRestored { Text("draft restored").dtFont(.meta).foregroundStyle(.inkMuted) }
                    editor
                    if let q = mentionQuery, !mentionResults.isEmpty { mentionList(q) }
                    chips
                    if let expanded { expander(expanded).transition(.opacity.combined(with: .move(edge: .top))) }
                    if !coAuthors.isEmpty { coAuthorRow }
                    Color.clear.frame(height: 80)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.top, 16)
                .animation(DTSpring.page, value: expanded)
                .animation(DTSpring.page, value: mentionResults)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.surface.ignoresSafeArea())
        .paperStock(.surface)
        .overlay { if mystery { MysteryFrame().padding(8).allowsHitTesting(false) } }
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: mode.isFirst ? 0 : Radius.sheet, topTrailingRadius: mode.isFirst ? 0 : Radius.sheet))
        .elevation(.laid)
        .dtGrain()
        .offset(y: dragY)
        .gesture(dismissDrag)
        .safeAreaInset(edge: .bottom) { postBar }
        .dtConfirmDialog($confirm) { a in if a.title == "discard" { close(discard: true) } }
        .dtFeedback(.success, trigger: successes)
        .onAppear { restoreDraft(); editorFocused = true }
        .onChange(of: text) { _, v in persistDraft(); detectMention(v) }
        .onChange(of: location) { _, _ in persistDraft() }
        .onChange(of: when.text) { _, _ in persistDraft() }
        .onChange(of: env.router.createPrefill) { _, p in applyPrefill(p) }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: Pieces

    private var header: some View {
        HStack {
            Text("IDEA").dtFont(.label).foregroundStyle(Color.ink)
                .overlay(alignment: .bottom) { Rectangle().fill(Color.dt).frame(height: 2).offset(y: 6) }
            Spacer()
            if case .first(let onSkip, _) = mode {
                Button { onSkip() } label: { Text("skip for now").dtFont(.meta).foregroundStyle(.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
            } else {
                Button { askToClose() } label: {
                    Text("+").dtFont(.display).foregroundStyle(Color.ink).rotationEffect(.degrees(45)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("close")
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 12)
        .frame(minHeight: 52)
    }

    private var editor: some View {
        TextField("", text: $text, prompt: Text("who's down for…").foregroundStyle(Color.inkFaint), axis: .vertical)
            .dtFont(.display).foregroundStyle(Color.ink)
            .lineLimit(1...8)
            .focused($editorFocused)
            .textInputAutocapitalization(.never)
            .accessibilityLabel("check text")
    }

    private func mentionList(_ q: String) -> some View {
        VStack(spacing: 0) {
            ForEach(mentionResults, id: \.id) { p in
                Button { pickMention(p) } label: {
                    HStack(spacing: 10) {
                        AvatarLetter(presence: .person(p), size: .inline)
                        Text(p.displayName).dtFont(.bodySmall).foregroundStyle(Color.ink)
                        Text("@\(p.username)").dtFont(.meta).foregroundStyle(.inkMuted)
                        Spacer()
                    }
                    .padding(.horizontal, 12).frame(height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(Radius.shape(Radius.m).fill(Color.deep))
        .paperStock(.deep)
    }

    private var chips: some View {
        FlowLayout(spacing: 6) {
            chip(.when, "WHEN · \(when.isEmpty ? "—" : (when.preview(calendar: .current)?.dropFirst(2).description ?? when.text))")
            chip(.where, "WHERE · \(location.isEmpty ? "—" : location)")
            chip(.timer, "TIMER · \(timerHours.map { "\($0)H" } ?? "∞")")
            chip(.squad, "SQUAD · \(squadSize.map(String.init) ?? "∞")")
            chip(.mystery, "MYSTERY · \(mystery ? "ON" : "OFF")")
        }
    }

    private func chip(_ c: Chip, _ label: String) -> some View {
        Pill(text: label, style: .setting, selected: expanded == c) {
            withAnimation(DTSpring.page) { expanded = expanded == c ? nil : c }
        }
    }

    @ViewBuilder private func expander(_ c: Chip) -> some View {
        switch c {
        case .when: WhenField(parse: $when)
        case .where:
            VStack(alignment: .leading, spacing: 6) {
                TextField("", text: $location, prompt: Text("where").foregroundStyle(Color.inkFaint)).dtFont(.body).foregroundStyle(Color.ink)
                Rectangle().fill(Color.ruleMid).frame(height: 1)
            }
        case .timer: segmented([1, 4, 12, 24, nil], selection: $timerHours, label: { $0.map { "\($0)H" } ?? "∞" })
        case .squad:
            HStack(spacing: 16) {
                Text(squadSize.map(String.init) ?? "∞").dtFont(.numeral, size: 28).foregroundStyle(Color.ink).contentTransition(.numericText()).frame(minWidth: 40)
                segmented([3, 4, 5, 6, 8, nil], selection: $squadSize, label: { $0.map(String.init) ?? "∞" })
            }
        case .mystery:
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: $mystery) {
                    HStack(spacing: 8) {
                        if let me = env.me { AvatarLetter(presence: .masked(kaomoji: Censor.kaomoji(seed: me.description), scramble: ""), size: .small) }
                        Text("hidden host. guests revealed on the day. needs a date + place.").dtFont(.bodySmall).foregroundStyle(Color.ink)
                    }
                }
                .tint(Color.dt)
            }
        }
    }

    private func segmented<T: Hashable>(_ options: [T?], selection: Binding<T?>, label: @escaping (T?) -> String) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, o in
                let on = selection.wrappedValue == o
                Button { withAnimation(DTSpring.snap) { selection.wrappedValue = o } } label: {
                    Text(label(o)).dtFont(.label)
                        .foregroundStyle(on ? AnyShapeStyle(Color.onDt) : AnyShapeStyle(Color.ink))
                        .frame(maxWidth: .infinity).frame(height: 32)
                        .background(Capsule().fill(on ? Color.dt : Color.paper))
                        .overlay(Capsule().strokeBorder(on ? Color.clear : Color.rule, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .dtFeedback(.selection, trigger: selection.wrappedValue)
    }

    private var coAuthorRow: some View {
        FlowLayout(spacing: 6) {
            ForEach(coAuthors, id: \.id) { p in
                HStack(spacing: 4) {
                    Pill(text: "@\(p.username)", style: .mention)
                    Button { coAuthors.removeAll { $0.id == p.id } } label: { Text("×").dtFont(.meta).foregroundStyle(.inkMuted).frame(width: 24, height: 24) }.buttonStyle(.plain)
                }
            }
        }
    }

    private var postBar: some View {
        VStack(spacing: 0) {
            DTButton(title: posting ? "POSTING" : env.reachability.isOffline ? "NO CONNECTION" : mysteryReady ? "POST →" : "NEEDS A DATE + PLACE",
                     variant: .primary, size: .buttonLarge, disabled: !canPost) { Task { await post() } }
                .padding(.horizontal, Space.gutter).padding(.vertical, 8)
        }
        .background(Color.surface)
    }

    // MARK: Behaviour

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { v in if !mode.isFirst, v.translation.height > 0, !editorFocused { dragY = v.translation.height * 0.6 } }
            .onEnded { v in
                guard !mode.isFirst else { return }
                if v.translation.height >= 80 || v.predictedEndTranslation.height > 240 { askToClose() }
                withAnimation(DTSpring.snap) { dragY = 0 }
            }
    }

    private func askToClose() {
        if text.trimmingCharacters(in: .whitespaces).isEmpty { close(discard: true); return }
        confirm = DTConfirm("discard this check?", actions: [.init("discard", destructive: true)])
    }

    private func close(discard: Bool) {
        if discard { clearDraft() }
        editorFocused = false
        withAnimation(DTSpring.page) { env.router.isCreateOpen = false }
        env.router.createPrefill = nil
    }

    private func post() async {
        guard canPost else { return }
        posting = true
        defer { posting = false }
        let draft = CheckDraft(text: text, eventDate: when.date, eventDateLabel: when.label, eventTime: when.time, dateFlexible: when.dateFlexible,
                               timeFlexible: when.timeFlexible, location: location.trimmingCharacters(in: .whitespaces),
                               timerHours: timerHours, maxSquadSize: squadSize, mystery: mystery, coAuthorIds: coAuthors.map(\.id))
        do {
            _ = try await env.feed.createCheck(draft)
            successes += 1
            clearDraft()
            text = ""; when = WhenParse(); location = ""; coAuthors = []; mystery = false
            if case .first(_, let onPosted) = mode { onPosted() } else { close(discard: false) }
        } catch {
            env.toasts.show("didn't post — try again", style: .error, action: .retry, actionTitle: "RETRY")
        }
    }

    private func applyPrefill(_ p: CreatePrefill?) {
        guard let p else { return }
        if let t = p.text { text = t }
        if let w = p.when { when = WhenParse.parse(w, now: .now, calendar: .current, dateFlexible: false, timeFlexible: false) }
        if let l = p.location { location = l }
    }

    // Drafts survive a kill (DESIGN §7.6 "post failure").
    private func persistDraft() {
        let d = ["text": text, "when": when.text, "where": location]
        UserDefaults.standard.set(d, forKey: draftKey)
    }
    private func restoreDraft() {
        applyPrefill(env.router.createPrefill)
        guard text.isEmpty, let d = UserDefaults.standard.dictionary(forKey: draftKey) as? [String: String], let t = d["text"], !t.isEmpty else { return }
        text = t
        location = d["where"] ?? ""
        if let w = d["when"], !w.isEmpty { when = WhenParse.parse(w, now: .now, calendar: .current, dateFlexible: false, timeFlexible: false) }
        draftRestored = true
    }
    private func clearDraft() { UserDefaults.standard.removeObject(forKey: draftKey); draftRestored = false }

    // @mention autocomplete → co-authors (DESIGN §7.6).
    private func detectMention(_ v: String) {
        guard let at = v.lastIndex(of: "@") else { mentionQuery = nil; mentionResults = []; return }
        let tail = v[v.index(after: at)...]
        guard !tail.contains(" "), tail.count >= 1 else { mentionQuery = nil; mentionResults = []; return }
        let q = String(tail).lowercased()
        mentionQuery = q
        mentionTask?.cancel()
        let local = env.friends.friends.filter { $0.username.hasPrefix(q) || $0.displayName.lowercased().hasPrefix(q) }
        mentionResults = Array(local.prefix(5))
        mentionTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            let r = await env.friends.search(q)
            guard !Task.isCancelled, mentionQuery == q else { return }
            var merged = local
            for p in r where !merged.contains(where: { $0.id == p.id }) { merged.append(p) }
            mentionResults = Array(merged.prefix(5))
        }
    }

    private func pickMention(_ p: PersonRef) {
        if let at = text.lastIndex(of: "@") { text = String(text[..<at]) + "@\(p.username) " }
        if !coAuthors.contains(where: { $0.id == p.id }) { coAuthors.append(p) }
        mentionQuery = nil
        mentionResults = []
    }
}
