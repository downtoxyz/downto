// Features/Notifications/NotificationRow.swift — one 64 pt bell row (DESIGN §7.9): decorative glyph circle, title, body, time.
import SwiftUI

/// "2m" / "3h" / "4d" — the compact relative time every row uses.
nonisolated enum RelativeTime {
    static func short(_ date: Date, now: Date = .now) -> String {
        let s = max(0, Int(now.timeIntervalSince(date)))
        switch s {
        case ..<60: return "now"
        case ..<3600: return "\(s / 60)m"
        case ..<86_400: return "\(s / 3600)h"
        case ..<(86_400 * 7): return "\(s / 86_400)d"
        default: return "\(s / (86_400 * 7))w"
        }
    }
}

struct NotificationGlyphCircle: View {
    let glyph: NotificationGlyph

    var body: some View {
        Text(glyph.glyph)
            .dtFont(.headline, face: .plex(.medium))
            .foregroundStyle(ink)
            .frame(width: 32, height: 32)
            .background(Circle().fill(fill))
            .accessibilityHidden(true)
    }

    private var fill: Color {
        switch glyph.tint {
        case .dt: .dtLight
        case .squad: Color.squad.opacity(0.2)
        case .warn: Color.warn.opacity(0.2)
        case .pool: Color.pool.opacity(0.2)
        case .danger: Color.danger.opacity(0.2)
        case .newLime: .newLime
        case .unknown: .ruleLight
        }
    }

    private var ink: AnyShapeStyle {
        switch glyph.tint {
        case .dt: AnyShapeStyle(.dtInk)
        case .squad: AnyShapeStyle(.squadInk)
        case .warn: AnyShapeStyle(.warnInk)
        case .pool: AnyShapeStyle(.poolInk)
        case .danger: AnyShapeStyle(.dangerInk)
        case .newLime: AnyShapeStyle(Color.newInk)
        case .unknown: AnyShapeStyle(Color.ink)
        }
    }
}

struct NotificationRow: View {
    let notification: AppNotification
    let body_: String
    /// Unread at the moment the sheet opened; the band fades after presentation (the fade is the marking).
    let wasUnread: Bool
    var fadeUnread = false
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                NotificationGlyphCircle(glyph: NotificationGlyph(notification.type))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if wasUnread && !fadeUnread { Circle().fill(Color.dt).frame(width: 6, height: 6).accessibilityHidden(true) }
                        Text(notification.title)
                            .dtFont(.bodySmall, face: wasUnread ? .plex(.bold) : nil)
                            .foregroundStyle(Color.ink)
                            .lineLimit(1)
                    }
                    if !body_.isEmpty && body_ != notification.title {
                        Text(body_).dtFont(.meta).foregroundStyle(.inkMuted).lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                Text(RelativeTime.short(notification.createdAt)).dtFont(.meta).foregroundStyle(.inkMuted)
            }
            .padding(.horizontal, Space.sheetGutter)
            .padding(.vertical, 10)
            .frame(minHeight: 64, alignment: .center)
            .background(wasUnread && !fadeUnread ? Color.checkNew.opacity(0.5) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(DTPressStyle())
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1).padding(.leading, Space.sheetGutter + 44) }
        .accessibilityLabel("\(notification.title). \(body_). \(RelativeTime.short(notification.createdAt)) ago\(wasUnread ? ", unread" : "")")
    }
}
