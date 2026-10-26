// Features/Feed/WhenField.swift — the natural-language when-input (ARCHITECTURE §10.2; look DESIGN §7.6 / §7.5).
// Plain `Font.dt.body` text on a baseline rule; under it "→ fri oct 3 · 7pm" in successInk or "couldn't read that" in dangerInk,
// plus the "date-ish" / "time-ish" toggles. Publishes a `WhenParse` on every keystroke (debounced 150 ms).
import SwiftUI

nonisolated struct WhenParse: Hashable, Sendable {
    var text: String = ""
    var date: LocalDate?
    var time: String?
    /// The typed phrase, kept only when the parse implied several dates (web parity: `event_date_label`).
    var label: String?
    var dateFlexible = false
    var timeFlexible = false
    var error = false

    init() {}

    var isEmpty: Bool { text.trimmingCharacters(in: .whitespaces).isEmpty }

    static func parse(_ text: String, now: Date, calendar: Calendar, dateFlexible: Bool, timeFlexible: Bool) -> WhenParse {
        var p = WhenParse()
        p.text = text
        p.dateFlexible = dateFlexible
        p.timeFlexible = timeFlexible
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return p }
        let w = DateParse.parseWhen(trimmed, now: now, calendar: calendar)
        p.date = w.dates.first
        p.time = w.time
        p.label = w.dates.count > 1 ? w.label : nil
        p.error = p.date == nil && p.time == nil
        return p
    }

    /// "→ fri oct 3 · 7pm"
    func preview(calendar: Calendar) -> String? {
        guard !error, !isEmpty else { return nil }
        var parts: [String] = []
        if let label { parts.append(label.lowercased()) }
        else if let date { parts.append(DateParse.label(date.startOfDay(in: calendar), calendar: calendar).lowercased()) }
        if let time { parts.append(time.lowercased()) }
        return parts.isEmpty ? nil : "→ " + parts.joined(separator: " · ")
    }
}

struct WhenField: View {
    @Binding var parse: WhenParse
    var placeholder = "when? (tmr 7pm, sat, next fri or sat…)"
    var now: Date = .now
    @FocusState private var focused: Bool
    @State private var task: Task<Void, Never>?
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("", text: $parse.text, prompt: Text(placeholder).foregroundStyle(Color.inkFaint))
                .dtFont(.body).foregroundStyle(Color.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .focused($focused)
                .onChange(of: parse.text) { _, _ in schedule() }
                .accessibilityLabel("when")
            Rectangle().fill(parse.error ? Color.danger : (focused ? Color.dt : Color.ruleMid)).frame(height: focused || parse.error ? 2 : 1)
                .animation(DTSpring.settle, value: focused)
            HStack(spacing: 12) {
                if parse.error {
                    Text("couldn't read that").dtFont(.meta).foregroundStyle(.dangerInk)
                } else if let p = parse.preview(calendar: .current) {
                    Text(p).dtFont(.meta).foregroundStyle(.successInk).contentTransition(.numericText())
                } else {
                    Text(" ").dtFont(.meta)
                }
                Spacer()
                if parse.date != nil { ishToggle("date-ish", $parse.dateFlexible) }
                if parse.time != nil { ishToggle("time-ish", $parse.timeFlexible) }
            }
            .animation(DTSpring.page, value: parse.error)
            .animation(DTSpring.page, value: parse.date)
        }
    }

    private func ishToggle(_ title: String, _ on: Binding<Bool>) -> some View {
        Button { on.wrappedValue.toggle() } label: {
            Text(title).dtFont(.label)
                .foregroundStyle(on.wrappedValue ? AnyShapeStyle(Color.onDt) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                .padding(.horizontal, 8).frame(height: 24)
                .background(Capsule().fill(on.wrappedValue ? Color.dt : Color.clear))
                .overlay(Capsule().strokeBorder(on.wrappedValue ? Color.clear : Color.rule, lineWidth: 1))
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on.wrappedValue ? .isSelected : [])
    }

    private func schedule() {
        task?.cancel()
        let text = parse.text
        let df = parse.dateFlexible, tf = parse.timeFlexible
        task = Task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            let next = WhenParse.parse(text, now: now, calendar: .current, dateFlexible: df, timeFlexible: tf)
            if next != parse { parse = next }
        }
    }
}
