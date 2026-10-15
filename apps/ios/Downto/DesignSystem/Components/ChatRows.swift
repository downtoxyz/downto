// DesignSystem/Components/ChatRows.swift — the transcript rows of DESIGN §4.10 (DECISIONS #14): message groups, system lines,
// the date-confirm card, the join-request banner and the M1 poll placeholder. A transcript, not bubbles.
import SwiftUI

// MARK: - Models

nonisolated struct ChatGroupModel: Hashable, Sendable, Identifiable {
    nonisolated struct Message: Hashable, Sendable, Identifiable {
        nonisolated enum Delivery: Hashable, Sendable { case sent, sending, failed }
        let id: String
        var text: String
        var mentions: Set<String> = []
        var delivery: Delivery = .sent
    }

    let id: String
    var sender: Presence
    var timestamp: String
    var messages: [Message]
    var isMine: Bool { sender.isMe }
}

nonisolated struct DateConfirmModel: Hashable, Sendable {
    nonisolated enum Answer: Hashable, Sendable { case yes, no, waiting }
    nonisolated struct Row: Hashable, Sendable {
        let name: String
        let isMe: Bool
        let answer: Answer
    }
    var proposer: String
    var dateText: String
    var rows: [Row]
    var locked = false
    var cleared = false
}

nonisolated struct JoinRequestModel: Hashable, Sendable {
    var requester: Presence
    var extraCount = 0
    var text: String {
        extraCount > 0 ? "\(requester.label) + \(extraCount) more want in" : "\(requester.label) wants in"
    }
}

// MARK: - Message group

/// Header row = avatar `inline` + sender label + timestamp; then each message 4pt apart; 16pt between groups. Your groups carry a
/// 2pt `Color.dt` rule at x = 8 and a full-bleed `dtFaint` band.
struct MessageGroupRow: View {
    let group: ChatGroupModel
    var onRetry: (ChatGroupModel.Message) -> Void = { _ in }

    @Environment(\.dtIncreaseContrast) private var increaseContrast

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                AvatarLetter(presence: group.sender, size: .inline, ring: nil)
                if case .masked(_, let scramble) = group.sender {
                    Text(scramble).dtFont(.label).foregroundStyle(.inkMuted).accessibilityLabel("hidden member")
                } else {
                    Text(group.sender.label).dtFont(.label).foregroundStyle(group.isMine ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .dtInk)))
                }
                Text("·").dtFont(.meta).foregroundStyle(Color.inkFaint)
                Text(group.timestamp).dtFont(.meta).foregroundStyle(.inkMuted)
            }
            ForEach(group.messages) { m in
                VStack(alignment: .leading, spacing: 4) {
                    LinkifiedText(text: m.text, mentions: m.mentions, style: .body, underline: true)
                        .foregroundStyle(Color.ink)
                        .opacity(m.delivery == .sent ? 1 : 0.6)
                    if m.delivery == .failed {
                        HStack(spacing: 0) {
                            Text("didn't send").dtFont(.meta).foregroundStyle(.dangerInk)
                            Text(" · ").dtFont(.meta).foregroundStyle(Color.inkFaint)
                            Button { onRetry(m) } label: { Text("RETRY").dtFont(.meta, face: .plex(.medium)).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                        }
                    }
                }
                .overlay(alignment: .leading) {
                    if m.delivery == .failed { Rectangle().fill(Color.danger).frame(width: 2).offset(x: -8) }
                }
            }
        }
        .padding(.horizontal, Space.chatGutter)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(group.isMine ? Color.dtFaint : Color.clear)
        .overlay(alignment: .leading) {
            if group.isMine { Rectangle().fill(increaseContrast ? Color.dtInkOnSurface : Color.dt).frame(width: 2).padding(.leading, 8) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(group.sender.isMasked ? "hidden member" : group.sender.label), \(group.timestamp): \(group.messages.map(\.text).joined(separator: ". "))")
    }
}

// MARK: - System message

