// Features/Squads/ImageViewer.swift — full-screen `Color.ink`, pinch + pan, drag-down > 80 pt dismisses (DESIGN §7.8).
import SwiftUI

struct ImageViewer: View {
    let url: URL
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var drag: CGSize = .zero

    var body: some View {
        ZStack {
            Color.ink.ignoresSafeArea()
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .scaleEffect(scale)
                    .offset(CGSize(width: offset.width + drag.width, height: offset.height + drag.height))
                    .gesture(MagnifyGesture().onChanged { v in scale = max(1, lastScale * v.magnification) }.onEnded { _ in lastScale = scale; if scale == 1 { offset = .zero } })
                    .simultaneousGesture(DragGesture().onChanged { v in drag = v.translation }.onEnded { v in
                        if scale == 1, v.translation.height > 80 { dismiss() } else if scale > 1 { offset.width += v.translation.width; offset.height += v.translation.height }
                        drag = .zero
                    })
                    .animation(DTSpring.settle, value: scale)
                    .accessibilityLabel("image")
                    .accessibilityAddTraits(.isImage)
            } else {
                RoundedRectangle(cornerRadius: Radius.m).fill(Color.surface.opacity(0.2)).frame(width: 240, height: 180).dtShimmer()
            }
            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: { Text("×").dtFont(.title, size: 28).foregroundStyle(Color.paper).frame(width: 44, height: 44) }
                        .buttonStyle(.plain).accessibilityLabel("close")
                }
                Spacer()
            }
            .padding(8)
        }
        .onTapGesture(count: 2) { withAnimation(DTSpring.snap) { scale = scale > 1 ? 1 : 2; lastScale = scale; if scale == 1 { offset = .zero } } }
        .task { if let data = try? await env.images.data(for: url) { image = UIImage(data: data) } }
    }
}
