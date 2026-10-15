// DesignSystem/Components/Pills.swift — pills, dots, badges, NEW flag, section labels, MetaLine, DTButton (DESIGN §4.6, §4.7; DECISIONS #9).
import SwiftUI

// MARK: - NEW flag (§4.6)

/// A printer's flag bleeding off the right edge: height 18, fill `newLime`, "NEW" badge `newInk`, left corners radius 4,
/// extends 6pt past the screen edge (clipped by the screen, not the entry).
struct NewFlag: View {
    var body: some View {
        Text("NEW")
            .dtFont(.badge)
            .foregroundStyle(Color.newInk)
            .padding(.leading, 12)
            .padding(.trailing, 6 + 6)   // 6 inside + 6 off the edge
            .frame(height: 18)
            .background(UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 4, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous).fill(Color.newLime))
            .offset(x: 6)
            .accessibilityLabel("new")
    }
}

// MARK: - Pill (§4.7)

nonisolated enum PillStyle: Hashable, Sendable {
    /// Vibe pill: paper fill, 1pt ruleLight border, label in `.dtInk`; selected → dt fill / onDt text.
    case vibe
    /// Mention chip: paper fill, dtSubtle-tinted border, `.dtInk` text.
    case mention
    /// Setting chip (Create): 32 tall, paper fill, 1pt rule, label.
    case setting
    /// Visibility chip: 20 tall, 1pt ruleLight, word in inkMuted (FRIENDS) or poolInk (PUBLIC).
    case visibility(isPublic: Bool)
    /// "WAITLIST" badge: warnInk in a dashed warnInk pill on waitlistBg.
    case waitlist
}

struct Pill: View {
    let text: String
    var style: PillStyle = .vibe
    var selected = false
    var onTap: (() -> Void)? = nil

    @State private var taps = 0

    var body: some View {
        Group {
            if let onTap {
                Button {
                    taps += 1
                    onTap()
                } label: { label }
                .buttonStyle(.plain)
                .dtFeedback(.selection, trigger: taps)
            } else {
                label
            }
        }
        .animation(DTSpring.ink, value: selected)
    }

    private var height: CGFloat {
        switch style {
        case .setting: 32
        case .visibility: 20
        default: 20
        }
    }

    @ViewBuilder private var label: some View {
        let font: DTTextStyle = style == .waitlist ? .badge : .label
        Text(text)
            .dtFont(font)
            .foregroundStyle(textColor)
            .padding(.horizontal, style == .setting ? 12 : 8)
            .frame(height: height)
            .background(Capsule().fill(fill))
            .overlay(border)
    }

    private var textColor: AnyShapeStyle {
        if selected { return AnyShapeStyle(DTContrastAware(token: .onDtFill)) }
        switch style {
        case .vibe, .mention: return AnyShapeStyle(DTStockInk(token: .dtInk))
        case .setting: return AnyShapeStyle(Color.ink)
        case .visibility(let isPublic): return isPublic ? AnyShapeStyle(DTStockInk(token: .poolInk)) : AnyShapeStyle(DTStockInk(token: .inkMuted))
        case .waitlist: return AnyShapeStyle(Color.warnInk)
        }
    }

    private var fill: AnyShapeStyle {
        if selected { return AnyShapeStyle(DTContrastAware(token: .dtFill)) }
        switch style {
        case .waitlist: return AnyShapeStyle(Color.waitlistBg)
        default: return AnyShapeStyle(Color.paper)
        }
    }

