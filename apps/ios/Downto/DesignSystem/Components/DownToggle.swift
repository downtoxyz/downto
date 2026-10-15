// DesignSystem/Components/DownToggle.swift — DESIGN §4.3 (DECISIONS #11). Pill 36 tall, min width 88, radial dye from the finger,
// squash → overshoot with DTSpring.stamp, three haptics + .success on ack. State-driven and interruptible.
import SwiftUI

nonisolated enum DownToggleState: Hashable, Sendable {
    case idle
    case pressed
    case active
    case activePressed
    case waitlisted(position: Int)
    /// Optimistic: rendered as the target state with the label at 0.7 until the server acks.
    case pending(target: DownToggleTarget)
    /// Expired: "CLOSED", not tappable.
    case closed

    nonisolated enum DownToggleTarget: Hashable, Sendable { case down, idle }

    var isActiveLook: Bool {
        switch self {
        case .active, .activePressed: true
        case .pending(let t): t == .down
        default: false
        }
    }

    var isPressedLook: Bool {
        switch self {
        case .pressed, .activePressed: true
        default: false
        }
    }

    var label: String {
        switch self {
        case .idle, .pressed: "DOWN ?"
        case .active, .activePressed: "DOWN ✓"
        case .waitlisted: "WAITLISTED"
        case .pending(let t): t == .down ? "DOWN ✓" : "DOWN ?"
        case .closed: "CLOSED"
        }
    }

    var accessibilityValue: String {
        switch self {
        case .idle, .pressed: "not down"
        case .active, .activePressed: "down"
        case .waitlisted(let p): "waitlisted, position \(p)"
        case .pending: "updating"
        case .closed: "closed"
        }
    }

    var isInteractive: Bool {
        switch self {
        case .closed, .pending: false
        default: true
        }
    }
}

/// Fired by the toggle so the entry can dye its band 60ms after the apex (DESIGN §4.3 "cause, then effect").
nonisolated enum DownToggleEvent: Hashable, Sendable {
    case touchDown
    case stamped
    case undone
    case waitlistTapped
}

struct DownToggle: View {
    let state: DownToggleState
    /// Called on tap with the event; the parent flips `state` (optimistically) and calls the server.
    var onEvent: (DownToggleEvent) -> Void = { _ in }
    /// Feed offline: labels intact, `inkFaint` outline, not tappable (DESIGN §7.15).
    var disabledOffline = false

    @State private var touch: CGPoint? = nil
    @State private var pressed = false
    @State private var sweepRadius: CGFloat = 0
    @State private var showActiveLabel = false
    @State private var overshoot: CGFloat = 1
    @State private var touchDownCount = 0
    @State private var apexCount = 0
    @State private var undoCount = 0
    @State private var checkBounce = 0
    @State private var dashTrim: CGFloat = 1
    @State private var sequence: Task<Void, Never>? = nil

    @Environment(\.dtReduceMotion) private var reduceMotion
    @Environment(\.dtIncreaseContrast) private var increaseContrast
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private let height: CGFloat = 36
    private let minWidth: CGFloat = 88

    private var effectivePressed: Bool { pressed || state.isPressedLook }
    private var activeLook: Bool { state.isActiveLook }
    private var isWaitlisted: Bool { if case .waitlisted = state { true } else { false } }
    private var isClosed: Bool { state == .closed }

