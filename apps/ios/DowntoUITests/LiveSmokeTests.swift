// DowntoUITests/LiveSmokeTests.swift — ARCHITECTURE §11.4. Needs local Supabase + Mailpit (+ `npm run dev` for /api). `make ui-test-live`.
// Launches `-uiTestLogin kat@test.com`: the app fetches the OTP from Mailpit itself (App/UITestLogin.swift).
import XCTest

final class LiveSmokeTests: XCTestCase {
    @MainActor
    func testLoginDownSquadChat() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestLogin", "kat@test.com"]
        app.launch()

        // ≥ 1 entry.
        let pill = app.buttons["down"].firstMatch
        XCTAssertTrue(pill.waitForExistence(timeout: 40), "expected a DOWN pill on the live feed (is supabase + Mailpit up?)")

        // DOWN on the first non-own check (own checks have no pill), or un-DOWN first if a previous run left it down.
        if pill.value as? String == "down" { pill.tap(); _ = waitUntil(timeout: 8) { pill.value as? String == "not down" } }
        pill.tap()
        XCTAssertTrue(waitUntil(timeout: 10) { pill.value as? String == "down" }, "pill should read DOWN ✓ after the insert lands")

        // The auto-squad trigger put us in a squad: the entry grows an OPEN SQUAD → link (refreshMembership after the insert).
        let openSquad = app.buttons["open squad"].firstMatch
        XCTAssertTrue(openSquad.waitForExistence(timeout: 20), "expected the OPEN SQUAD link after DOWN (auto_squad trigger + refreshMembership)")
        openSquad.tap()

        // Send a message through the real DB.
        let composer = app.textViews["composer"].exists ? app.textViews["composer"] : app.textFields["composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 10), "the chat composer should be up for a member")
        let stamp = "smoke \(Int(Date().timeIntervalSince1970))"
        composer.tap(); composer.typeText(stamp)
        app.buttons["send"].firstMatch.tap()
        XCTAssertTrue(waitUntil(timeout: 10) { (composer.value as? String ?? "").isEmpty || composer.value as? String == "say something" }, "composer should clear after send")
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'msg-' AND label CONTAINS %@", stamp)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "the sent message should be a transcript row, not just the field's value")

        // Squads tab lists the squad.
        app.buttons["back"].firstMatch.tap()
        app.buttons["tab-squads"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "squad-row").firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if cond() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        return cond()
    }
}
