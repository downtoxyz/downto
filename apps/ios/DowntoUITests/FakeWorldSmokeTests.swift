// DowntoUITests/FakeWorldSmokeTests.swift — ARCHITECTURE §11.4. No network: `-DT_FAKE_WORLD busyFriday`. Runs on every CI push.
import XCTest

final class FakeWorldSmokeTests: XCTestCase {
    @MainActor
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-DT_FAKE_WORLD", "busyFriday"] + extra
        app.launch()
        return app
    }

    /// The DOWN pill that belongs to the entry whose text is `text`: the nearest `down` button below that line.
    @MainActor
    private func downPill(for text: String, in app: XCUIApplication) -> XCUIElement? {
        let line = app.staticTexts[text]
        guard line.waitForExistence(timeout: 5) else { return nil }
        let y = line.frame.minY
        let pills = app.buttons.matching(identifier: "down").allElementsBoundByIndex
        return pills.filter { $0.frame.minY > y && $0.frame.minY - y < 260 }.min { $0.frame.minY < $1.frame.minY }
    }

    @MainActor
    func testFeedDownAndEventLobbySlip() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))

        // Six entries exist (some below the fold): the two open-ended ones are visible on the first screen.
        XCTAssertTrue(app.staticTexts["movie night? something dumb and loud"].waitForExistence(timeout: 5))
        // The mystery check is unrevealed on the fixture day: its text is scrambled, only the location shows (§9).
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'somewhere in bushwick'")).firstMatch.exists)
        XCTAssertFalse(app.staticTexts["??? @sara knows"].exists, "unrevealed mystery text must not leak")

        // My own check has no DOWN toggle and reads "no responses yet".
        let mine = app.staticTexts["climbing sun 10am?"]
        for _ in 0..<6 where !(mine.exists && mine.isHittable) { app.swipeUp() }
        XCTAssertTrue(mine.waitForExistence(timeout: 5), "my own check should be in the feed")
        XCTAssertNil(downPill(for: "climbing sun 10am?", in: app), "author entries have no DOWN toggle")
        XCTAssertTrue(app.staticTexts["no responses yet"].firstMatch.exists)

        // Tap DOWN on "who's got a car" (timed, pinned at the top).
        let car = app.staticTexts["who's got a car"]
        for _ in 0..<8 where !(car.exists && car.isHittable) { app.swipeDown() }
        guard let pill = downPill(for: "who's got a car", in: app) else { return XCTFail("no DOWN pill for the car check") }
        XCTAssertEqual(pill.value as? String, "not down")
        pill.tap()
        XCTAssertTrue(waitUntil(timeout: 5) { pill.value as? String == "down" }, "pill should read DOWN ✓ after the tap")

        // The event entry is read-only in M1: tapping it lands on the §15.1 slip, not a lobby.
        let flea = app.staticTexts["sunday flea"]
        for _ in 0..<6 where !(flea.exists && flea.isHittable) { app.swipeUp() }
        XCTAssertTrue(flea.waitForExistence(timeout: 5), "the fixture event should be in the feed")
        flea.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'lobby'")).firstMatch.waitForExistence(timeout: 5),
                      "tapping the event should show the lobby's-coming slip")
    }

    @MainActor
    func testSquadsListChatSendAndPrependKeepsPlace() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))
        app.buttons["tab-squads"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'new messages'")).firstMatch.waitForExistence(timeout: 5))
        let movieNight = app.staticTexts["movie night"].firstMatch
        XCTAssertTrue(movieNight.exists)
        movieNight.tap()

        // Bottom-anchored: the newest message is on screen without scrolling.
        let newest = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'omw'")).firstMatch
        XCTAssertTrue(newest.waitForExistence(timeout: 5), "newest message should be visible on open")

        // Prepend check (§7.6 item 3): drag to the top until loadOlder fires; the row that was topmost just before the page landed
        // must still be on screen afterwards (with no anchor the transcript would jump 100 rows up to the oldest message).
        let rowsQuery = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'msg-'"))
        let countBefore = rowsQuery.count
        var grew = false
        var lastTopId = ""
        for _ in 0..<30 where !grew {
            let visible = rowsQuery.allElementsBoundByIndex.filter { $0.isHittable && $0.frame.minY > 100 }
            if let top = visible.min(by: { $0.frame.minY < $1.frame.minY }) { lastTopId = top.identifier }
            app.swipeDown()
            grew = waitUntil(timeout: 2) { rowsQuery.count > countBefore }
        }
        XCTAssertTrue(grew, "scrolling to the top should page 100 older rows in (fixture chat has 300)")
        if !lastTopId.isEmpty {
            let anchor = app.descendants(matching: .any)[lastTopId]
            XCTAssertTrue(anchor.exists && anchor.isHittable, "the row that was on screen before the prepend (\(lastTopId)) should still be on screen — no jump")
        }

        // Scroll back to the bottom and send.
        let toBottom = app.buttons["scroll to newest"]
        if toBottom.waitForExistence(timeout: 2) { toBottom.tap() }
        let composer = app.textViews["composer"].exists ? app.textViews["composer"] : app.textFields["composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5), "composer field missing")
        composer.tap()
        composer.typeText("omw too")
        XCTAssertEqual(composer.value as? String, "omw too", "fake worlds start with a clean draft, so typed text lands once")
        let send = app.buttons["send"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 3) { send.isEnabled }, "send should enable once there is text (value: \(composer.value ?? "nil"))")
        XCTAssertTrue(send.isHittable, "send button should be hittable: frame \(send.frame)")
        send.tap()   // regression: the "↓" circle used to sit exactly on this button whenever the transcript was not at the bottom
        XCTAssertTrue(waitUntil(timeout: 3) { (composer.value as? String ?? "").isEmpty || composer.value as? String == "say something" }, "composer should clear after send (value: \(composer.value ?? "nil"))")
        let sent = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'omw too'")).firstMatch
        XCTAssertTrue(sent.waitForExistence(timeout: 5), "the sent message should appear at the bottom of the transcript")

        // Poll glyph present and disabled (§15.1).
        let poll = app.buttons["poll"].firstMatch
        if poll.exists { XCTAssertFalse(poll.isEnabled) }

        // Edge swipe pops the chat; the Folio is back.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        XCTAssertTrue(app.buttons["tab-squads"].waitForExistence(timeout: 5), "Folio should be visible after the pop")
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if cond() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        return cond()
    }
}