    var body: some View {
        ZStack {
            // Base fill
            Capsule().fill(baseFill)
            // Radial magenta fill masked by a circle from the touch point
            if activeLook || sweepRadius > 0 {
                Capsule()
                    .fill(DTContrastAware(token: .dtFill))
                    .opacity(effectivePressed && activeLook ? 0.85 : 1)
                    .mask {
                        GeometryReader { geo in
                            let origin = touch ?? CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                            let full = activeLook && sweepRadius == 0 ? max(geo.size.width, geo.size.height) * 2 : sweepRadius
                            Circle()
                                .frame(width: full * 2, height: full * 2)
                                .position(origin)
                        }
                    }
            }
            // Border
            border
            // Label
            label
        }
        .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : minWidth, maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil)
        .frame(height: dynamicTypeSize.isAccessibilitySize ? 44 : height)
        .scaleEffect(x: effectivePressed && !reduceMotion ? 1.02 * overshoot : overshoot, y: effectivePressed && !reduceMotion ? 0.94 * overshoot : overshoot)
        .animation(effectivePressed ? DTCurve.pressIn : DTSpring.stamp, value: effectivePressed)
        .contentShape(Rectangle().size(width: max(100, minWidth + 12), height: 44).offset(x: -6, y: -4))
        .frame(minHeight: 44)
        .highPriorityGesture(pressGesture, including: state.isInteractive && !disabledOffline ? .all : .subviews)
        .dtFeedback(.impact(flexibility: .soft, intensity: 0.5), trigger: touchDownCount)
        .dtFeedback(.impact(flexibility: .rigid, intensity: 0.9), trigger: apexCount)
        .dtFeedback(.impact(weight: .light), trigger: undoCount)
        .onChange(of: state) { old, new in reconcile(from: old, to: new) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("down")
        .accessibilityValue(state.accessibilityValue)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { tap(at: nil) }
    }

    // MARK: Looks

    private var baseFill: AnyShapeStyle {
        if disabledOffline || isClosed { return AnyShapeStyle(Color.clear) }
        if isWaitlisted { return AnyShapeStyle(Color.waitlistBg) }
        if effectivePressed && !activeLook { return AnyShapeStyle(Color.dtSubtle) }
        return AnyShapeStyle(Color.downIdle)
    }

