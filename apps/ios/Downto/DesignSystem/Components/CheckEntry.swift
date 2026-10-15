// DesignSystem/Components/CheckEntry.swift — DESIGN §4.1 (DECISIONS #9, #10, #11). A check is an entry: byline, body, when·where,
// response row, one left margin down the whole page; full-bleed tint bands and a 3pt magenta edge rule mark state.
// Built against `CheckEntryModel`, a nonisolated value the feature layer derives from its display models — no store dependency.
import SwiftUI

// MARK: - Model

nonisolated struct CheckEntryModel: Hashable, Sendable, Identifiable {
    nonisolated enum Tint: Hashable, Sendable {
        case idle, new, mine, down, waitlisted(position: Int)

        var color: Color {
            switch self {
            case .idle: .card
            case .new: .checkNew
            case .mine: .checkMine
            case .down: .checkDown
            case .waitlisted: .waitlistBg
            }
        }
    }

    nonisolated struct Comment: Hashable, Sendable {
        let author: Presence
        let text: String
    }

    nonisolated struct SquadLink: Hashable, Sendable {
        let hasUnread: Bool
    }

    let id: String
    var author: Presence
    var isMine = false
    var viaFriendName: String? = nil
    var expiry: EntryExpiry? = nil
    var text: String
    var mentions: Set<String> = []
    /// "fri oct 3 · 8pm-ish · bushwick" parts; `-ish` suffixes are rendered in inkDim.
    var whenWhere: [String] = []
    var responders: [Presence] = []
    var responseCount = 0
    /// Precedence: down > waitlisted > mine > new > idle (DESIGN §1.3). `isNew` is kept separately so a down + new entry shows the flag.
    var tint: Tint = .idle
    var isNew = false
    var isExpired = false
    /// Hidden section: strikethrough + UNHIDE in the toggle's slot.
    var isHidden = false
    var isMystery = false
    /// Mystery, author's own: a `micro` kaomoji preview of the mask + "to everyone else".
    var ownMaskKaomoji: String? = nil
    var isHighlighted = false
    var toggle: DownToggleState = .idle
    var squadLink: SquadLink? = nil
    var coAuthorPending = false
    var comments: [Comment] = []
    var moreCommentsCount = 0
    var letterboxdURL: String? = nil
    var isTopOfTimed = false
    /// "Sara + 2 others down" / "no responses yet" / "guests revealed on the day".
    var responseLine: String {
        if isMystery { return "guests revealed on the day" }
        let others = responders.filter { !$0.isMe }
        guard let first = others.first ?? responders.first else { return "no responses yet" }
        let rest = responders.count - 1
        return rest > 0 ? "\(first.label) + \(rest) other\(rest == 1 ? "" : "s") down" : "\(first.label) down"
    }
}

// MARK: - Entry

/// Set by the feed's `onScrollPhaseChange` so a scroll start cancels the press (DESIGN §4.1 rule 1).
nonisolated private struct ScrollInteractingKey: EnvironmentKey {
    static let defaultValue = false
}

nonisolated extension EnvironmentValues {
    var dtScrollInteracting: Bool {
        get { self[ScrollInteractingKey.self] }
        set { self[ScrollInteractingKey.self] = newValue }
    }
}

struct CheckEntry: View {
    let model: CheckEntryModel
    var onTap: () -> Void = {}
    var onToggle: (DownToggleEvent) -> Void = { _ in }
    var onOpenSquad: () -> Void = {}
    var onMore: () -> Void = {}
    var onCoAuthor: (Bool) -> Void = { _ in }
    var onUnhide: () -> Void = {}
    var contextActions: [ContextAction] = []
    /// Render without the press/context-menu chrome (the preview copy the system lifts must be an un-pressed entry).
    var isPreviewCopy = false

