// Features/Squads/DateProposalSheet.swift — "when?" quick sheet: ASK EVERYONE / LOCK IT → squads/set-date (DESIGN §4.10, specs/date-confirm-flow.md).
import SwiftUI

struct DateProposalSheet: View {
    let squadId: SquadID
    @Environment(AppEnvironment.self) private var env
    @State private var text = ""
    @State private var lock = false
    @State private var sending = false
    @State private var confirmReset = false
    @State private var sends = 0
    @FocusState private var focused: Bool

    private var parsed: DateParse.ParsedWhen { DateParse.parseWhen(text, now: .now, calendar: .current) }
    private var date: LocalDate? { parsed.dates.first }
    private var squad: Squad? { env.squads.raw.squads[squadId] ?? env.squads.openChat?.squad }

    var body: some View {
        DTSheetShell(title: "when?") {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    TextField("", text: $text, prompt: Text("fri 8pm").foregroundStyle(Color.inkFaint))
                        .dtFont(.title).foregroundStyle(Color.ink)
                        .autocorrectionDisabled().textInputAutocapitalization(.never)
                        .focused($focused)
                    Rectangle().fill(focused ? Color.dt : Color.ruleMid).frame(height: focused ? 2 : 1).animation(DTSpring.settle, value: focused)
                    if text.isEmpty {
                        Text(" ").dtFont(.meta)
                    } else if let d = date {
                        Text("→ \(ChatTime.dateLine(d, time: parsed.time))").dtFont(.meta).foregroundStyle(.successInk)
                    } else {
                        Text("couldn't read that").dtFont(.meta).foregroundStyle(.dangerInk)
                    }
                }
                HStack(spacing: 8) {
                    Pill(text: "ask everyone", style: .setting, selected: !lock) { lock = false }
                    Pill(text: "lock it", style: .setting, selected: lock) { lock = true }
                }
                DTButton(title: sending ? "SENDING" : (lock ? "LOCK →" : "PROPOSE →"), variant: .primary, size: .buttonLarge, disabled: date == nil || sending) {
                    if squad?.dateStatus != nil { confirmReset = true } else { Task { await send() } }
                }
                .dtFeedback(.impact(weight: .medium), trigger: sends)
            }
            .padding(.horizontal, Space.sheetGutter)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .presentationDetents([.height(340)])
        .confirmationDialog("propose a new date?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("propose") { Task { await send() } }
            Button("cancel", role: .cancel) {}
        } message: { Text("everyone's answers reset") }
        .onAppear { focused = true }
    }

    private func send() async {
        guard let d = date else { return }
        sending = true
        defer { sending = false }
        do {
            try await env.api.setDate(squadId: squadId, date: d, time: parsed.time, locked: lock)
            sends += 1
            await env.squads.refreshSquad(squadId)
            await env.squads.openChat?.reloadSideTables()
            if env.router.stacked == .dateProposal(squadId) { env.router.stacked = nil } else { env.router.sheet = nil }
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }
}
