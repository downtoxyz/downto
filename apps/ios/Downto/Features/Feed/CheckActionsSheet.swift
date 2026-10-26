// Features/Feed/CheckActionsSheet.swift — "⋯" on a non-owner's check (DESIGN §7.5): two 52pt rows, hide / report.
import SwiftUI

struct CheckActionsSheet: View {
    let checkId: CheckID
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    private var isHidden: Bool { env.feed.hidden.contains { $0.id == checkId } }

    var body: some View {
        DTSheetShell {
            VStack(spacing: 0) {
                row(isHidden ? "unhide" : "hide", ink: AnyShapeStyle(Color.ink)) {
                    Task { isHidden ? await env.feed.unhide(checkId) : await env.feed.hide(checkId) }
                    dismiss()
                }
                .dtStaggered(0)
                row("report", ink: AnyShapeStyle(DTStockInk(token: .dangerInk))) {
                    dismiss()
                    env.router.present(.report(.check, checkId.raw))
                }
                .dtStaggered(1)
            }
            .padding(.horizontal, Space.sheetGutter)
            .padding(.bottom, 16)
        }
        .presentationDetents([.height(160)])
    }

    private func row(_ title: String, ink: AnyShapeStyle, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack { Text(title).dtFont(.body).foregroundStyle(ink); Spacer() }
                .frame(height: 52)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hairline(color: .ruleLight)
    }
}
