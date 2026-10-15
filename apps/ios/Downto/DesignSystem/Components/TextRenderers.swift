// DesignSystem/Components/TextRenderers.swift — ScrambleRenderer + WobbleRenderer (DESIGN §5.9) and LinkifiedText (ARCHITECTURE §13).
// Both renderers draw their final state immediately when Reduce Motion is on.
import SwiftUI

/// Mystery name reveal: glyph *i* of *n* is settled when `progress ≥ (i + 1) / n`; before that it draws a random symbol
/// re-picked every 25ms, seeded by `(i, frame)` so it is deterministic per frame.
struct ScrambleRenderer: TextRenderer, Animatable {
    var progress: Double
    var elapsed: Double
    var reduceMotion = false

    static let symbols: [Character] = Array("§∆®∂ø†¥¨ˆπ∑´≈ç√∫˜µ≤≥÷≠∞ᛞᛟᚠᚱ")

    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(progress, elapsed) }
        set { progress = newValue.first; elapsed = newValue.second }
    }

    func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
        let slices = layout.flatMap { line in line.flatMap { run in Array(run) } }
        let n = max(1, slices.count)
        let frame = Int(elapsed / 0.025)
        for (i, slice) in slices.enumerated() {
            let settled = reduceMotion || progress >= Double(i + 1) / Double(n)
            if settled {
                ctx.draw(slice)
            } else {
                var hasher = Hasher()
                hasher.combine(i)
                hasher.combine(frame)
                let idx = abs(hasher.finalize()) % Self.symbols.count
                let rect = slice.typographicBounds.rect
                ctx.draw(Text(String(Self.symbols[idx])).foregroundStyle(Color.inkMuted), at: CGPoint(x: rect.midX, y: rect.midY), anchor: .center)
            }
        }
    }
}

/// Drop-in for the deleted-check quip, empty-state headlines and the "WAITLISTED" label: each glyph from `offset(y: −6)` + opacity,
/// 20ms stagger. `progress` 0 → 1 covers the whole string.
struct WobbleRenderer: TextRenderer, Animatable {
    var progress: Double
    var reduceMotion = false

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
        let slices = layout.flatMap { line in line.flatMap { run in Array(run) } }
        let n = max(1, slices.count)
        for (i, slice) in slices.enumerated() {
            let start = Double(i) / Double(n)
            let local = reduceMotion ? 1 : max(0, min(1, (progress - start) / (1 - start + 0.0001) * 2))
            var copy = ctx
            copy.opacity = local
            copy.translateBy(x: 0, y: -6 * (1 - local))
            copy.draw(slice)
        }
    }
}

/// Drives a `WobbleRenderer` from 0 → 1 on appear (DESIGN §4.13, §4.3 "typed at you" labels).
struct WobbleText: View {
    let text: String
    var style: DTTextStyle = .display
    @State private var progress: Double = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        Text(text)
            .dtFont(style)
            .textRenderer(WobbleRenderer(progress: progress, reduceMotion: reduceMotion))
            .onAppear {
                if reduceMotion {
                    progress = 1
                } else {
                    withAnimation(.linear(duration: 0.02 * Double(max(1, text.count)) + 0.3)) { progress = 1 }
                }
            }
    }
}

/// Drives a `ScrambleRenderer`: unscrambles left to right over `duration` (DESIGN §5.7 step 3).
struct ScrambleText: View {
    let text: String
    var style: DTTextStyle = .meta
    var duration: Double = 0.6
    var revealed = true
    @State private var progress: Double = 0
    @State private var elapsed: Double = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        Text(text)
            .dtFont(style)
            .textRenderer(ScrambleRenderer(progress: revealed ? progress : 0, elapsed: elapsed, reduceMotion: reduceMotion))
            .onChange(of: revealed, initial: true) { _, on in
                guard on else { progress = 0; return }
                if reduceMotion {
                    progress = 1
                } else {
                    withAnimation(.linear(duration: duration)) { progress = 1; elapsed = duration }
                }
            }
    }
}

// MARK: - LinkifiedText

/// URLs and `@username` in `.dtInk` weight 500, no underline on the feed; 1pt `ruleMid` underline on links in chat.
/// Masked mode shows "@???" untinted (ARCHITECTURE §9).
nonisolated enum Linkify {
    static func attributed(_ text: String, mentions: Set<String>, style: DTTextStyle, linkColor: Color, underline: Bool, masked: Bool) -> AttributedString {
        var out = AttributedString(text)
        let ns = text as NSString
        let pattern = #"(https?://[^\s]+)|(@[a-z0-9_]{1,30})"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return out }
        for m in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let range = Range(m.range, in: text), let aRange = Range(range, in: out) else { continue }
            let token = String(text[range])
            if token.hasPrefix("@") {
                if masked {
                    out.replaceSubrange(aRange, with: AttributedString("@???"))
                    continue
                }
                guard mentions.isEmpty || mentions.contains(String(token.dropFirst()).lowercased()) else { continue }
            }
            out[aRange].foregroundColor = linkColor
            out[aRange].font = style.font(face: mentionFace(for: style))
            if underline, !token.hasPrefix("@") { out[aRange].underlineStyle = .single; out[aRange].underlineColor = UIColor(Color.ruleMid) }
            if !token.hasPrefix("@"), let url = URL(string: token) { out[aRange].link = url }
        }
        return out
    }

    /// Weight 500 for the link run: Inter → wght 500, Plex → the Medium cut.
    private static func mentionFace(for style: DTTextStyle) -> DTTextStyle.Face {
        switch style.spec.face {
        case .inter(_, let opsz, let tabular): .inter(wght: 500, opsz: opsz, tabular: tabular)
        case .plex, .kaomoji: .plex(.medium)
        }
    }
}

struct LinkifiedText: View {
    let text: String
    var mentions: Set<String> = []
    var style: DTTextStyle = .checkText
    var underline = false
    var masked = false

    @Environment(\.paperStock) private var stock
    @Environment(\.dtIncreaseContrast) private var increaseContrast

    var body: some View {
        Text(Linkify.attributed(text, mentions: mentions, style: style, linkColor: DTInkToken.dtInk.resolve(stock: stock, increaseContrast: increaseContrast), underline: underline, masked: masked))
            .dtFont(style)
    }
}

#Preview("Text renderers") {
    VStack(alignment: .leading, spacing: 20) {
        WobbleText(text: "nothing's on.")
        ScrambleText(text: "devon", style: .headline)
        LinkifiedText(text: "who's down for karaoke w/ @sara? https://example.com/x", mentions: ["sara"])
        LinkifiedText(text: "@sara knows", masked: true)
    }
    .foregroundStyle(Color.ink)
    .padding(Space.gutter)
    .background(Color.paper)
}
