// DowntoTests/Domain/EmailValidityTests.swift — ports every case of src/lib/emailValidity.test.ts.
import Foundation
import Testing
@testable import Downto

@Suite("EmailValidity")
struct EmailValidityTests {
    // MARK: isValidEmailShape

    @Test("isValidEmailShape — accepts well-formed emails")
    func acceptsWellFormed() {
        #expect(EmailValidity.isValidShape("a@b.co"))
        #expect(EmailValidity.isValidShape("perezkh@gmail.com"))
        #expect(EmailValidity.isValidShape("first.last+tag@sub.example.org"))
    }

    @Test("isValidEmailShape — rejects the prod typo cases that produced dead accounts")
    func rejectsProdTypos() {
        #expect(!EmailValidity.isValidShape("sarah.an.ferguson@gmail"))
        #expect(!EmailValidity.isValidShape("anyone@gmail"))
        #expect(!EmailValidity.isValidShape("user@gmail.c"))
    }

    @Test("isValidEmailShape — rejects shapes that aren't emails at all")
    func rejectsNonEmails() {
        #expect(!EmailValidity.isValidShape(""))
        #expect(!EmailValidity.isValidShape("@"))
        #expect(!EmailValidity.isValidShape("noatsign.com"))
        #expect(!EmailValidity.isValidShape("user@"))
        #expect(!EmailValidity.isValidShape("@example.com"))
        #expect(!EmailValidity.isValidShape("with space@ex.com"))
    }

    @Test("isValidEmailShape — trims surrounding whitespace before checking")
    func trims() {
        #expect(EmailValidity.isValidShape("  a@b.co  "))
    }

    @Test("isValidEmailShape — TLD match is case-insensitive")
    func caseInsensitiveTLD() {
        #expect(EmailValidity.isValidShape("A@B.CO"))
        #expect(EmailValidity.isValidShape("Perezkh@Gmail.Com"))
    }

    // MARK: suggestEmailFix

    @Test("suggestEmailFix — flags the prod typo cases with the right correction")
    func prodTypoFixes() {
        #expect(EmailValidity.suggestFix("perezkh@gmail.con") == "perezkh@gmail.com")
        #expect(EmailValidity.suggestFix("perezkh@gnail.com") == "perezkh@gmail.com")
    }

    @Test("suggestEmailFix — preserves the local-part casing while normalising the domain")
    func preservesLocalCasing() {
        #expect(EmailValidity.suggestFix("Mixed.Case@Gmail.Con") == "Mixed.Case@gmail.com")
    }

    @Test("suggestEmailFix — catches common provider typos")
    func commonProviderTypos() {
        #expect(EmailValidity.suggestFix("u@gmial.com") == "u@gmail.com")
        #expect(EmailValidity.suggestFix("u@hotmial.com") == "u@hotmail.com")
        #expect(EmailValidity.suggestFix("u@yaho.com") == "u@yahoo.com")
        #expect(EmailValidity.suggestFix("u@iclou.com") == "u@icloud.com")
    }

    @Test("suggestEmailFix — returns null for valid emails and unknown domains")
    func nilForValidAndUnknown() {
        #expect(EmailValidity.suggestFix("u@gmail.com") == nil)
        #expect(EmailValidity.suggestFix("u@example.org") == nil)
        #expect(EmailValidity.suggestFix("u@") == nil)
        #expect(EmailValidity.suggestFix("no-at-sign") == nil)
        #expect(EmailValidity.suggestFix("") == nil)
        #expect(EmailValidity.suggestFix("@gmail.con") == nil)   // at <= 0
    }

    @Test("suggestEmailFix — the typo map has the web's 19 entries and every fix is itself a valid shape")
    func typoMapParity() {
        // COMMON_DOMAIN_TYPOS in emailValidity.ts has 19 keys (8 gmail + 5 hotmail/outlook + 3 yahoo + 3 icloud); ARCHITECTURE §6 says 21.
        #expect(EmailValidity.commonDomainTypos.count == 19)
        for (typo, fix) in EmailValidity.commonDomainTypos {
            #expect(EmailValidity.isValidShape("u@\(fix)"))
            #expect(EmailValidity.suggestFix("u@\(typo)") == "u@\(fix)")
            #expect(EmailValidity.suggestFix("u@\(typo.uppercased())") == "u@\(fix)")
        }
    }
}
