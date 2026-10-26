// Downto/Features/Squads/SquadChatView.swift — PLACEHOLDER (LANE: squads). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct SquadChatView: View {
    let squadId: SquadID
    var body: some View { Text(verbatim: "chat \(squadId)").dtFont(.body).background(InteractivePopEnabler().frame(width: 0, height: 0)) }
}
