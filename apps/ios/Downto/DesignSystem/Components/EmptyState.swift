// DesignSystem/Components/EmptyState.swift — the "✶" colophon page (DESIGN §4.13; DECISIONS #22) and the error colophon (§7.15).
import SwiftUI

struct EmptyState: View {
    let headline: String
    var line: String? = nil
    var cta: String? = nil
    var onCTA: () -> Void = {}

    @State private var spun = false
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 24) {
            Text("✶")
                .dtFont(.masthead)
                .foregroundStyle(Color.dt)
                .rotationEffect(.degrees(spun || reduceMotion ? 360 : 0))
                .accessibilityHidden(true)
            VStack(spacing: 12) {
                WobbleText(text: headline, style: .display)
                    .foregroundStyle(Color.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                if let line {
                    Text(line).dtFont(.body).foregroundStyle(.inkMuted).multilineTextAlignment(.center)
                }
                if let cta {
                    Button(action: onCTA) {
                        Text(cta).dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: 1.2)) { spun = true }
        }
    }
}

/// Inline; replaces the failed block, not a modal. "✶" in inkMuted (nothing to celebrate), a headline from the pool, the honest cause, RETRY.
struct ErrorColophon: View {
    var headline: String = ErrorColophon.pool[0]
    var cause: String? = nil
    var retry: (() -> Void)? = nil
    var retryTitle = "RETRY"

    static let pool = ["the press jammed.", "couldn't load that.", "something's off on our end."]

    @State private var errors = 0

    var body: some View {
        VStack(spacing: 12) {
            Text("✶").dtFont(.display).foregroundStyle(.inkMuted).accessibilityHidden(true)
            Text(headline).dtFont(.headline).foregroundStyle(Color.ink).multilineTextAlignment(.center)
            if let cause { Text(cause).dtFont(.bodySmall).foregroundStyle(.inkMuted).multilineTextAlignment(.center) }
            if let retry {
                Button(action: retry) { Text(retryTitle).dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
        .onAppear { errors += 1 }
        .dtFeedback(.error, trigger: errors)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: retryTitle) { retry?() }
    }
}

#Preview("Empty + error") {
    VStack {
        EmptyState(headline: "nothing's on.", line: "post a check and see who bites", cta: "POST A CHECK →").frame(height: 320)
        ErrorColophon(cause: "no connection", retry: {})
    }
    .background(Color.paper)
}
