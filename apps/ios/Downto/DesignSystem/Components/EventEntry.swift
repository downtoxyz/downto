// DesignSystem/Components/EventEntry.swift — the event hero entry (DESIGN §4.5; M1 read-only per §7.0).
// Same chassis as CheckEntry; between byline and metadata a 16:9 hero with a wash whose stops are defined by the title box.
import SwiftUI

nonisolated struct EventEntryModel: Hashable, Sendable, Identifiable {
    nonisolated enum Source: String, Hashable, Sendable { case ig = "IG", dice = "DICE", letterboxd = "LETTERBOXD", manual = "" }
    nonisolated enum State: Hashable, Sendable { case idle, mine, down, new, saved, past }

    let id: String
    var poster: Presence
    var isMine = false
    var venueHandle: String? = nil
    var source: Source = .manual
    var title: String
    /// nil → the 96pt `Color.surface` band with the title in display.
    var imageName: String? = nil
    var dateLine: [String] = []
    var vibes: [String] = []
    var note: String? = nil
    var visibilityIsPublic: Bool? = nil
    var responders: [Presence] = []
    var state: State = .idle
    var isNew = false
    var isImminent = false
    var imminentText: String? = nil
    var isHighlighted = false
    var toggle: DownToggleState = .idle
    var isSaved = false

    var responseLine: String {
        let others = responders.filter { !$0.isMe }
        guard let first = others.first ?? responders.first else { return state == .past ? "" : "nobody's down yet" }
        let rest = responders.count - 1
        let verb = state == .past ? "went" : "down"
        return rest > 0 ? "\(first.label) + \(rest) other\(rest == 1 ? "" : "s") \(verb)" : "\(first.label) \(verb)"
    }
}

struct EventEntry: View {
    let model: EventEntryModel
    var onTap: () -> Void = {}
    var onToggle: (DownToggleEvent) -> Void = { _ in }
    var onResponses: () -> Void = {}

    @State private var titleBoxHeight: CGFloat = 60
    @State private var flash: Double = 0
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.dtIncreaseContrast) private var increaseContrast
    @Environment(\.dtReduceMotion) private var reduceMotion

    private var isPast: Bool { model.state == .past }
    private var band: Color {
        switch model.state {
        case .down: .checkDown
        case .mine: .checkMine
        case .new: .checkNew
        default: .card
        }
    }
    private var showsRule: Bool { model.state == .down || model.state == .mine }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            byline
            hero
            dateLine
            if !model.vibes.isEmpty {
                FlowLayout(spacing: 4) { ForEach(model.vibes, id: \.self) { Pill(text: $0) } }
            }
            if let note = model.note, !note.isEmpty {
                Text(note).dtFont(.body).foregroundStyle(isPast ? Color.inkExpired : Color.ink).lineLimit(3)
            }
            responseRow
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, Space.entryVertical)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(band)
        .overlay(alignment: .leading) {
            if showsRule { Rectangle().fill(isPast ? Color.ruleLight : Color.dt).frame(width: 3).accessibilityHidden(true) }
        }
        .overlay(alignment: .topTrailing) { if model.isNew && !isPast { NewFlag().padding(.top, 12) } }
        .overlay { Color.dtLight.opacity(flash).allowsHitTesting(false) }
        .hairline(.bottom, color: model.state == .new ? .checkNewRule : .rule)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .onChange(of: model.isHighlighted, initial: true) { _, on in
            guard on else { return }
            flash = 1
            withAnimation(DTSpring.settle.delay(0.3)) { flash = 0.5 }
            withAnimation(DTSpring.settle.delay(1.5)) { flash = 0 }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(model.title). \(model.dateLine.joined(separator: " ")). \(model.responseLine)")
        .accessibilityAddTraits(.isButton)
    }

    private var byline: some View {
        HStack(spacing: 8) {
            AvatarLetter(presence: model.poster, size: .inline, expired: isPast)
            if model.isMine {
                Text("you").dtFont(.meta, face: .plex(.semiBold)).foregroundStyle(Color.ink)
            } else {
                Text("posted by \(model.poster.label)").dtFont(.meta).foregroundStyle(.dtInk)
            }
            if let handle = model.venueHandle {
                Text("via @\(handle) on \(model.source == .manual ? "web" : model.source.rawValue)").dtFont(.meta).foregroundStyle(.inkDim)
            }
            Spacer(minLength: 8)
            if model.isMine, let isPublic = model.visibilityIsPublic {
                Pill(text: isPublic ? "public" : "friends", style: .visibility(isPublic: isPublic))
            }
        }
        .frame(height: 24)
    }

    private var hero: some View {
        Group {
            if let imageName = model.imageName {
                Color.surface
                    .overlay {
                        Image(imageName).resizable().scaledToFill()
                            .saturation(isPast ? 0.4 : 1)
                    }
                    .overlay { wash }
                    .overlay(alignment: .bottomLeading) { titleBox }
                    .overlay(alignment: .topTrailing) {
                        if model.source != .manual {
                            Text(model.source.rawValue).dtFont(.badge).foregroundStyle(Color.ink)
                                .padding(.horizontal, 6).padding(.vertical, 3)
                                .background(Radius.shape(Radius.xs).fill(Color.paper.opacity(0.85)))
                                .padding(12)
                        }
                    }
                    .aspectRatio(16 / 9, contentMode: .fit)
            } else {
                Color.surface
                    .frame(height: 96)
                    .overlay(alignment: .leading) {
                        Text(model.title).dtFont(.display).foregroundStyle(Color.ink).lineLimit(2).padding(16)
                    }
                    .paperStock(.surface)
            }
        }
        .clipShape(Radius.shape(Radius.m))
        .overlay(alignment: .bottom) {
            if model.isImminent { Rectangle().fill(increaseContrast ? Color.dangerInk : Color.danger).frame(height: 2).accessibilityHidden(true) }
        }
        .scrollTransition(.interactive, axis: .vertical) { [reduceMotion] content, phase in
            content.scaleEffect(reduceMotion ? 1 : 1 + phase.value * -0.03)
        }
    }

    /// Stops defined by the title box (DESIGN §4.5): paper@0 at 40% → paper@0.85 at (title box top − 16) → paper@0.92 at the bottom.
    private var wash: some View {
        GeometryReader { geo in
            let h = geo.size.height
            let bottomTint: Color = model.state == .down ? .checkDown : (model.state == .mine ? .checkMine : .paper)
            let titleTop = max(0.4, 1 - (titleBoxHeight + 16) / max(h, 1))
            if reduceTransparency {
                VStack(spacing: 0) {
                    Color.clear
                    Color.paper.frame(height: titleBoxHeight + 16)
                }
            } else {
                LinearGradient(stops: [
                    .init(color: Color.paper.opacity(0), location: 0.4),
                    .init(color: Color.paper.opacity(increaseContrast ? 0.92 : 0.85), location: titleTop),
                    .init(color: bottomTint.opacity(0.92), location: 1),
                ], startPoint: .top, endPoint: .bottom)
            }
        }
    }

    private var titleBox: some View {
        Text(model.title)
            .dtFont(.title)
            .foregroundStyle(Color.ink)
            .lineLimit(2)
            .padding(16)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { titleBoxHeight = $0 }
    }

    private var dateLine: some View {
        HStack(spacing: 0) {
            if let imminent = model.imminentText, model.isImminent {
                Text(imminent).dtFont(.bodySmall).foregroundStyle(.dangerInk).dtNumeric(imminent, countsDown: true)
                if model.dateLine.count > 1 { Text(" · ").dtFont(.bodySmall).foregroundStyle(Color.inkFaint) }
                MetaLine(Array(model.dateLine.dropFirst())).dtFont(.bodySmall).foregroundStyle(.inkMuted)
            } else if isPast {
                MetaLine([Text("happened").foregroundStyle(Color.inkMuted)] + model.dateLine.dropFirst().map { Text($0) })
                    .dtFont(.bodySmall).foregroundStyle(Color.inkExpired)
            } else {
                MetaLine(model.dateLine).dtFont(.bodySmall).foregroundStyle(.inkMuted)
            }
        }
    }

    private var responseRow: some View {
        HStack(spacing: 8) {
            Button(action: onResponses) {
                HStack(spacing: 8) {
                    if !model.responders.isEmpty { AvatarStack(presences: model.responders, ring: band, size: .small, dimmed: isPast) }
                    if !model.responseLine.isEmpty { Text(model.responseLine).dtFont(.bodySmall).foregroundStyle(.inkMuted) }
                }
                .frame(minHeight: 36)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                DownToggle(state: isPast ? .closed : model.toggle, onEvent: onToggle)
                if model.isSaved && !isPast {
                    Text("✓ SAVED").dtFont(.button).foregroundStyle(.dtInk)
                }
            }
        }
    }
}