    @ViewBuilder private var border: some View {
        if !selected {
            switch style {
            case .vibe, .visibility: Capsule().strokeBorder(Color.ruleLight, lineWidth: 1)
            case .mention: Capsule().strokeBorder(Color.dtSubtle, lineWidth: 1)
            case .setting: Capsule().strokeBorder(Color.rule, lineWidth: 1)
            case .waitlist: Capsule().strokeBorder(Color.warnInk, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
        }
    }
}

// MARK: - Dots and count pills (§4.7)

/// 8pt `Color.dt` notification dot with a 1.5pt paper ring, or a count pill "99+" capped.
struct NotificationBadge: View {
    let count: Int

    var body: some View {
        if count <= 0 {
            EmptyView()
        } else {
            Text(count > 99 ? "99+" : "\(count)")
                .dtFont(.badge)
                .foregroundStyle(DTContrastAware(token: .onDtFill))
                .padding(.horizontal, 4)
                .frame(minWidth: 16, minHeight: 16)
                .background(Capsule().fill(DTContrastAware(token: .dtFill)))
                .overlay(Capsule().stroke(Color.paper, lineWidth: 1.5))
                .dtNumeric(count)
                .accessibilityLabel("\(count) unread")
        }
    }
}

/// 8pt `Color.dt` dot with a 1.5pt paper ring (an unread notification with no count).
struct NotificationDot: View {
    var body: some View {
        Circle().fill(Color.dt).frame(width: 8, height: 8)
            .overlay(Circle().stroke(Color.paper, lineWidth: 1.5))
            .accessibilityHidden(true)
    }
}

/// 8pt `Color.unreadSquad` dot with a 2pt paper ring; appears `DTSpring.stamp`, leaves with a 150ms fade.
struct SquadUnreadDot: View {
    var size: CGFloat = 8

    var body: some View {
        Circle().fill(Color.unreadSquad).frame(width: size, height: size)
            .overlay(Circle().stroke(Color.paper, lineWidth: 2))
            .transition(.asymmetric(insertion: .scale(scale: 0).animation(DTSpring.stamp), removal: .opacity.animation(.easeOut(duration: 0.15))))
            .accessibilityHidden(true)
    }
}

/// "N new ↑" — 32 tall, ink fill, label paper, `Elevation.lifted`, centred under the masthead (§4.7, §5.1).
struct NewItemsPill: View {
    let count: Int
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            Text("\(count) new ↑")
                .dtFont(.label)
                .foregroundStyle(Color.paper)
                .padding(.horizontal, 14)
                .frame(height: 32)
                .background(Capsule().fill(Color.ink))
                .dtNumeric(count)
        }
        .buttonStyle(.plain)
        .shadow(color: Color.ink.opacity(0.16), radius: 32, x: 0, y: 12)
        .accessibilityLabel("\(count) new, scroll to top")
    }
}

// MARK: - Section label (§7.4)

/// "TIMED ✶ 3" on the gutter with a 1pt `Color.rule` from the label's right edge to the screen edge. `inkMuted` — it is the
/// feed's table of contents (DESIGN §8).
struct SectionLabel: View {
    let text: String
    var count: Int? = nil
    var starred = false

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                Text(text).dtFont(.label).foregroundStyle(.inkMuted)
                if starred { Text("✶").dtFont(.label).foregroundStyle(Color.dt).accessibilityHidden(true) }
                if let count { Text("\(count)").dtFont(.label).foregroundStyle(.inkMuted).dtNumeric(count) }
            }
            Rectangle().fill(DTContrastAware(token: .rule)).frame(height: 1)
        }
        .padding(.leading, Space.gutter)
        .padding(.top, Space.sectionAbove)
        .padding(.bottom, Space.sectionBelow)
        .background(Color.paper)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - MetaLine

/// Compound metadata joined with " · " (the separators in `inkFaint`, the parts in the caller's style).
struct MetaLine: View {
    let parts: [Text]

    init(_ parts: [Text]) { self.parts = parts }
    init(_ strings: [String]) { parts = strings.map { Text($0) } }

    var body: some View {
        parts.enumerated().reduce(Text("")) { acc, item in
            if item.offset == 0 { return item.element }
            let dot = Text(" · ").foregroundStyle(Color.inkFaint)
            return Text("\(acc)\(dot)\(item.element)")
        }
    }
}

// MARK: - DTButton (ARCHITECTURE §13; the four CTA idioms DESIGN uses)