    @ViewBuilder private var border: some View {
        if isWaitlisted {
            Capsule()
                .trim(from: 0, to: dashTrim)
                .stroke(Color.warnInk, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        } else if disabledOffline || isClosed {
            Capsule().strokeBorder(Color.inkFaint, lineWidth: 1)
        } else if activeLook {
            if increaseContrast { Capsule().strokeBorder(Color.ink, lineWidth: 1) }
        } else {
            Capsule().strokeBorder(effectivePressed ? Color.dt : Color.downIdleRule, lineWidth: 1)
        }
    }

    @ViewBuilder private var label: some View {
        let showActive = activeLook || showActiveLabel
        let text: String = isWaitlisted ? "WAITLISTED" : (isClosed ? "CLOSED" : (showActive ? "DOWN" : "DOWN ?"))
        HStack(spacing: 4) {
            if isWaitlisted {
                WobbleText(text: text, style: .button)
            } else {
                Text(text).dtFont(.button)
            }
            if showActive && !isWaitlisted && !isClosed {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .symbolEffect(.bounce.up.byLayer, value: checkBounce)
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(labelStyle)
        .opacity({ if case .pending = state { 0.7 } else { 1 } }())
        .padding(.horizontal, 14)
        .animation(DTCurve.crossfade, value: showActive)
    }

    private var labelStyle: AnyShapeStyle {
        if isWaitlisted { return AnyShapeStyle(Color.warnInk) }
        if isClosed || disabledOffline { return AnyShapeStyle(DTStockInk(token: .inkMuted)) }
        if activeLook || showActiveLabel { return AnyShapeStyle(DTContrastAware(token: .onDtFill)) }
        return AnyShapeStyle(DTStockInk(token: .dtInk))
    }

    // MARK: Gesture — the toggle owns its touch (DESIGN §4.1 rule 4: a press on the pill never tints the row)

    private var pressGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                if !pressed {
                    pressed = true
                    touch = value.startLocation
                    touchDownCount += 1
                    onEvent(.touchDown)
                }
                let inside = abs(value.translation.width) < 60 && abs(value.translation.height) < 40
                if pressed != inside { pressed = inside }
            }
            .onEnded { value in
                let inside = abs(value.translation.width) < 60 && abs(value.translation.height) < 40
                pressed = false
                if inside { tap(at: value.startLocation) }
            }
    }

    private func tap(at point: CGPoint?) {
        switch state {
        case .idle, .pressed:
            stamp(from: point)
        case .active, .activePressed:
            undo()
        case .waitlisted:
            onEvent(.waitlistTapped)
        case .pending, .closed:
            break
        }
    }

    /// The stamp (DESIGN §4.3): sweep 160ms linear from the finger, label at R+80, overshoot 1.06 → 1.0, apex click at R+90.
    private func stamp(from point: CGPoint?) {
        sequence?.cancel()
        touch = point
        onEvent(.stamped)
        if reduceMotion {
            withAnimation(DTCurve.crossfade) { showActiveLabel = true; sweepRadius = 400 }
            apexCount += 1
            return
        }
        withAnimation(DTCurve.wipe) { sweepRadius = 400 }
        withAnimation(DTSpring.stamp) { overshoot = 1.06 }
        sequence = Task {
            try? await Task.sleep(for: .milliseconds(80))
            guard !Task.isCancelled else { return }
            withAnimation(DTCurve.crossfade) { showActiveLabel = true }
            checkBounce += 1
            try? await Task.sleep(for: .milliseconds(10))
            apexCount += 1
            withAnimation(DTSpring.stamp) { overshoot = 1.0 }
        }
    }

    /// Un-down: mask collapses toward the pill centre over 140ms, label at 70ms, no overshoot, `.impact(weight: .light)`.
    private func undo() {
        sequence?.cancel()
        onEvent(.undone)
        undoCount += 1
        withAnimation(reduceMotion ? DTCurve.crossfade : DTCurve.wipeShort) { sweepRadius = 0.001 }
        sequence = Task {
            try? await Task.sleep(for: .milliseconds(70))
            guard !Task.isCancelled else { return }
            withAnimation(DTCurve.crossfade) { showActiveLabel = false }
            sweepRadius = 0
        }
    }

    /// External state changes (server ack, promotion, rollback) retarget the internals without a finger.
    private func reconcile(from old: DownToggleState, to new: DownToggleState) {
        switch (old, new) {
        case (_, .waitlisted):
            // Waitlist landing: the fill drains over 200ms while the dashed border draws in via trim over 350ms.
            sequence?.cancel()
            showActiveLabel = false
            dashTrim = 0
            withAnimation(reduceMotion ? DTCurve.crossfade : .linear(duration: 0.2)) { sweepRadius = 0 }
            withAnimation(reduceMotion ? DTCurve.crossfade : .easeOut(duration: 0.35)) { dashTrim = 1 }
        case (.waitlisted, .active):
            // Promotion: the dashed border un-draws while the fill floods from the pill's centre.
            touch = nil
            withAnimation(.linear(duration: 0.2)) { dashTrim = 0 }
            withAnimation(DTCurve.wipe) { sweepRadius = 400 }
            checkBounce += 1
        case (_, .idle), (_, .closed):
            sequence?.cancel()
            sweepRadius = 0
            showActiveLabel = false
            overshoot = 1
        case (_, .active):
            showActiveLabel = true
            overshoot = 1
        default:
            break
        }
    }
}

#Preview("DownToggle states") {
    VStack(alignment: .leading, spacing: 16) {
        ForEach([DownToggleState.idle, .pressed, .active, .activePressed, .waitlisted(position: 2), .pending(target: .down), .closed], id: \.self) { s in
            HStack {
                Text(String(describing: s)).dtFont(.meta).foregroundStyle(.inkMuted)
                Spacer()
                DownToggle(state: s)
            }
        }
        HStack { Text("offline").dtFont(.meta).foregroundStyle(.inkMuted); Spacer(); DownToggle(state: .idle, disabledOffline: true) }
    }
    .padding(Space.gutter)
    .background(Color.paper)
}
