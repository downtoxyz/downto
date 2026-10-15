// DowntoUITests/GalleryScrollTests.swift — the feed must scroll no matter where the finger lands: on an entry body, on a DOWN
// pill, on a section label. Regression for the iOS 18+ rule that a DragGesture(minimumDistance: 0) steals the ScrollView's touch
// (CheckEntry / DownToggle now use `pressButton`). Runs against the ComponentGallery's mock feed.
import XCTest

final class GalleryScrollTests: XCTestCase {
    @MainActor
    private func dragMoves(anchor: String, from start: XCUIElement) -> Bool {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))
        let el = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", anchor)).firstMatch
        XCTAssertTrue(el.waitForExistence(timeout: 5), "anchor \(anchor) missing")
        let before = el.frame.minY
        let origin = start.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        origin.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: 0, dy: -300)))
        sleep(1)
        return !el.exists || el.frame.minY < before - 50
    }

    @MainActor func testDragFromEntryBodyScrolls() {
        let app = XCUIApplication()
        XCTAssertTrue(dragMoves(anchor: "Lena", from: app.staticTexts["who's got a car"]))
    }

    @MainActor func testDragFromDownPillScrolls() {
        let app = XCUIApplication()
        XCTAssertTrue(dragMoves(anchor: "Lena", from: app.buttons["down"].firstMatch))
    }

    @MainActor func testDragFromDownPillDoesNotStamp() {
        // A scroll that starts on an idle pill must not count as a tap (DESIGN §4.1 precedence: scroll > press).
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["down to"].waitForExistence(timeout: 15))
        let pill = app.buttons["down"].firstMatch
        XCTAssertEqual(pill.value as? String, "not down")
        let before = pill.frame.minY
        let origin = pill.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        origin.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: 0, dy: -120)))   // short: the pill stays on screen
        sleep(1)
        XCTAssertLessThan(pill.frame.minY, before - 50, "feed should have scrolled")
        XCTAssertEqual(pill.value as? String, "not down", "the idle pill must not have stamped")
    }
}