nonisolated enum DTButtonVariant: Hashable, Sendable, CaseIterable {
    /// `Color.dt` fill / `Color.onDt` text, pill (SEND CODE, POST, STILL DOWN).
    case primary
    /// 1pt `Color.ink` stroke / `Color.ink` text (CAN'T MAKE IT, GO TO SQUAD →).
    case outline
    /// `Color.ink` fill / `Color.paper` text (SEND REPORT).
    case inverted
    /// `.dtInk` text only in a 44pt target (OPEN →, ACCEPT, EDIT).
    case text
}

nonisolated enum DTButtonSize: Hashable, Sendable, CaseIterable {
    /// `Font.dt.button`, 36 tall.
    case button
    /// `Font.dt.buttonLarge`, 52 tall, full width.
    case buttonLarge
}

struct DTButton: View {
    let title: String
    var variant: DTButtonVariant = .primary
    var size: DTButtonSize = .button
    var disabled = false
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Text(title)
                .dtFont(size == .buttonLarge ? .buttonLarge : .button)
                .foregroundStyle(textStyle)
                .padding(.horizontal, variant == .text ? 8 : 20)
                .frame(maxWidth: size == .buttonLarge ? .infinity : nil)
                .frame(height: size == .buttonLarge ? 52 : (variant == .text ? 44 : 36))
                .background(Capsule().fill(fillStyle))
                .overlay { if variant == .outline { Capsule().strokeBorder(disabled ? Color.inkFaint : Color.ink, lineWidth: 1) } }
                .contentShape(Rectangle())
        }
        .buttonStyle(DTPressStyle())
        .disabled(disabled)
    }

    private var textStyle: AnyShapeStyle {
        if disabled { return AnyShapeStyle(DTStockInk(token: .inkMuted)) }
        switch variant {
        case .primary: return AnyShapeStyle(DTContrastAware(token: .onDtFill))
        case .outline: return AnyShapeStyle(Color.ink)
        case .inverted: return AnyShapeStyle(Color.paper)
        case .text: return AnyShapeStyle(DTStockInk(token: .dtInk))
        }
    }

    private var fillStyle: AnyShapeStyle {
        if disabled && variant != .text && variant != .outline { return AnyShapeStyle(Color.ruleLight) }
        switch variant {
        case .primary: return AnyShapeStyle(DTContrastAware(token: .dtFill))
        case .inverted: return AnyShapeStyle(Color.ink)
        case .outline, .text: return AnyShapeStyle(Color.clear)
        }
    }
}

/// Press: scale 0.97 in 60ms ease-out, release `DTSpring.ink` (DESIGN §0 "fast down, weighty up").
struct DTPressStyle: ButtonStyle {
    @Environment(\.dtReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(configuration.isPressed ? DTCurve.pressIn : DTSpring.ink, value: configuration.isPressed)
    }
}

// MARK: - Previews

#Preview("Pills, dots, badges") {
    VStack(alignment: .leading, spacing: 16) {
        HStack { Pill(text: "chill"); Pill(text: "loud", selected: true); Pill(text: "@sara", style: .mention); Pill(text: "WHEN · tmr 7pm", style: .setting) }
        HStack { Pill(text: "friends", style: .visibility(isPublic: false)); Pill(text: "public", style: .visibility(isPublic: true)); Pill(text: "waitlist", style: .waitlist) }
        HStack(spacing: 16) { NotificationDot(); NotificationBadge(count: 3); NotificationBadge(count: 120); SquadUnreadDot(); NewItemsPill(count: 2) }
        HStack { NewFlag() }
        SectionLabel(text: "timed", count: 3, starred: true)
        MetaLine([Text("Feb 15"), Text("8pm"), Text("expires 3d")]).dtFont(.bodySmall).foregroundStyle(.inkMuted)
        VStack(spacing: 8) {
            DTButton(title: "send code →", variant: .primary, size: .buttonLarge)
            HStack { DTButton(title: "can't make it", variant: .outline); DTButton(title: "send report", variant: .inverted); DTButton(title: "open →", variant: .text) }
            DTButton(title: "down first", variant: .primary, size: .buttonLarge, disabled: true)
        }
    }
    .padding(Space.gutter)
    .background(Color.paper)
}
