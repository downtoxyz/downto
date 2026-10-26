// Downto/Features/Feed/DeletedCheckView.swift — PLACEHOLDER (LANE: feed). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct DeletedCheckView: View {
    let checkId: CheckID
    let isMine: Bool
    var body: some View { EmptyState(headline: "press f", line: "that check is gone").background(InteractivePopEnabler().frame(width: 0, height: 0)) }
}