/// Wrapping row layout for pills (DESIGN §4.5: `FlowLayout` gap 4).
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

extension EventEntryModel {
    static let previewIdle = EventEntryModel(id: "e1", poster: PreviewPresence.sara, venueHandle: "elsewhere", source: .ig, title: "peggy gou all night long",
                                             imageName: "preview-hero", dateLine: ["sat oct 4", "11pm", "elsewhere"], vibes: ["loud", "late"],
                                             note: "doors at 11, she's on at 1", responders: [PreviewPresence.devon, PreviewPresence.mo, PreviewPresence.lena, PreviewPresence.sara])
    static let previewMine = EventEntryModel(id: "e2", poster: PreviewPresence.me, isMine: true, title: "backyard screening — jaws", dateLine: ["fri oct 10", "8pm", "kat's"],
                                             visibilityIsPublic: false, responders: [PreviewPresence.sara], state: .mine, toggle: .active)
    static let previewDown = EventEntryModel(id: "e3", poster: PreviewPresence.mo, source: .dice, title: "warehouse thing", imageName: "preview-hero",
                                             dateLine: ["sat oct 11", "10pm", "the hole"], responders: [PreviewPresence.me, PreviewPresence.mo], state: .down, toggle: .active)
    static let previewNew = EventEntryModel(id: "e4", poster: PreviewPresence.lena, source: .ig, title: "sunday flea", imageName: "preview-hero", dateLine: ["sun", "noon"], state: .new, isNew: true,
                                            isImminent: true, imminentText: "tonight · 8pm")
    static let previewPast = EventEntryModel(id: "e5", poster: PreviewPresence.devon, title: "that show last week", dateLine: ["sep 12", "9pm"], responders: [PreviewPresence.sara, PreviewPresence.mo],
                                             state: .past, toggle: .closed)
}

#Preview("EventEntry") {
    ScrollView {
        LazyVStack(spacing: 0) {
            ForEach([EventEntryModel.previewIdle, .previewMine, .previewDown, .previewNew, .previewPast]) { EventEntry(model: $0) }
        }
    }
    .background(Color.paper)
}
