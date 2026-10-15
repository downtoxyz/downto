// DesignSystem/Components/Slip.swift — the toast is a correction slip (DESIGN §4.8). `Slip` is the view, `SlipHost` the bottom-anchored
// presenter; the queue itself is `Stores/ToastCenter.swift` (structure), which hands the host one `SlipItem` at a time.
import SwiftUI

nonisolated enum SlipStyle: Hashable, Sendable {
    case plain, success, error, info
}

nonisolated struct SlipItem: Hashable, Sendable, Identifiable {
    let id: UUID
    let text: String
    var actionTitle: String? = nil
    var style: SlipStyle = .plain
    /// Undo slips get a 2pt `Color.dt` countdown rule along the bottom.
    var countdown = false

    init(id: UUID = UUID(), _ text: String, action: String? = nil, style: SlipStyle = .plain, countdown: Bool = false) {
        self.id = id
        self.text = text
        actionTitle = action
        self.style = style
        self.countdown = countdown
    }

    var duration: Double { actionTitle == nil ? 4 : 6 }
}

struct Slip: View {
    let item: SlipItem
    var onAction: () -> Void = {}
    var onDismiss: () -> Void = {}

    @State private var drag: CGFloat = 0
    @State private var countdown: CGFloat = 1
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 12) {
            Text(item.text)
                .dtFont(.body)
                .foregroundStyle(Color.paper)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let title = item.actionTitle {
                Button(action: onAction) {
                    Text(title).dtFont(.button).foregroundStyle(Color.dt).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .background(Radius.shape(Radius.m).fill(Color.ink))
        .overlay(alignment: .leading) {
            switch item.style {
            case .success: Radius.shape(Radius.m).fill(Color.success).frame(width: 3).padding(.leading, 0).mask(Rectangle().padding(.trailing, 4))
            case .error: Rectangle().fill(Color.danger).frame(width: 3).clipShape(Radius.shape(Radius.m))
            case .info: Rectangle().fill(Color.info).frame(width: 3).clipShape(Radius.shape(Radius.m))
            case .plain: EmptyView()
            }
        }
        .overlay(alignment: .bottomLeading) {
            if item.countdown {
                GeometryReader { geo in
                    Rectangle().fill(Color.dt).frame(width: geo.size.width * countdown, height: 2)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                }
                .padding(.horizontal, Radius.m)
            }
        }
        .clipShape(Radius.shape(Radius.m))
        .elevation(.lifted)
        .offset(y: drag)
        .gesture(
            DragGesture()
                .onChanged { v in drag = v.translation.height > 0 ? v.translation.height : v.translation.height * 0.6 }
                .onEnded { v in
                    if v.translation.height >= 24 { onDismiss() } else { withAnimation(DTSpring.snap) { drag = 0 } }
                }
        )
        .onAppear {
            if item.countdown { withAnimation(.linear(duration: item.duration)) { countdown = 0 } }
        }
        .dtFeedback(.error, trigger: item.style == .error ? item.id : UUID(uuidString: "00000000-0000-0000-0000-000000000000")!)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isStaticText)
    }
}

/// Bottom-anchored host: bottom = Folio top + 12, width = screen − 40; one at a time, a second replaces with a 120ms crossfade.
struct SlipHost: View {
    @Binding var item: SlipItem?
    var onAction: (SlipItem) -> Void = { _ in }
    @Environment(\.dtReduceMotion) private var reduceMotion
    @State private var timer: Task<Void, Never>? = nil

    var body: some View {
        VStack {
            Spacer()
            if let item {
                Slip(item: item, onAction: { onAction(item); dismiss() }, onDismiss: dismiss)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                    .id(item.id)
                    .transition(reduceMotion ? .opacity : .asymmetric(insertion: .offset(y: 16).combined(with: .opacity), removal: .opacity))
            }
        }
        .animation(reduceMotion ? DTCurve.crossfade : DTSpring.page, value: item)
        .onChange(of: item, initial: true) { _, new in
            timer?.cancel()
            guard let new else { return }
            AccessibilityNotification.Announcement(new.text).post()
            timer = Task {
                try? await Task.sleep(for: .seconds(new.duration))
                guard !Task.isCancelled else { return }
                item = nil
            }
        }
    }

    private func dismiss() {
        timer?.cancel()
        item = nil
    }
}

#Preview("Slip") {
    VStack(spacing: 12) {
        Slip(item: SlipItem("check removed — undo?", action: "UNDO", countdown: true))
        Slip(item: SlipItem("squad formed! → open", action: "OPEN", style: .success))
        Slip(item: SlipItem("didn't post — try again", action: "RETRY", style: .error))
        Slip(item: SlipItem("lobby's coming to iOS soon ✶"))
    }
    .padding(20)
    .background(Color.paper)
}
