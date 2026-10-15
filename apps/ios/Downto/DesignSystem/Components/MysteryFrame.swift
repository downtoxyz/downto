// DesignSystem/Components/MysteryFrame.swift — the "?" frame (DESIGN §4.1; DECISIONS #9). A Canvas that resolves one Text("?")
// and stamps it along the inset rectangle, 16pt pitch, "¿" at the corners, opacity wave 0.55 ↔ 1.0 (period 2.4s, phase index × 0.12s).
// `progress` < 1 draws the frame clockwise from top-left (Create overlay: glyphs appear 12ms apart; reveal fuse: they flip to ✦ and fade).
import SwiftUI

struct MysteryFrame: View {
    /// 0 → 1 draws the frame clockwise; 1 is the full frame.
    var progress: Double = 1
    /// Reveal fuse (DESIGN §5.7): glyphs flip to "✦" then fade clockwise; 0 = intact, 1 = burnt.
    var burn: Double = 0
    var inset: CGFloat = 8
    var pitch: CGFloat = 16

    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                frame(time: nil)
            } else {
                TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                    frame(time: context.date.timeIntervalSinceReferenceDate)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func frame(time: TimeInterval?) -> some View {
        Canvas { ctx, size in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: inset, dy: inset)
            guard rect.width > pitch, rect.height > pitch else { return }
            let question = ctx.resolve(Text("?").dtStyle(.badge).foregroundStyle(Color.newInk))
            let corner = ctx.resolve(Text("¿").dtStyle(.badge).foregroundStyle(Color.newInk))
            let spark = ctx.resolve(Text("✦").dtStyle(.badge).foregroundStyle(Color.dt))
            let points = Self.points(around: rect, pitch: pitch)
            let n = points.count
            let visible = Int((progress * Double(n)).rounded(.up))
            for (i, p) in points.enumerated() {
                guard i < visible else { break }
                let burnt = Double(i) / Double(max(1, n)) < burn
                var opacity: Double
                if let time {
                    let phase = time + Double(i) * 0.12
                    opacity = 0.775 + 0.225 * sin(phase / 2.4 * 2 * .pi)
                } else {
                    opacity = 0.85
                }
                if burnt {
                    // burnt glyphs: the ✦ fades out as the burn front passes
                    let distance = burn - Double(i) / Double(max(1, n))
                    opacity = max(0, 1 - distance * 6)
                    guard opacity > 0 else { continue }
                    ctx.opacity = opacity
                    ctx.draw(spark, at: p.point, anchor: .center)
                } else {
                    ctx.opacity = opacity
                    ctx.draw(p.isCorner ? corner : question, at: p.point, anchor: .center)
                }
                ctx.opacity = 1
            }
        }
    }

    nonisolated struct FramePoint: Hashable, Sendable {
        let point: CGPoint
        let isCorner: Bool
    }

    /// Points sampled clockwise from the top-left corner: top edge → right edge → bottom edge → left edge.
    nonisolated static func points(around rect: CGRect, pitch: CGFloat) -> [FramePoint] {
        var out: [FramePoint] = []
        let cols = max(1, Int(rect.width / pitch))
        let rows = max(1, Int(rect.height / pitch))
        let dx = rect.width / CGFloat(cols)
        let dy = rect.height / CGFloat(rows)
        for c in 0..<cols { out.append(FramePoint(point: CGPoint(x: rect.minX + CGFloat(c) * dx, y: rect.minY), isCorner: c == 0)) }
        for r in 0..<rows { out.append(FramePoint(point: CGPoint(x: rect.maxX, y: rect.minY + CGFloat(r) * dy), isCorner: r == 0)) }
        for c in 0..<cols { out.append(FramePoint(point: CGPoint(x: rect.maxX - CGFloat(c) * dx, y: rect.maxY), isCorner: c == 0)) }
        for r in 0..<rows { out.append(FramePoint(point: CGPoint(x: rect.minX, y: rect.maxY - CGFloat(r) * dy), isCorner: r == 0)) }
        return out
    }
}

#Preview("MysteryFrame") {
    VStack(spacing: 20) {
        Color.checkNew.frame(height: 140).overlay { MysteryFrame() }
        Color.paper.frame(height: 100).overlay { MysteryFrame(progress: 0.5) }
        Color.paper.frame(height: 100).overlay { MysteryFrame(burn: 0.5) }
    }
    .padding()
    .background(Color.paper)
}
