// DowntoUITests/LaunchSmokeTests.swift — the app launches on a simulator and shows the wordmark. No network.
// FakeWorldSmokeTests / LiveSmokeTests (ARCHITECTURE §11.4) are added with the stores and the fake world.
import XCTest

final class LaunchSmokeTests: XCTestCase {
    @MainActor
    func testLaunchShowsWordmark() {
        let app = XCUIApplication()
        app.launch()
        let wordmark = app.staticTexts["down to"]
        XCTAssertTrue(wordmark.waitForExistence(timeout: 15), "expected the 'down to' wordmark on the placeholder RootView")
    }
}
