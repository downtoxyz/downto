// DesignSystem/Haptics.swift — HapticEngine actor + the two composed CoreHaptics patterns (DESIGN §6.2) and the Haptics gate.
// The `.sensoryFeedback` map of DESIGN §6.1 is applied at call sites in its exact spelling; `DTHaptic` is retired (DECISIONS #8).
import CoreHaptics
import SwiftUI

/// A value-type description of a composed pattern; only these cross into the actor.
nonisolated struct HapticPattern: Hashable, Sendable {
    nonisolated struct Transient: Hashable, Sendable {
        let time: Double
        let intensity: Float
        let sharpness: Float
    }

    nonisolated struct Continuous: Hashable, Sendable {
        let time: Double
        let duration: Double
        let intensity: Float
        let intensityEnd: Float
        let sharpness: Float
    }

    let transients: [Transient]
    let continuous: [Continuous]

    /// Pattern A — SQUAD FORMED ("tap-tap-hmmm-THUD"), synced to DESIGN §5.6: the stamp lands at 460ms.
    static let squadFormed = HapticPattern(
        transients: [
            Transient(time: 0.00, intensity: 0.5, sharpness: 0.3),
            Transient(time: 0.09, intensity: 0.7, sharpness: 0.5),
            Transient(time: 0.46, intensity: 1.0, sharpness: 0.8),
        ],
        continuous: [Continuous(time: 0.18, duration: 0.24, intensity: 0.35, intensityEnd: 0, sharpness: 0.2)]
    )

    /// Pattern B — MYSTERY REVEAL, synced to DESIGN §5.7 for `guests` rising avatars (max 6 transients).
    static func mysteryReveal(guests: Int) -> HapticPattern {
        var t = [Transient(time: 0.90, intensity: 0.9, sharpness: 0.4)]
        for k in 0..<max(0, min(guests, 6)) {
            t.append(Transient(time: 1.30 + 0.07 * Double(k), intensity: 0.4, sharpness: 0.9))
        }
        t.append(Transient(time: 1.90, intensity: 0.8, sharpness: 0.5))
        return HapticPattern(
            transients: t,
            continuous: [Continuous(time: 0, duration: 0.85, intensity: 0.15, intensityEnd: 0.35, sharpness: 0.6)]
        )
    }

    static let mysteryReveal = mysteryReveal(guests: 3)

    /// The CoreHaptics events for this description.
    nonisolated func events() -> [CHHapticEvent] {
        var events: [CHHapticEvent] = transients.map {
            CHHapticEvent(eventType: .hapticTransient, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: $0.intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: $0.sharpness),
            ], relativeTime: $0.time)
        }
        for c in continuous {
            events.append(CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: c.intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: c.sharpness),
            ], relativeTime: c.time, duration: c.duration))
        }
        return events
    }

    nonisolated func parameterCurves() -> [CHHapticParameterCurve] {
        continuous.map {
            CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
                CHHapticParameterCurve.ControlPoint(relativeTime: $0.time, value: $0.intensity),
                CHHapticParameterCurve.ControlPoint(relativeTime: $0.time + $0.duration, value: $0.intensityEnd),
            ], relativeTime: 0)
        }
    }
}

/// `CHHapticEngine` is not Sendable; it lives inside this actor and only value-type patterns come in (DESIGN §6.2).
actor HapticEngine {
    static let shared = HapticEngine()

    private var engine: CHHapticEngine?
    private var needsRestart = false

    nonisolated static var supportsHaptics: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }

    /// Creates the engine and installs the reset/stopped handlers, which hop back into the actor.
    func prepare() async throws {
        guard Self.supportsHaptics, engine == nil else { return }
        let e = try CHHapticEngine()
        e.playsHapticsOnly = true
        e.resetHandler = { @Sendable [weak self] in
            Task { await self?.handleReset() }
        }
        e.stoppedHandler = { @Sendable [weak self] reason in
            Task { await self?.handleStop(reason) }
        }
        try await e.start()
        engine = e
    }

    /// Called from the app's `scenePhase == .active` observer (the engine stops on background).
    func restartIfNeeded() async {
        guard needsRestart, let engine else { return }
        do {
            try await engine.start()
            needsRestart = false
        } catch {
            self.engine = nil
        }
    }

    /// Plays a composed pattern. Silently no-ops when the hardware has no haptics (callers fall back to `.sensoryFeedback`).
    func play(_ pattern: HapticPattern) async {
        guard Self.supportsHaptics else { return }
        do {
            if engine == nil { try await prepare() }
            await restartIfNeeded()
            guard let engine else { return }
            let p = try CHHapticPattern(events: pattern.events(), parameterCurves: pattern.parameterCurves())
            let player = try engine.makePlayer(with: p)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // A failed pattern is not worth surfacing; the visual choreography carries the moment.
        }
    }

    private func handleReset() {
        guard let engine else { return }
        do { try engine.start() } catch { needsRestart = true }
    }

    private func handleStop(_ reason: CHHapticEngine.StoppedReason) {
        needsRestart = true
    }
}

/// The Profile "Haptics" toggle (default on) gates everything (DESIGN §6.1). Views read it via `\.dtHapticsEnabled`.
nonisolated private struct HapticsEnabledKey: EnvironmentKey {
    static let defaultValue = true
}

nonisolated extension EnvironmentValues {
    var dtHapticsEnabled: Bool {
        get { self[HapticsEnabledKey.self] }
        set { self[HapticsEnabledKey.self] = newValue }
    }
}

extension View {
    /// `.sensoryFeedback` behind the Haptics gate: the trigger is only honoured when haptics are enabled.
    func dtFeedback<T: Equatable>(_ feedback: SensoryFeedback, trigger: T) -> some View {
        modifier(GatedFeedback(feedback: feedback, trigger: trigger))
    }
}

private struct GatedFeedback<T: Equatable>: ViewModifier {
    let feedback: SensoryFeedback
    let trigger: T
    @Environment(\.dtHapticsEnabled) private var enabled

    func body(content: Content) -> some View {
        content.sensoryFeedback(trigger: trigger) { _, _ in enabled ? feedback : nil }
    }
}