/// Centred `Font.dt.system` `inkMuted`, flanked by "✶" `.dtInk` with 8pt gaps, 20pt vertical padding. Join lines get the name in `.dtInk` 500.
struct SystemMessageRow: View {
    let text: String
    var highlightedName: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            Text("✶").dtFont(.system).foregroundStyle(.dtInk).accessibilityHidden(true)
            if let name = highlightedName, let range = text.range(of: name) {
                let before = String(text[..<range.lowerBound])
                let after = String(text[range.upperBound...])
                Text("\(Text(before))\(Text(name).font(DTTextStyle.meta.font(face: .plex(.medium))))\(Text(after))")
                    .dtFont(.system).foregroundStyle(.inkMuted)
            } else {
                Text(text).dtFont(.system).foregroundStyle(.inkMuted)
            }
            Text("✶").dtFont(.system).foregroundStyle(.dtInk).accessibilityHidden(true)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .padding(.horizontal, Space.chatGutter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

// MARK: - Date-confirm card

/// `Color.deep` radius 12 padding 16, content under `paperStock = .deep`. Glyph column + name; LOCKED stamp rotated −4°.
struct DateConfirmCard: View {
    let model: DateConfirmModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(model.cleared ? "cleared" : "\(model.proposer) proposed").dtFont(.meta).foregroundStyle(.inkMuted)
            Text(model.dateText).dtFont(.headline).foregroundStyle(Color.ink)
            if !model.cleared {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(model.rows.enumerated()), id: \.offset) { _, row in
                        HStack(spacing: 8) {
                            glyph(row.answer).frame(width: 14, alignment: .center)
                            Text(row.isMe ? "you" : row.name).dtFont(.body).foregroundStyle(Color.ink)
                            Text(words(row)).dtFont(.bodySmall).foregroundStyle(row.answer == .yes ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Radius.shape(Radius.m).fill(Color.deep))
        .overlay { if model.locked { Radius.shape(Radius.m).strokeBorder(Color.dt, lineWidth: 1) } }
        .overlay(alignment: .topTrailing) {
            if model.locked {
                Text("LOCKED").dtFont(.badge).foregroundStyle(DTContrastAware(token: .onDtFill))
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(Radius.shape(4).fill(DTContrastAware(token: .dtFill)))
                    .rotationEffect(.degrees(-4))
                    .padding(10)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        }
        .paperStock(.deep)
        .padding(.horizontal, Space.chatGutter)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func glyph(_ a: DateConfirmModel.Answer) -> some View {
        switch a {
        case .yes: Text("✓").dtFont(.body).foregroundStyle(.successInk)
        case .no: Text("✗").dtFont(.body).foregroundStyle(.dangerInk)
        case .waiting: Text("·").dtFont(.body).foregroundStyle(Color.inkFaint)
        }
    }

    private func words(_ row: DateConfirmModel.Row) -> String {
        switch row.answer {
        case .yes: row.isMe ? "you're in" : "in"
        case .no: "can't make it"
        case .waiting: "waiting"
        }
    }
}

// MARK: - Join-request banner

/// `safeAreaInset(.top)`, `Color.deep`, "Devon wants in" + ACCEPT `.dtInk` / DECLINE `inkMuted`, each in a 44 target.
struct JoinRequestBanner: View {
    let model: JoinRequestModel
    var onAccept: () -> Void = {}
    var onDecline: () -> Void = {}
    var onSee: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            AvatarLetter(presence: model.requester, size: .inline)
            Text(model.text).dtFont(.bodySmall).foregroundStyle(Color.ink)
            Spacer(minLength: 8)
            if model.extraCount > 0 {
                Button(action: onSee) { Text("SEE →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
            } else {
                Button(action: onAccept) { Text("ACCEPT").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                Button(action: onDecline) { Text("DECLINE").dtFont(.button).foregroundStyle(.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Space.chatGutter)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity)
        .background(Color.deep)
        .paperStock(.deep)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Poll placeholder (M1)

/// `.poll` messages in M1: the §4.10 deep card with the question and "poll — open on web for now" + COPY LINK.
struct PollPlaceholderRow: View {
    let question: String
    var onCopyLink: () -> Void = {}
    @State private var copies = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question).dtFont(.headline).foregroundStyle(Color.ink)
            Text("poll — open on web for now").dtFont(.system).foregroundStyle(.inkMuted)
            Button { copies += 1; onCopyLink() } label: {
                Text("COPY LINK").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .dtFeedback(.impact(flexibility: .rigid), trigger: copies)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Radius.shape(Radius.m).fill(Color.deep))
        .paperStock(.deep)
        .padding(.horizontal, Space.chatGutter)
    }
}

// MARK: - Composer (the M1 look, for the gallery)

/// The chat composer: surface stock, paper field with a 1pt rule at radius 22, glyphs in 44 targets, a 32pt dt send circle.
struct ComposerView: View {
    @Binding var text: String
    var onSend: () -> Void = {}
    var pollEnabled = false
    @State private var sends = 0

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            Image(systemName: "photo").font(.system(size: 20)).foregroundStyle(.inkMuted).frame(width: 44, height: 44)
                .accessibilityLabel("send a photo")
            Text("▲").dtFont(.headline).foregroundStyle(pollEnabled ? AnyShapeStyle(DTStockInk(token: .inkMuted)) : AnyShapeStyle(Color.inkFaint)).frame(width: 44, height: 44)
                .accessibilityLabel("poll")
                .accessibilityHint(pollEnabled ? "" : "polls are on web for now")
            TextField("say something", text: $text, axis: .vertical)
                .dtFont(.body)
                .foregroundStyle(Color.ink)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.paper))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.rule, lineWidth: 1))
            Button { sends += 1; onSend() } label: {
                Text("↑").dtFont(.headline).foregroundStyle(DTContrastAware(token: .onDtFill))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(text.isEmpty ? AnyShapeStyle(Color.ruleLight) : AnyShapeStyle(DTContrastAware(token: .dtFill))))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(text.isEmpty)
            .animation(DTSpring.ink, value: text.isEmpty)
            .dtFeedback(.impact(weight: .medium), trigger: sends)
            .accessibilityLabel("send")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(Color.surface)
        .paperStock(.surface)
        .elevation(.laid)
    }
}

// MARK: - Previews

extension ChatGroupModel {
    static let previewOther = ChatGroupModel(id: "g1", sender: PreviewPresence.sara, timestamp: "8:12pm", messages: [
        .init(id: "m1", text: "where are we meeting"), .init(id: "m2", text: "@kat you said the corner one? https://maps.example/x", mentions: ["kat"]),
    ])
    static let previewMine = ChatGroupModel(id: "g2", sender: PreviewPresence.me, timestamp: "8:14pm", messages: [
        .init(id: "m3", text: "yeah the one with the neon"), .init(id: "m4", text: "omw", delivery: .sending),
    ])
    static let previewFailed = ChatGroupModel(id: "g3", sender: PreviewPresence.me, timestamp: "8:15pm", messages: [.init(id: "m5", text: "actually running late", delivery: .failed)])
    static let previewMasked = ChatGroupModel(id: "g4", sender: PreviewPresence.masked, timestamp: "8:20pm", messages: [.init(id: "m6", text: "see you there")])
}

#Preview("Chat rows") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            SystemMessageRow(text: "guests revealed on fri oct 10")
            MessageGroupRow(group: .previewOther)
            MessageGroupRow(group: .previewMine)
            SystemMessageRow(text: "sara just entered the chat", highlightedName: "sara")
            MessageGroupRow(group: .previewFailed)
            MessageGroupRow(group: .previewMasked)
            DateConfirmCard(model: DateConfirmModel(proposer: "sara", dateText: "fri oct 3 · 8pm", rows: [.init(name: "sara", isMe: false, answer: .yes), .init(name: "kat", isMe: true, answer: .yes), .init(name: "devon", isMe: false, answer: .no), .init(name: "mo", isMe: false, answer: .waiting)]))
            DateConfirmCard(model: DateConfirmModel(proposer: "sara", dateText: "fri oct 3 · 8pm", rows: [.init(name: "sara", isMe: false, answer: .yes), .init(name: "kat", isMe: true, answer: .yes)], locked: true))
            JoinRequestBanner(model: JoinRequestModel(requester: PreviewPresence.devon))
            JoinRequestBanner(model: JoinRequestModel(requester: PreviewPresence.devon, extraCount: 2))
            PollPlaceholderRow(question: "thurs or fri?")
            ComposerView(text: .constant(""))
        }
        .padding(.vertical)
    }
    .background(Color.paper)
}
