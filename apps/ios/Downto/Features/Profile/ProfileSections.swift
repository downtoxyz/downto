// Features/Profile/ProfileSections.swift — the colophon rows + ARCHIVE / PEOPLE sections of ProfileView (DESIGN §7.10).
import SwiftUI

/// A 52 pt colophon row with a hairline: label left, trailing content right.
struct ColophonRow<Trailing: View>: View {
    let title: String
    var titleStyle: AnyShapeStyle = AnyShapeStyle(Color.ink)
    var action: (() -> Void)? = nil
    @ViewBuilder let trailing: Trailing

    var body: some View {
        Group {
            if let action {
                Button(action: action) { content.contentShape(Rectangle()) }.buttonStyle(DTPressStyle())
            } else {
                content
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }

    private var content: some View {
        HStack(spacing: 12) {
            Text(title).dtFont(.body).foregroundStyle(titleStyle)
            Spacer(minLength: 8)
            trailing
        }
        .frame(minHeight: 52)
    }
}

/// Archived checks with RESTORE (ARCHITECTURE §15 "Profile").
struct ArchivedChecksSection: View {
    @Environment(AppEnvironment.self) private var env
    @State private var busy: Set<CheckID> = []

    var body: some View {
        let rows = env.profile.archived
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "archive", count: rows.count).padding(.leading, -Space.gutter)
                ForEach(rows) { c in
                    ColophonRow(title: c.text) {
                        if busy.contains(c.id) {
                            Text("RESTORING").dtFont(.button).foregroundStyle(.inkMuted)
                        } else {
                            Button {
                                busy.insert(c.id)
                                Task {
                                    do { try await env.profile.restore(c.id); await env.feed.refresh(); env.toasts.show("back on the feed ✶", style: .success) }
                                    catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
                                    busy.remove(c.id)
                                }
                            } label: { Text("RESTORE").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .animation(DTSpring.page, value: rows.map(\.id))
        }
    }
}

/// Blocked users with UNBLOCK.
struct BlockedUsersSection: View {
    @Environment(AppEnvironment.self) private var env
    @State private var busy: Set<UserID> = []

    var body: some View {
        let rows = env.friends.blocked
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "blocked", count: rows.count).padding(.leading, -Space.gutter)
                ForEach(rows, id: \.id) { p in
                    ColophonRow(title: p.displayName) {
                        Button {
                            busy.insert(p.id)
                            Task { await env.friends.unblock(p.id); busy.remove(p.id) }
                        } label: { Text("UNBLOCK").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }
                        .buttonStyle(.plain)
                        .disabled(busy.contains(p.id))
                    }
                }
            }
            .animation(DTSpring.page, value: rows.map(\.id))
        }
    }
}

/// The physical 3-segment availability slider (DESIGN §7.10): `Color.surface` track, `Color.dt` pill sliding with DTSpring.stamp.
struct AvailabilitySlider: View {
    let value: Availability?
    let onChange: (Availability) -> Void
    @Namespace private var pill
    @State private var taps = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    private let options: [Availability] = [.open, .awkward, .notAvailable]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { o in
                let selected = value == o
                Button {
                    guard !selected else { return }
                    taps += 1
                    withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : DTSpring.stamp) { onChange(o) }
                } label: {
                    Text("\(o.word) \(o.glyph ?? "")")
                        .dtFont(.label)
                        .foregroundStyle(selected ? AnyShapeStyle(Color.onDt) : AnyShapeStyle(.inkMuted))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background {
                            if selected { Capsule().fill(Color.dt).matchedGeometryEffect(id: "availability-pill", in: pill) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(o.word)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .padding(4)
        .frame(height: 48)
        .background(Capsule().fill(Color.surface))
        .paperStock(.surface)
        .dtFeedback(.selection, trigger: taps)
    }
}
