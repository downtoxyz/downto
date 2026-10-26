// Downto/Features/Squads/ImageViewer.swift — PLACEHOLDER (LANE: squads). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct ImageViewer: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    var body: some View { ZStack { Color.ink.ignoresSafeArea(); AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() } }.onTapGesture { dismiss() } }
}
