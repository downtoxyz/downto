// Features/Squads/SquadSettingsSheet.swift — members preview, SEE MEMBERS, size stepper, DATE row, EXTEND, LEAVE (DESIGN §7.8; ARCHITECTURE §15).
import SwiftUI

struct SquadSettingsSheet: View {
    let squadId: SquadID
    @Environment(AppEnvironment.self) private var env
    @State private var confirm: DTConfirm?
    @State private var steps = 0
    @State private var busy = false

    private var row: SquadRow? { env.squads.rows.first { $0.id == squadId } }
    private var squad: Squad? { env.squads.raw.squads[squadId] ?? env.squads.openChat?.squad }
    private var check: InterestCheck? { env.squads.raw.checks[squadId] ?? env.squads.openChat?.check }
    private var members: [Presence] { env.squads.openChat?.members.map(\.presence) ?? row?.members ?? [] }
    private var ended: Bool { squad?.archivedAt != nil }
    private var locked: Bool { row?.isMystery == true && (env.squads.openChat?.isMysteryLocked ?? true) }
    private var isCheckAuthor: Bool { check?.authorId == env.me }

    var body: some View {
        DTSheetShell(title: squad?.name ?? "squad") {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        AvatarStack(presences: members, ring: .surface, size: .medium, max: 5)
                        Spacer()
                        Button { env.router.present(.squadMembers(squadId)) } label: { Text("SEE MEMBERS →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain)
                    }
                    .padding(.vertical, 8)
                    .dtStaggered(0)

                    if case .check = row?.kind, isCheckAuthor { sizeRow.dtStaggered(1) }
                    if case .check = row?.kind, !locked { dateRow.dtStaggered(2) }
                    if case .event = row?.kind, let e = env.squads.raw.events[squadId] {
                        settingRow("EVENT", value: e.title, trailing: nil).dtStaggered(2)
                    }
                    extendRow.dtStaggered(3)
                    Button { confirm = DTConfirm("leave this squad?", message: "you can come back by tapping DOWN again", actions: [.init("leave", destructive: true)]) } label: {
                        Text("LEAVE SQUAD").dtFont(.button).foregroundStyle(.dangerInk).frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    }
                    .buttonStyle(.plain).hairline().dtStaggered(4)
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.bottom, 24)
            }
        }
        .dtConfirmDialog($confirm) { a in
            switch a.title {
            case "leave": Task { await env.squads.leave(squadId); env.router.squadPath = []; dismiss() }
            case "clear": Task { await clearDate() }
            default: break
            }
        }
    }

    private var sizeRow: some View {
        HStack {
            Text("SQUAD SIZE").dtFont(.label).foregroundStyle(.inkMuted)
            Spacer()
            HStack(spacing: 16) {
                Button { step(-1) } label: { Text("−").dtFont(.numeral, size: 28).foregroundStyle(Color.ink).frame(width: 44, height: 44) }.buttonStyle(.plain).disabled(ended || busy || (check?.maxSquadSize ?? 99) <= 2)
                Text(check?.maxSquadSize.map(String.init) ?? "∞").dtFont(.numeral, size: 28).foregroundStyle(Color.ink).frame(minWidth: 36).dtNumeric(check?.maxSquadSize ?? 0)
                Button { step(1) } label: { Text("+").dtFont(.numeral, size: 28).foregroundStyle(Color.ink).frame(width: 44, height: 44) }.buttonStyle(.plain).disabled(ended || busy || check?.maxSquadSize == nil)
            }
        }
        .frame(minHeight: 52).hairline()
        .dtFeedback(.selection, trigger: steps)
    }

    private func step(_ d: Int) {
        guard let c = check else { return }
        let sizes: [Int?] = [3, 4, 5, 6, 8, nil]
        let i = sizes.firstIndex(of: c.maxSquadSize) ?? sizes.count - 1
        let next = sizes[max(0, min(sizes.count - 1, i + d))]
        guard next != c.maxSquadSize else { return }
        steps += 1
        busy = true
        Task {
            defer { busy = false }
            do {
                try await env.api.updateSize(checkId: c.id, maxSquadSize: next)
                await env.squads.refreshSquad(squadId)
                await env.squads.openChat?.reloadSideTables()
                await env.feed.refreshCheck(c.id)
            } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
        }
    }

    @ViewBuilder private var dateRow: some View {
        if let s = squad, let d = s.lockedDate, s.dateStatus != nil {
            let status = s.dateStatus == .locked ? "locked ✓" : "proposed · \(answeredCount) of \(members.count) in"
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("DATE · \(ChatTime.dateLine(d, time: check?.eventTime))").dtFont(.label).foregroundStyle(Color.ink)
                    Text(status).dtFont(.meta).foregroundStyle(.inkMuted)
                }
                Spacer()
                Button { env.router.present(.dateProposal(squadId)) } label: { Text("CHANGE").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }.buttonStyle(.plain).disabled(ended)
                Button { confirm = DTConfirm("clear the date?", message: "everyone's answers go too", actions: [.init("clear", destructive: true)]) } label: {
                    Text("CLEAR").dtFont(.button).foregroundStyle(.dangerInk).frame(minHeight: 44)
                }.buttonStyle(.plain).disabled(ended)
            }
            .frame(minHeight: 52).hairline()
        } else {
            Button { env.router.present(.dateProposal(squadId)) } label: {
                Text("PROPOSE A DATE").dtFont(.button).foregroundStyle(ended ? AnyShapeStyle(DTStockInk(token: .inkMuted)) : AnyShapeStyle(DTStockInk(token: .dtInk)))
                    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            }
            .buttonStyle(.plain).disabled(ended).hairline()
        }
    }

    private var answeredCount: Int { env.squads.openChat?.confirms.filter { $0.response == .yes }.count ?? 0 }

    private var extendRow: some View {
        let open = squad?.expiresAt == nil
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("EXTEND CHAT +7 DAYS").dtFont(.button).foregroundStyle(open || ended ? AnyShapeStyle(DTStockInk(token: .inkMuted)) : AnyShapeStyle(DTStockInk(token: .dtInk)))
                if open { Text("no expiry").dtFont(.meta).foregroundStyle(.inkMuted) }
                if ended { Text("chat ended — revive it from the chat").dtFont(.meta).foregroundStyle(.inkMuted) }
            }
            Spacer()
        }
        .frame(minHeight: 52).contentShape(Rectangle())
        .onTapGesture { guard !open, !ended else { return }; Task { await env.squads.extend(squadId); await env.squads.openChat?.reloadSideTables() } }
        .hairline()
    }

    private func settingRow(_ label: String, value: String, trailing: String?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).dtFont(.label).foregroundStyle(.inkMuted)
                Text(value).dtFont(.body).foregroundStyle(Color.ink)
            }
            Spacer()
        }
        .frame(minHeight: 52).hairline()
    }

    private func clearDate() async {
        do {
            try await env.api.clearDate(squadId: squadId)
            await env.squads.refreshSquad(squadId)
            await env.squads.openChat?.reloadSideTables()
        } catch { env.toasts.show(AppError(error).toastCopy, style: .error) }
    }

    private func dismiss() {
        if env.router.stacked == .squadSettings(squadId) { env.router.stacked = nil } else { env.router.sheet = nil }
    }
}
