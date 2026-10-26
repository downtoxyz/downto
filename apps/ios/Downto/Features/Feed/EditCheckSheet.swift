// Features/Feed/EditCheckSheet.swift — the EditCheck sheet (DESIGN §7.5 "EditCheck sheet"): text, WHEN/WHERE, co-authors,
// read-only TIMER / SQUAD / MYSTERY rows, SHARE CHECK (ShareLink after markShared), DELETE CHECK (archive + undo slip), pinned SAVE.
import SwiftUI

struct EditCheckSheet: View {
    let checkId: CheckID
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var when = WhenParse()
    @State private var location = ""
    @State private var coAuthors: [PersonRef] = []
    @State private var tagQuery = ""
    @State private var tagResults: [PersonRef] = []
    @State private var showTag = false
    @State private var saving = false
    @State private var loaded = false
    @State private var confirm: DTConfirm?
    @State private var shareURL: URL?

    private var check: FeedCheck? { env.feed.items.compactMap(\.check).first { $0.id == checkId } ?? env.feed.hidden.first { $0.id == checkId } }
    private var raw: InterestCheck? { env.feed.raw.checks[checkId] }
    private var isAuthor: Bool { raw?.authorId == env.me }
    private var mysteryReady: Bool { !(raw?.mystery ?? false) || (when.date != nil && !location.trimmingCharacters(in: .whitespaces).isEmpty) }
    private var isDirty: Bool {
        guard let r = raw else { return false }
        return text != r.text || location != (r.location ?? "") || when.date != r.eventDate || when.time != r.eventTime
            || when.dateFlexible != r.dateFlexible || when.timeFlexible != r.timeFlexible
            || Set(coAuthors.map(\.id)) != Set(env.feed.raw.coAuthors.values.filter { $0.checkId == checkId && $0.status != .declined }.map(\.userId))
    }

