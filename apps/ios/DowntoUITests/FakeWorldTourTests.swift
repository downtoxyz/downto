// DowntoUITests/FakeWorldTourTests.swift — a crash tour: open every sheet and pushed screen in the fake world and come back.
// Assertion-light on purpose: each stop waits for its title, dismisses, and the app must still be in the foreground at the end.
import XCTest

final class FakeWorldTourTests: XCTestCase {
    @MainActor
    func testEveryScreenOpensAndDismisses() {
        let app = XCUIApplication()
        app.launchArguments = ["-DT_FAKE_WORLD", "busyFriday"]
        app.launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))

        // Notifications sheet.
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'notifications'")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["notifications"].waitForExistence(timeout: 5), "notifications sheet")
        dismissSheet(app, gone: "notifications")

        // Check detail (zoom push) → ⋯ actions sheet → back.
        app.staticTexts["movie night? something dumb and loud"].firstMatch.tap()
        let more = app.buttons["more"].firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 5), "check detail should show its ⋯ button")
        more.tap()
        XCTAssertTrue(app.buttons["hide"].firstMatch.waitForExistence(timeout: 5) || app.staticTexts["hide"].firstMatch.waitForExistence(timeout: 1), "check actions sheet")
        dismissSheet(app, goneButton: "hide")
        let back = app.buttons["back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()
        let wordmark = app.staticTexts["down to"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 8) { wordmark.exists && wordmark.isHittable }, "feed should be back after popping detail")
        XCTAssertTrue(waitUntil(timeout: 5) { app.buttons["tab-squads"].isHittable }, "Folio back after popping detail")

        // Squads → chat → settings → members (stacked) → when? (stacked).
        app.buttons["tab-squads"].tap()
        // Tab roots stay mounted and fade in; hit-testing is off until the switch lands, so wait for the masthead to be hittable.
        let squadsTitle = app.staticTexts["squads"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 5) { squadsTitle.exists && squadsTitle.isHittable }, "squads root should become interactive")
        let movieNight = app.staticTexts["movie night"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 5) { movieNight.exists && movieNight.isHittable }, "movie night row should be tappable")
        movieNight.tap()
        let settings = app.buttons["squad settings"].firstMatch
        if !settings.waitForExistence(timeout: 5) {
            let png = app.screenshot().pngRepresentation
            let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("tour-fail.png")
            try? png.write(to: url)
            XCTFail("chat header ⋯ missing; screenshot at \(url.path)")
        }
        settings.tap()
        let seeMembers = app.buttons["SEE MEMBERS →"].firstMatch
        XCTAssertTrue(seeMembers.waitForExistence(timeout: 5), "squad settings sheet")
        seeMembers.tap()
        XCTAssertTrue(app.staticTexts["members"].waitForExistence(timeout: 5), "members sheet stacked on settings")
        dismissSheet(app, gone: "members")
        let propose = app.buttons.matching(NSPredicate(format: "label == 'PROPOSE A DATE' OR label == 'CHANGE'")).firstMatch
        if propose.waitForExistence(timeout: 3) {
            propose.tap()
            XCTAssertTrue(app.staticTexts["when?"].waitForExistence(timeout: 5), "date proposal sheet")
            dismissSheet(app, gone: "when?")
        }
        dismissSheet(app)
        app.buttons["back"].firstMatch.tap()

        // You → edit profile; friends → a person's profile (stacked).
        app.buttons["tab-you"].tap()
        let edit = app.buttons["EDIT"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 5) { edit.exists && edit.isHittable }, "you root should become interactive")
        app.buttons["EDIT"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["edit profile"].waitForExistence(timeout: 5), "edit profile sheet")
        dismissSheet(app, gone: "edit profile")
        app.staticTexts["friends"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["friends"].waitForExistence(timeout: 5), "friends sheet")
        let sara = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Sara, @sara'")).firstMatch
        if sara.waitForExistence(timeout: 3) {
            sara.tap()
            XCTAssertTrue(app.staticTexts["@sara"].waitForExistence(timeout: 5), "user profile sheet stacked on friends")
            dismissSheet(app, gone: "@sara")
        }
        dismissSheet(app)

        XCTAssertEqual(app.state, .runningForeground, "the app must survive the tour")
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if cond() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        return cond()
    }

    /// Drags the top sheet down from its handle (the sheet opens at the 0.72 detent, so its handle sits near dy 0.30), up to three
    /// times, until `gone` is no longer on screen.
    @MainActor
    private func dismissSheet(_ app: XCUIApplication, gone: String? = nil, goneButton: String? = nil) {
        for _ in 0..<3 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.305))
            start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99)))
            sleep(1)
            if let gone { if !app.staticTexts[gone].exists || !app.staticTexts[gone].isHittable { return } else { continue } }
            if let goneButton { if !app.buttons[goneButton].firstMatch.exists { return } else { continue } }
            return
        }
    }
}
