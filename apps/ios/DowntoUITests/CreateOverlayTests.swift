// DowntoUITests/CreateOverlayTests.swift — the Create overlay opens from the masthead, posts into the feed, and closes (fake world).
import XCTest

final class CreateOverlayTests: XCTestCase {
    @MainActor
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-DT_FAKE_WORLD", "busyFriday"]
        app.launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))
        return app
    }

    @MainActor
    func testOpenAndCloseRemovesOverlay() {
        let app = launch()
        app.buttons["new check"].firstMatch.tap()
        let editor = app.textViews["check text"].exists ? app.textViews["check text"] : app.textFields["check text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        app.buttons["close"].firstMatch.tap()
        XCTAssertTrue(waitUntil(timeout: 5) { !editor.exists }, "overlay should unmount on close")
    }

    @MainActor
    func testPostLandsInFeedAndCloses() {
        let app = launch()
        app.buttons["new check"].firstMatch.tap()
        let editor = app.textViews["check text"].exists ? app.textViews["check text"] : app.textFields["check text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap(); editor.typeText("hello from the overlay")
        let post = app.buttons["POST →"].firstMatch
        XCTAssertTrue(waitUntil(timeout: 5) { post.exists && post.isEnabled })
        post.tap()
        XCTAssertTrue(waitUntil(timeout: 8) { !editor.exists }, "overlay should unmount after a successful post")
        XCTAssertTrue(app.staticTexts["hello from the overlay"].waitForExistence(timeout: 5), "the new check should be in the feed")
    }

    @MainActor
    private func waitUntil(timeout: TimeInterval, _ cond: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if cond() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
        return cond()
    }
}
