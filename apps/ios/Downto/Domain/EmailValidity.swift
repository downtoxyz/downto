// Domain/EmailValidity.swift — port of src/lib/emailValidity.ts (ARCHITECTURE §6).
//
// Not RFC validation: a structural floor (local `@` domain `.` TLD of 2+ letters) that catches the typos which produced
// dead-account orphans in prod, plus a "did you mean {fix}?" typo map. Surfaced non-blocking in AuthView.
import Foundation

nonisolated enum EmailValidity {
    /// The same 19-entry typo map as `COMMON_DOMAIN_TYPOS` (ARCHITECTURE §6 says 21; the TS has 19).
    static let commonDomainTypos: [String: String] = [
        // Gmail
        "gmial.com": "gmail.com",
        "gnail.com": "gmail.com",
        "gmai.com": "gmail.com",
        "gmaill.com": "gmail.com",
        "gmail.co": "gmail.com",
        "gmail.cm": "gmail.com",
        "gmail.con": "gmail.com",
        "gmail.cim": "gmail.com",
        // Hotmail / Outlook
        "hotmial.com": "hotmail.com",
        "hotmal.com": "hotmail.com",
        "hotmail.con": "hotmail.com",
        "outlok.com": "outlook.com",
        "outloook.com": "outlook.com",
        // Yahoo
        "yaho.com": "yahoo.com",
        "yahooo.com": "yahoo.com",
        "yahoo.con": "yahoo.com",
        // iCloud
        "iclou.com": "icloud.com",
        "icloud.co": "icloud.com",
        "icloud.con": "icloud.com",
    ]

    /// `^[^\s@]+@[^\s@]+\.[a-z]{2,}$`, case-insensitive, after trimming.
    static func isValidShape(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.wholeMatch(of: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.ignoresCase()) != nil
    }

    /// A corrected email (`u@gmail.com` for `u@gnail.com`) or nil when nothing obvious is wrong.
    /// Domain match is case-insensitive; the local part keeps its casing.
    static func suggestFix(_ email: String) -> String? {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = trimmed.lastIndex(of: "@"), at != trimmed.startIndex, trimmed.index(after: at) != trimmed.endIndex else { return nil }
        let local = trimmed[..<at]
        let domain = trimmed[trimmed.index(after: at)...].lowercased()
        guard let fix = commonDomainTypos[domain] else { return nil }
        return "\(local)@\(fix)"
    }
}