    nonisolated struct ContextAction: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let systemImage: String
        let destructive: Bool
        init(_ title: String, systemImage: String, destructive: Bool = false) {
            id = title
            self.title = title
            self.systemImage = systemImage
            self.destructive = destructive
        }
    }

    @State private var pressed = false
    @State private var pressTask: Task<Void, Never>? = nil
    @State private var pressCount = 0
    @State private var pillCenter: CGPoint = .zero
    @State private var dyeRadius: CGFloat = 0
    @State private var ruleDraw: CGFloat = 1
    @State private var flash: Double = 0
    @State private var contextTaps: [String: Int] = [:]

    @Environment(\.dtReduceMotion) private var reduceMotion
    @Environment(\.dtScrollInteracting) private var scrollInteracting
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var isDown: Bool { model.tint == .down }
    private var isWaitlisted: Bool { if case .waitlisted = model.tint { true } else { false } }
    private var showsRule: Bool { model.tint == .mine || isDown || isWaitlisted }
    private var bodyInk: Color { model.isExpired || model.isHidden ? .inkExpired : .ink }

    var body: some View {
        let entry = content
            .coordinateSpace(name: "entry")
            .background(background)
            .overlay(alignment: .leading) { leftRule }
            .overlay(alignment: .topTrailing) { if model.isNew && !model.isExpired && !model.isHidden { NewFlag().padding(.top, 12) } }
            .overlay { if model.isMystery { MysteryFrame() } }
            .overlay(alignment: .top) { if let expiry = model.expiry { ExpiryRule(expiry: expiry, isTopOfSection: model.isTopOfTimed) } }
            .hairline(.bottom, color: model.tint == .new && !isDown ? .checkNewRule : .rule)
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
            .accessibilityAddTraits(model.isNew ? [.isButton, .updatesFrequently] : .isButton)
            .accessibilityAction(named: model.toggle.isActiveLook ? "Un-down" : "Down") { onToggle(model.toggle.isActiveLook ? .undone : .stamped) }

        if isPreviewCopy {
            entry
        } else {
            // A Button, not a DragGesture(minimumDistance: 0): since iOS 18 a zero-distance drag — even a simultaneous one — wins the
            // touch from the enclosing ScrollView and the feed stops scrolling. Button presses are delayed and cancelled by the
            // ScrollView natively, which is exactly the §4.1 precedence (scroll > press), so the style just reports isPressed.
            entry
                .pressButton(onPressChange: { down in down ? beginPress() : cancelPress() }, onTap: { pressed = false; onTap() })
                .overlay { if pressed { Rectangle().fill(DTContrastAware(token: .pressTint)).allowsHitTesting(false) } }
                .scaleEffect(pressed && !reduceMotion ? 0.99 : 1)
                .animation(pressed ? DTCurve.pressIn : DTSpring.ink, value: pressed)
                .onChange(of: scrollInteracting) { _, moving in if moving { cancelPress() } }
                .dtFeedback(.impact(flexibility: .soft, intensity: 0.35), trigger: pressCount)
                .contextMenu(menuItems: { menuItems }, preview: { CheckEntry(model: model, isPreviewCopy: true).frame(width: 360) })
                .onChange(of: model.tint) { old, new in dye(from: old, to: new) }
                .onChange(of: model.isHighlighted, initial: true) { _, on in if on { runFlash() } }
                .overlay { Color.dtLight.opacity(flash).allowsHitTesting(false) }
                .accessibilityActions {
                    if model.squadLink != nil { Button("open squad", action: onOpenSquad) }
                    ForEach(contextActions) { a in Button(a.title) {} }
                }
        }
    }

    // MARK: Anatomy

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            byline
            if let url = model.letterboxdURL, !url.isEmpty {
                Text("LETTERBOXD →").dtFont(.button).foregroundStyle(.dtInk)
            }
            checkText
            if !model.whenWhere.isEmpty { whenWhere }
            responseRow
            if isWaitlisted, case .waitlisted(let p) = model.tint {
                Text("you're #\(p) on the waitlist").dtFont(.meta).foregroundStyle(Color.warnInk)
            }
            if model.coAuthorPending { coAuthorStrip }
            if !model.comments.isEmpty { commentsBlock }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, Space.entryVertical)
        .padding(.top, model.expiry == nil ? 0 : 2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var byline: some View {
        HStack(spacing: 8) {
            AvatarLetter(presence: model.author, size: .inline, expired: model.isExpired || model.isHidden)
            if model.isMine {
                Text("you").dtFont(.meta, face: .plex(.semiBold)).foregroundStyle(Color.ink)
                if let k = model.ownMaskKaomoji {
                    AvatarLetter(presence: .masked(kaomoji: k, scramble: ""), size: .micro)
                    Text("to everyone else").dtFont(.meta).foregroundStyle(.inkMuted)
                }
            } else if case .masked(_, let scramble) = model.author {
                Text(scramble).dtFont(.meta, face: .plex(.medium)).foregroundStyle(.inkMuted)
            } else {
                Text(model.author.label).dtFont(.meta, face: .plex(.medium)).foregroundStyle(.dtInk)
            }
            if let via = model.viaFriendName {
                Text("via \(via)").dtFont(.meta).foregroundStyle(.inkDim)
            }
            Spacer(minLength: 8)
            if let expiry = model.expiry {
                Text(model.isExpired ? "expired" : expiry.label)
                    .dtFont(.meta)
                    .monospacedDigit()
                    .foregroundStyle(expiry.isDanger ? AnyShapeStyle(DTStockInk(token: .dangerInk)) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                    .dtNumeric(expiry.label, countsDown: true)
            }
            if !model.isMine && !isPreviewCopy {
                Button(action: onMore) {
                    Text("⋯").dtFont(.headline).foregroundStyle(.inkDim)
                        .frame(width: 24, height: 24)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            }
        }
        .frame(height: 24)
    }

    private var checkText: some View {
        LinkifiedText(text: model.text, mentions: model.mentions, style: .checkText, masked: model.isMystery && !model.isMine)
            .foregroundStyle(bodyInk)
            .strikethrough(model.isHidden, color: Color.inkFaint)
            .lineLimit(6)
            .mask {
                VStack(spacing: 0) {
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 24)
                }
            }
    }

    private var whenWhere: some View {
        MetaLine(model.whenWhere.map { part in
            part.hasSuffix("-ish")
                ? Text("\(Text(String(part.dropLast(4))))\(Text("-ish").foregroundStyle(Color.inkDim))")
                : Text(part)
        })
        .dtFont(.bodySmall)
        .foregroundStyle(model.isExpired || model.isHidden ? AnyShapeStyle(Color.inkExpired) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
    }

    private var responseRow: some View {
        let stacked = dynamicTypeSize.isAccessibilitySize
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if !model.responders.isEmpty && !model.isMystery {
                    AvatarStack(presences: model.responders, ring: model.tint.color, size: .small, dimmed: model.isExpired || model.isHidden)
                }
                Text(model.responseLine)
                    .dtFont(model.isMystery ? .system : .bodySmall)
                    .foregroundStyle(.inkMuted)
                    .dtNumeric(model.responseLine)
                Spacer(minLength: 8)
                if !stacked { trailing }
            }
            .frame(minHeight: 36)
            if stacked { trailing.frame(maxWidth: .infinity) }
        }
    }

    @ViewBuilder private var trailing: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if model.isHidden {
                Button(action: onUnhide) {
                    Text("UNHIDE").dtFont(.button).foregroundStyle(.dtInk).frame(height: 44)
                }.buttonStyle(.plain)
            } else if model.isMine {
                HStack(spacing: 6) {
                    Text(model.isMystery ? "\(model.responseCount) ?" : "\(model.responseCount) down")
                        .dtFont(.meta).foregroundStyle(.inkMuted).dtNumeric(model.responseCount)
                    if model.squadLink != nil { Text("·").dtFont(.meta).foregroundStyle(Color.inkFaint); squadLinkView }
                }
            } else {
                DownToggle(state: model.isExpired ? .closed : model.toggle, onEvent: onToggle)
                    .onGeometryChange(for: CGPoint.self) { proxy in
                        let f = proxy.frame(in: .named("entry"))
                        return CGPoint(x: f.midX, y: f.midY)
                    } action: { pillCenter = $0 }
                if model.squadLink != nil { squadLinkView }
            }
        }
    }

    private var squadLinkView: some View {
        Button(action: onOpenSquad) {
            HStack(spacing: 6) {
                if model.squadLink?.hasUnread == true { SquadUnreadDot(size: 6) }
                Text("OPEN SQUAD →").dtFont(.meta, face: .plex(.medium)).foregroundStyle(.dtInk)
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("open squad")
    }

    private var coAuthorStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(Color.rule).frame(height: 1)
            HStack(spacing: 16) {
                Text("you were tagged").dtFont(.label).foregroundStyle(.inkMuted)
                Spacer()
                Button { onCoAuthor(true) } label: { Text("ACCEPT").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                Button { onCoAuthor(false) } label: { Text("DECLINE").dtFont(.button).foregroundStyle(.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
            }
        }
    }

    private var commentsBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Rectangle().fill(Color.ruleLight).frame(height: 1)
            ForEach(Array(model.comments.prefix(2).enumerated()), id: \.offset) { _, c in
                Text("\(Text(c.author.label).foregroundStyle(DTInkToken.dtInk.resolve(stock: .paper, increaseContrast: false))) \(c.text)")
                    .dtFont(.bodySmall)
                    .foregroundStyle(bodyInk)
                    .lineLimit(2)
            }
            if model.moreCommentsCount > 0 {
                Text("\(model.moreCommentsCount) more →").dtFont(.meta).foregroundStyle(.inkMuted)
            }
        }
    }

    // MARK: Background, rule, dye

    private var background: some View {
        ZStack {
            (model.isNew && !isDown && !isWaitlisted && model.tint != .mine ? Color.checkNew : baseTint)
            if dyeRadius > 0 {
                Color.checkDown.mask {
                    Circle().frame(width: dyeRadius * 2, height: dyeRadius * 2).position(pillCenter)
                }
            }
        }
    }

    private var baseTint: Color {
        switch model.tint {
        case .down: dyeRadius > 0 ? previousTintColor : .checkDown
        default: model.tint.color
        }
    }

    @State private var previousTintColor: Color = .card

    @ViewBuilder private var leftRule: some View {
        if showsRule {
            let color: Color = model.isExpired || model.isHidden ? .ruleLight : .dt
            GeometryReader { geo in
                if isWaitlisted {
                    Path { p in
                        p.move(to: CGPoint(x: 1.5, y: 0))
                        p.addLine(to: CGPoint(x: 1.5, y: geo.size.height))
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 3, dash: [4, 3]))
                } else {
                    Rectangle().fill(color).frame(width: 3, height: geo.size.height * ruleDraw)
                }
            }
            .frame(width: 3)
            .accessibilityHidden(true)
        }
    }

    /// DESIGN §4.3: the band dyes outward from the pill 60ms after the apex (R+150), the rule draws down at R+400.
    private func dye(from old: CheckEntryModel.Tint, to new: CheckEntryModel.Tint) {
        guard new == .down, old != .down else {
            if old == .down, new != .down, !reduceMotion {
                withAnimation(.linear(duration: 0.2)) { dyeRadius = 0 }
                withAnimation(.easeIn(duration: 0.16)) { ruleDraw = 0 }
                Task { try? await Task.sleep(for: .milliseconds(200)); ruleDraw = 1 }
            }
            return
        }
        guard !reduceMotion else { return }
        previousTintColor = old.color
        dyeRadius = 0.001
        ruleDraw = 0
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(DTCurve.bandDye) { dyeRadius = 900 }
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(DTCurve.ruleDraw) { ruleDraw = 1 }
            try? await Task.sleep(for: .milliseconds(500))
            dyeRadius = 0
        }
    }

    private func runFlash() {
        flash = 1
        withAnimation(DTSpring.settle.delay(0.3)) { flash = 0.5 }
        withAnimation(DTSpring.settle.delay(1.5)) { flash = 0 }
    }

    // MARK: Gesture (DESIGN §4.1 precedence)

    /// 40 ms after touch-down the tint lands (DESIGN §4.1); a scroll or lift before that cancels it silently.
    private func beginPress() {
        guard pressTask == nil, !pressed, !scrollInteracting else { return }
        pressTask = Task {
            try? await Task.sleep(for: .milliseconds(40))
            guard !Task.isCancelled else { return }
            pressed = true
            pressCount += 1
        }
    }

    private func cancelPress() {
        pressTask?.cancel()
        pressTask = nil
        pressed = false
    }

    @ViewBuilder private var menuItems: some View {
        ForEach(contextActions) { a in
            Button(role: a.destructive ? .destructive : nil) {
                contextTaps[a.id, default: 0] += 1
            } label: { Label(a.title, systemImage: a.systemImage) }
        }
    }

    private var accessibilityText: String {
        var parts: [String] = []
        if model.isMystery && !model.isMine { parts.append("mystery check, host revealed on the day") } else { parts.append("\(model.isMine ? "your" : model.author.label + "'s") check") }
        parts.append(model.text)
        if !model.whenWhere.isEmpty { parts.append(model.whenWhere.joined(separator: " ")) }
        parts.append(model.responseLine)
        if let e = model.expiry { parts.append(model.isExpired ? "expired" : e.label) }
        if model.isNew { parts.append("new") }
        return parts.joined(separator: ". ")
    }
}

// MARK: - Previews

extension CheckEntryModel {
    static let previewIdle = CheckEntryModel(id: "idle", author: PreviewPresence.sara, expiry: EntryExpiry(elapsedFraction: 0.3, label: "3h left"),
                                             text: "movie night? something dumb and loud", whenWhere: ["fri oct 3", "8pm-ish", "sara's"],
                                             responders: [PreviewPresence.devon, PreviewPresence.mo], responseCount: 2, isTopOfTimed: true)
    static let previewNew = CheckEntryModel(id: "new", author: PreviewPresence.lena, expiry: EntryExpiry(elapsedFraction: 0.85, label: "20m left"),
                                            text: "who's got a car", whenWhere: ["tonight"], tint: .new, isNew: true)
    static let previewMine = CheckEntryModel(id: "mine", author: PreviewPresence.me, isMine: true, text: "climbing sun 10am?", whenWhere: ["sun oct 5", "10am", "the cliffs"],
                                             responseCount: 3, tint: .mine, squadLink: SquadLink(hasUnread: true))
    static let previewDown = CheckEntryModel(id: "down", author: PreviewPresence.sara, viaFriendName: nil, text: "rooftop tn 9pm — bring a layer",
                                             whenWhere: ["tonight", "9pm", "rooftop"], responders: [PreviewPresence.me, PreviewPresence.sara, PreviewPresence.devon, PreviewPresence.mo],
                                             responseCount: 4, tint: .down, toggle: .active, squadLink: SquadLink(hasUnread: false))
    static let previewWaitlisted = CheckEntryModel(id: "wait", author: PreviewPresence.mo, text: "karaoke sat, cap 4", whenWhere: ["sat", "10pm"],
                                                   responders: [PreviewPresence.sara, PreviewPresence.devon, PreviewPresence.lena], responseCount: 4,
                                                   tint: .waitlisted(position: 2), toggle: .waitlisted(position: 2), squadLink: SquadLink(hasUnread: false))
    static let previewExpired = CheckEntryModel(id: "expired", author: PreviewPresence.devon, viaFriendName: "sara", expiry: EntryExpiry(elapsedFraction: 1, label: "expired"),
                                                text: "anyone up for a late dinner", whenWhere: ["yesterday", "9pm"], responders: [PreviewPresence.me, PreviewPresence.sara],
                                                responseCount: 2, tint: .down, isExpired: true, toggle: .closed, squadLink: SquadLink(hasUnread: false))
    static let previewMystery = CheckEntryModel(id: "mystery", author: PreviewPresence.masked, text: "???",
                                                whenWhere: ["fri oct 10", "somewhere in bushwick"], isMystery: true)
    static let previewMysteryOwn = CheckEntryModel(id: "mysteryOwn", author: PreviewPresence.me, isMine: true, text: "a secret thing. dress warm.",
                                                   whenWhere: ["fri oct 10", "somewhere in bushwick"], responseCount: 3, tint: .mine, isMystery: true, ownMaskKaomoji: "(˘ω˘)")
    static let previewHighlighted = CheckEntryModel(id: "hl", author: PreviewPresence.sara, text: "sara changed the date — still down?", whenWhere: ["sat", "8pm"],
                                                    responders: [PreviewPresence.me], responseCount: 1, tint: .down, isHighlighted: true, toggle: .active)
    static let previewHidden = CheckEntryModel(id: "hidden", author: PreviewPresence.lena, text: "pickleball at dawn", whenWhere: ["sun", "6am"], isHidden: true)
    static let previewTagged = CheckEntryModel(id: "tagged", author: PreviewPresence.sara, text: "kat + me are doing a thing", whenWhere: ["thu"], coAuthorPending: true,
                                               comments: [Comment(author: PreviewPresence.mo, text: "in"), Comment(author: PreviewPresence.lena, text: "what time tho")], moreCommentsCount: 3)
}

#Preview("CheckEntry states") {
    ScrollView {
        LazyVStack(spacing: 0) {
            ForEach([CheckEntryModel.previewIdle, .previewNew, .previewMine, .previewDown, .previewWaitlisted, .previewExpired, .previewMystery, .previewMysteryOwn, .previewHighlighted, .previewHidden, .previewTagged]) { m in
                CheckEntry(model: m, contextActions: [.init("Hide", systemImage: "eye.slash"), .init("Report", systemImage: "flag")])
            }
        }
    }
    .background(Color.paper)
}

