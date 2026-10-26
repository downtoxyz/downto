// App/UITestLogin.swift — `-uiTestLogin <email>` (ARCHITECTURE §11.4 LiveSmokeTests). DEBUG only: sends the OTP, fetches the
// 8-digit code from local Mailpit (http://127.0.0.1:54324) and verifies it, so a live smoke run needs no typing.
import Foundation
import os

enum UITestLogin {
    static let mailpit = URL(string: "http://127.0.0.1:54324/api/v1/search")!
    private static let log = Logger(subsystem: "xyz.downto.app", category: "uitest")

    static var email: String? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-uiTestLogin"), i + 1 < args.count else { return nil }
        return args[i + 1]
        #else
        return nil
        #endif
    }

    /// Runs once per launch when the gate is `.auth`. Best effort: any failure just leaves the normal AuthView up.
    static func run(env: AppEnvironment) async {
        guard let email else { return }
        do {
            let since = Date.now
            try await env.session.sendCode(email: email)
            var code: String?
            for _ in 0..<20 {
                try await Task.sleep(for: .milliseconds(500))
                if let c = try await latestCode(to: email, after: since) { code = c; break }
            }
            guard let code else { log.error("no OTP in Mailpit for \(email, privacy: .public)"); return }
            try await env.session.verify(code: code)
        } catch {
            log.error("uiTestLogin: \(String(describing: error), privacy: .public)")
        }
    }

    private static func latestCode(to email: String, after: Date) async throws -> String? {
        var comps = URLComponents(url: mailpit, resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "query", value: "to:\(email)")]
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        struct Search: Decodable { let messages: [Msg] }
        struct Msg: Decodable { let Snippet: String; let Created: String }
        let s = try JSONDecoder().decode(Search.self, from: data)
        guard let m = s.messages.first,
              let created = ISO8601DateFormatter.withFractional.date(from: m.Created) ?? ISO8601DateFormatter().date(from: m.Created),
              created > after.addingTimeInterval(-5),
              let r = m.Snippet.range(of: #"\d{8}"#, options: .regularExpression) else { return nil }
        return String(m.Snippet[r])
    }
}

private extension ISO8601DateFormatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
