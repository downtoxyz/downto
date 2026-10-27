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

        // Post a check through the Create overlay: it must land at the top of the feed as "your check".
        app.buttons["tab-feed"].tap()
        app.buttons["new check"].firstMatch.tap()
        let editor = app.textViews["check text"].exists ? app.textViews["check text"] : app.textFields["check text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5), "create overlay editor should be up")
        let text = "smoke check \(Int(Date().timeIntervalSince1970))"
        editor.tap(); editor.typeText(text)
        let post = app.buttons["POST →"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 5) { post.exists && post.isEnabled }, "POST should enable with text")
        post.tap()
        XCTAssertTrue(waitUntil(timeout: 8) { !editor.exists }, "the overlay should close after a successful post")
        // A fresh 24 h check sorts to the end of the TIMED tier (least urgent first is at the top), so scroll until it is on screen.
        let postedEntry = app.staticTexts[text]
        _ = postedEntry.waitForExistence(timeout: 5)
        for _ in 0..<10 where !(postedEntry.exists && postedEntry.isHittable) { app.swipeUp() }
        XCTAssertTrue(postedEntry.exists, "the posted check should appear in the feed")
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if cond() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        return cond()
    }
}