    var body: some View {
        DTSheetShell(title: "edit") {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    TextField("", text: $text, axis: .vertical).dtFont(.display).foregroundStyle(Color.ink).lineLimit(1...8).dtStaggered(0)
                    VStack(alignment: .leading, spacing: 20) {
                        SectionLabel(text: "when")
                        WhenField(parse: $when)
                        SectionLabel(text: "where")
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("", text: $location, prompt: Text("where").foregroundStyle(Color.inkFaint)).dtFont(.body).foregroundStyle(Color.ink)
                            Rectangle().fill(Color.ruleMid).frame(height: 1)
                        }
                    }
                    .dtStaggered(1)
                    if isAuthor { coAuthorBlock.dtStaggered(2) }
                    readOnlyRows.dtStaggered(3)
                    if isAuthor { shareAndDelete.dtStaggered(4) }
                    Color.clear.frame(height: 80)
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom) {
            DTButton(title: saving ? "SAVING" : mysteryReady ? "SAVE" : "NEEDS A DATE + PLACE", variant: .primary, size: .buttonLarge, disabled: saving || !isDirty || !mysteryReady) {
                Task { await save() }
            }
            .padding(.horizontal, Space.sheetGutter).padding(.vertical, 8)
            .background(Color.surface)
        }
        .interactiveDismissDisabled(isDirty)
        .dtConfirmDialog($confirm) { a in
            if a.title == "delete" { Task { if await env.feed.archive(checkId) { dismiss() } } }
            if a.title == "discard" { dismiss() }
        }
        .onAppear { load() }
        .onChange(of: tagQuery) { _, q in search(q) }
    }

    private func load() {
        guard !loaded, let r = raw else { return }
        loaded = true
        text = r.text
        location = r.location ?? ""
        when = WhenParse.parse([r.eventDateLabel ?? r.eventDate.map { DateParse.label($0.startOfDay(in: .current), calendar: .current) }, r.eventTime].compactMap { $0 }.joined(separator: " "),
                               now: .now, calendar: .current, dateFlexible: r.dateFlexible, timeFlexible: r.timeFlexible)
        when.date = r.eventDate; when.time = r.eventTime; when.label = r.eventDateLabel; when.error = false
        coAuthors = check?.coAuthors.compactMap { if case .person(let p) = $0.person { p } else { nil } } ?? []
    }

    private var coAuthorBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "co-authors")
            FlowLayout(spacing: 6) {
                ForEach(coAuthors, id: \.id) { p in
                    let pending = check?.coAuthors.first { if case .person(let q) = $0.person { q.id == p.id } else { false } }?.status == .pending
                    HStack(spacing: 4) {
                        Pill(text: "@\(p.username)\(pending ? " · pending" : "")", style: .mention)
                        Button { coAuthors.removeAll { $0.id == p.id } } label: { Text("×").dtFont(.meta).foregroundStyle(.inkMuted).frame(width: 24, height: 24) }.buttonStyle(.plain)
                    }
                }
                Button { withAnimation(DTSpring.page) { showTag.toggle() } } label: { Text("+ TAG SOMEONE").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 32) }.buttonStyle(.plain)
            }
            if showTag {
                TextField("", text: $tagQuery, prompt: Text("search friends").foregroundStyle(Color.inkFaint)).dtFont(.body).foregroundStyle(Color.ink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Rectangle().fill(Color.ruleMid).frame(height: 1)
                ForEach(tagResults, id: \.id) { p in
                    Button { coAuthors.append(p); tagQuery = ""; tagResults = []; showTag = false } label: {
                        HStack(spacing: 10) { AvatarLetter(presence: .person(p), size: .inline); Text(p.displayName).dtFont(.bodySmall).foregroundStyle(Color.ink); Spacer() }
                            .frame(height: 40).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private var readOnlyRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let r = raw {
                row("TIMER", value: r.expiresAt == nil ? "∞" : (FeedModels.entryExpiry(check?.expiry ?? .open)?.label ?? "set"), reason: "set when you posted")
                HStack {
                    row("SQUAD", value: r.maxSquadSize.map(String.init) ?? "∞", reason: "change it from the squad's ⋯")
                    if let s = check?.mySquad {
                        Button { dismiss(); env.router.go(.squads(squadId: s.squadId), env: env) } label: { Text("OPEN SQUAD →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                    }
                }
                row("MYSTERY", value: r.mystery ? "ON" : "OFF", reason: "can't be changed after posting")
            }
        }
    }

    private func row(_ label: String, value: String, reason: String) -> some View {
        HStack(spacing: 8) {
            Text("\(label) · \(value)").dtFont(.label).foregroundStyle(.inkMuted)
            Text("— \(reason)").dtFont(.meta).foregroundStyle(.inkMuted)
            Spacer()
        }
        .frame(minHeight: 44)
        .hairline(color: .ruleLight)
    }

    private var shareAndDelete: some View {
        VStack(spacing: 0) {
            Button { Task { await share() } } label: {
                HStack { Text("SHARE CHECK").dtFont(.button).foregroundStyle(.dtInk); Spacer() }.frame(height: 52).contentShape(Rectangle())
            }.buttonStyle(.plain)
            .hairline(color: .ruleLight)
            Button { confirm = DTConfirm("delete this check?", message: "the squad chat ends too", actions: [.init("delete", destructive: true)]) } label: {
                HStack { Text("DELETE CHECK").dtFont(.button).foregroundStyle(.dangerInk); Spacer() }.frame(height: 52).contentShape(Rectangle())
            }.buttonStyle(.plain)
        }
        .sheet(item: $shareURL) { url in
            ShareSheet(items: [url]).ignoresSafeArea()
        }
    }

    private func share() async {
        await env.feed.markShared(checkId)
        shareURL = AppConfig.webBase.appending(path: "check/\(checkId)")
    }

    private func search(_ q: String) {
        let t = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard t.count >= 1 else { tagResults = []; return }
        let taken = Set(coAuthors.map(\.id))
        tagResults = env.friends.friends.filter { !taken.contains($0.id) && ($0.username.hasPrefix(t) || $0.displayName.lowercased().contains(t)) }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        guard let r = raw else { return }
        var patch = CheckPatch()
        if text != r.text { patch.text = text }
        if when.date != r.eventDate { patch.eventDate = .some(when.date) }
        if when.label != r.eventDateLabel { patch.eventDateLabel = .some(when.label) }
        if when.time != r.eventTime { patch.eventTime = .some(when.time) }
        let loc = location.trimmingCharacters(in: .whitespaces)
        if loc != (r.location ?? "") { patch.location = .some(loc.isEmpty ? nil : loc) }
        if when.dateFlexible != r.dateFlexible { patch.dateFlexible = when.dateFlexible }
        if when.timeFlexible != r.timeFlexible { patch.timeFlexible = when.timeFlexible }
        if isAuthor { patch.coAuthorIds = coAuthors.map(\.id) }
        do {
            try await env.feed.updateCheck(checkId, patch)
            dismiss()
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}
