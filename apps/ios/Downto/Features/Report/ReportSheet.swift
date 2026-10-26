// Downto/Features/Report/ReportSheet.swift — PLACEHOLDER (LANE: social). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct ReportSheet: View {
    let target: ReportTarget
    let id: UUID
    var body: some View { DTSheetShell(title: "report") { Text("pending").dtFont(.body).padding() } }
}