/// Plain button chrome that only reports `isPressed` transitions to the host.
struct PressReportingStyle: ButtonStyle {
    let onPressChange: (Bool) -> Void
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, down in onPressChange(down) }
    }
}

/// Wraps the view in a chrome-less Button so a press is tracked (down / cancelled / released) *and* the enclosing ScrollView
/// still scrolls. Never use `DragGesture(minimumDistance: 0)` for press feedback inside a ScrollView: since iOS 18 it wins the
/// touch even as a simultaneous gesture and the list stops scrolling. `onTap` receives the release location when the system
/// provides one (the DownToggle's sweep originates there); `enabled == false` lets the touch fall through to the parent.
struct PressButton: ViewModifier {
    var enabled = true
    let onPressChange: (Bool) -> Void
    let onTap: (CGPoint?) -> Void
    @State private var lastLocation: CGPoint? = nil

    func body(content: Content) -> some View {
        Button { onTap(lastLocation); lastLocation = nil } label: { content }
            .buttonStyle(PressReportingStyle(onPressChange: onPressChange))
            .simultaneousGesture(SpatialTapGesture(coordinateSpace: .local).onEnded { lastLocation = $0.location })
            .disabled(!enabled)
    }
}

extension View {
    func pressButton(enabled: Bool = true, onPressChange: @escaping (Bool) -> Void, onTap: @escaping () -> Void) -> some View {
        modifier(PressButton(enabled: enabled, onPressChange: onPressChange, onTap: { _ in onTap() }))
    }
    func pressButton(enabled: Bool = true, onPressChange: @escaping (Bool) -> Void, onTap: @escaping (CGPoint?) -> Void) -> some View {
        modifier(PressButton(enabled: enabled, onPressChange: onPressChange, onTap: onTap))
    }
}
