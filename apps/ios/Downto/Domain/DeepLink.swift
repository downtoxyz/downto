// Domain/DeepLink.swift — URL → Route (ARCHITECTURE §7 deep-link table). Pure; universal links and the downto:// scheme share the grammar.
import Foundation

nonisolated enum DeepLink {
    /// `https://downto.xyz/check/{id}`, `/friend?token=`, `/?add=`, `/?pendingCheck=`, `/?tab=&squadId=&checkId=&openFriends=`,
    /// and the same paths/queries on `downto://`. nil for anything else (incl. the bare web root).
    static func route(for url: URL) -> Route? {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        var path = comps.path
        if url.scheme == "downto", let host = comps.host, !host.isEmpty { path = "/" + host + path }   // downto://check/<id>
        let parts = path.split(separator: "/").map(String.init)
        let q = Dictionary((comps.queryItems ?? []).compactMap { i in i.value.map { (i.name, $0) } }, uniquingKeysWith: { a, _ in a })

        if parts.first == "check", parts.count >= 2, let id = UUID(uuidString: parts[1]) { return .check(CheckID(id)) }
        if parts.first == "friend", let t = q["token"].flatMap(UUID.init(uuidString:)) { return .friendToken(t) }
        if parts.first == "create" { return .create }
        guard parts.isEmpty else { return nil }

        if let id = q["pendingCheck"].flatMap(UUID.init(uuidString:)) { return .check(CheckID(id)) }
        if let add = q["add"], !add.isEmpty { return .profile(username: add) }
        switch q["tab"] {
        case "squads": return .squads(squadId: q["squadId"].flatMap(UUID.init(uuidString:)).map(SquadID.init))
        case "feed": return .feed(checkId: q["checkId"].flatMap(UUID.init(uuidString:)).map(CheckID.init))
        case "profile": return q["openFriends"] == "1" ? .friends(.friends) : nil
        case "calendar": return .feed(checkId: nil)
        default: return nil
        }
    }
}
