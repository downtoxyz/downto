// DesignSystem/Sheets/DTSheet.swift — `.dtSheet(detents:)` (DESIGN §4.9; DECISIONS #12): native .sheet, surface stock + grain,
// 24 corner radius, custom widening handle, `.presentationContentInteraction(.scrolls)`, block stagger. Confirms are native
// `.confirmationDialog` (`.dtConfirmDialog` below is the app's typed wrapper over it).
import SwiftUI

/// The shell every sheet's content sits in: handle region (24pt touch-none), then the content on the 24 gutter.
struct DTSheetShell<Content: View>: View {
    var title: String? = nil
    var trailingAction: (title: String, action: () -> Void)? = nil
    @ViewBuilder let content: Content

    @State private var handleActive = false
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            handle
            if title != nil || trailingAction != nil { header }
            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.surface)
        .paperStock(.surface)
        .dtGrain()
    }

    private var handle: some View {
        ZStack {
            Color.clear
            Capsule()
                .fill(handleActive ? Color.inkDim : Color.inkFaint)
                .frame(width: handleActive ? 44 : 40, height: 4)
                .animation(DTSpring.snap, value: handleActive)
        }
        .frame(height: 24)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in handleActive = true }
                .onEnded { _ in handleActive = false }
        )
        .padding(.top, 4)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            if let title { Text(title).dtFont(.title).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader) }
            Spacer()
            if let trailing = trailingAction {
                Button(action: trailing.action) {
                    Text(trailing.title).dtFont(.label).foregroundStyle(.dtInk).frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Space.sheetGutter)
        .padding(.top, Space.sheetBelowHandle)
        .padding(.bottom, 8)
    }
}

/// Sheet content fades in per block with a 40ms stagger, `DTSpring.page` (DESIGN §4.9, §5.3).
private struct StaggeredBlock: ViewModifier {
    let index: Int
    @State private var shown = false
    @Environment(\.dtReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 6)
            .onAppear {
                withAnimation(Motion.resolve(.page, reduceMotion: reduceMotion).delay(Motion.staggerDelay(index, reduceMotion: reduceMotion))) { shown = true }
            }
    }
}

extension View {
    func dtStaggered(_ index: Int) -> some View { modifier(StaggeredBlock(index: index)) }

    /// The `.dtSheet` shell modifier: presentation background/corner/handle/interaction per DESIGN §4.9.
    func dtSheet<Content: View>(isPresented: Binding<Bool>, detents: Set<PresentationDetent> = [.fraction(0.72), .large],
                                isDirty: Bool = false, @ViewBuilder content: @escaping () -> Content) -> some View {
        sheet(isPresented: isPresented) {
            DTSheetPresented(detents: detents, isDirty: isDirty, content: content)
        }
    }

    func dtSheet<Item: Identifiable, Content: View>(item: Binding<Item?>, detents: Set<PresentationDetent> = [.fraction(0.72), .large],
                                                    isDirty: Bool = false, @ViewBuilder content: @escaping (Item) -> Content) -> some View {
        sheet(item: item) { value in
            DTSheetPresented(detents: detents, isDirty: isDirty) { content(value) }
        }
    }
}

private struct DTSheetPresented<Content: View>: View {
    let detents: Set<PresentationDetent>
    let isDirty: Bool
    @ViewBuilder let content: () -> Content
    @State private var detent: PresentationDetent = .large
    @State private var detentChanges = 0

    var body: some View {
        content()
            .presentationBackground(Color.surface)
            .presentationCornerRadius(Radius.sheet)
            .presentationDragIndicator(.hidden)
            .presentationBackgroundInteraction(.disabled)
            .presentationContentInteraction(.scrolls)
            .presentationDetents(detents, selection: $detent)
            .interactiveDismissDisabled(isDirty)
            .onAppear { detent = detents.contains(.fraction(0.72)) ? .fraction(0.72) : (detents.first ?? .large) }
            .onChange(of: detent) { _, _ in detentChanges += 1 }
            .dtFeedback(.impact(weight: .light, intensity: 0.5), trigger: detentChanges)
            .paperStock(.surface)
    }
}

// MARK: - Confirm dialog (native, typed)

/// A confirm never has more than two actions plus cancel (DECISIONS #12): a typed wrapper over `.confirmationDialog`.
nonisolated struct DTConfirm: Hashable, Sendable, Identifiable {
    nonisolated struct Action: Hashable, Sendable, Identifiable {
        let id: String
        let title: String
        let destructive: Bool
        init(_ title: String, destructive: Bool = false) {
            id = title
            self.title = title
            self.destructive = destructive
        }
    }

    let id: String
    let title: String
    var message: String? = nil
    let actions: [Action]

    init(_ title: String, message: String? = nil, actions: [Action]) {
        id = title
        self.title = title
        self.message = message
        self.actions = Array(actions.prefix(2))
    }
}

extension View {
    /// `.dtConfirmDialog(item:)` — the DESIGN §7 confirms ("delete this check? the squad chat ends too", "propose a new date? …").
    func dtConfirmDialog(_ confirm: Binding<DTConfirm?>, onAction: @escaping (DTConfirm.Action) -> Void) -> some View {
        confirmationDialog(confirm.wrappedValue?.title ?? "", isPresented: Binding(get: { confirm.wrappedValue != nil }, set: { if !$0 { confirm.wrappedValue = nil } }),
                           titleVisibility: .visible, presenting: confirm.wrappedValue) { value in
            ForEach(value.actions) { a in
                Button(a.title, role: a.destructive ? .destructive : nil) { onAction(a) }
            }
            Button("cancel", role: .cancel) {}
        } message: { value in
            if let m = value.message { Text(m) }
        }
    }
}

/// A static rendering of the dialog's content for the gallery / snapshots (the system sheet cannot be snapshotted).
struct DTConfirmDialogPreview: View {
    let confirm: DTConfirm

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 4) {
                Text(confirm.title).dtFont(.bodySmall).foregroundStyle(.inkMuted)
                if let m = confirm.message { Text(m).dtFont(.meta).foregroundStyle(.inkMuted) }
            }
            .padding(16)
            ForEach(confirm.actions) { a in
                Rectangle().fill(Color.rule).frame(height: 1)
                Text(a.title).dtFont(.body).foregroundStyle(a.destructive ? AnyShapeStyle(DTStockInk(token: .dangerInk)) : AnyShapeStyle(Color.ink)).frame(height: 52)
            }
        }
        .frame(maxWidth: .infinity)
        .background(Radius.shape(Radius.l).fill(Color.deep))
        .paperStock(.deep)
        .overlay {
            VStack { Spacer(); Text("cancel").dtFont(.body).foregroundStyle(Color.ink).frame(height: 52).frame(maxWidth: .infinity).background(Radius.shape(Radius.l).fill(Color.deep)).offset(y: 60) }
        }
        .padding(.bottom, 60)
    }
}

#Preview("DTSheet shell") {
    DTSheetShell(title: "notifications", trailingAction: ("CLEAR", {})) {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<3) { i in
                Text("block \(i)").dtFont(.body).foregroundStyle(Color.ink).dtStaggered(i)
            }
            Text("OPEN →").dtFont(.button).foregroundStyle(.dtInk)
        }
        .padding(.horizontal, Space.sheetGutter)
    }
    .frame(height: 320)
    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24))
    .elevation(.laid)
}

#Preview("Confirm") {
    DTConfirmDialogPreview(confirm: DTConfirm("delete this check?", message: "the squad chat ends too", actions: [.init("delete", destructive: true)]))
        .padding(20)
        .background(Color.paper)
}
