// DowntoTests/Stores/ToastCenterTests.swift — the 5 s dedupe window per key (ARCHITECTURE §5.3) and the one-at-a-time queue.
import Foundation
import Testing
@testable import Downto

@Suite("ToastCenter")
struct ToastCenterTests {
    @Test func sameKeyWithinFiveSecondsIsDropped() {
        let t = ToastCenter()
        var now = Date(timeIntervalSince1970: 1000)
        t.now = { now }
        t.show("squad formed! → open", key: "squad:1", action: .openSquad(SquadID(UUID())))
        now = now.addingTimeInterval(0.1)
        t.show("squad's full — you're on the waitlist ✶", key: "squad:1")
        #expect(t.current?.text == "squad formed! → open")
        t.binding = nil
        #expect(t.current == nil)   // the second was dropped, not queued
    }

    @Test func sameKeyAfterFiveSecondsShows() {
        let t = ToastCenter()
        var now = Date(timeIntervalSince1970: 1000)
        t.now = { now }
        t.show("a", key: "squad:1")
        now = now.addingTimeInterval(ToastCenter.dedupeWindow + 0.01)
        t.show("b", key: "squad:1")
        t.binding = nil
        #expect(t.current?.text == "b")
    }

    @Test func differentKeysBothQueue() {
        let t = ToastCenter()
        t.show("a", key: "squad:1")
        t.show("b", key: "squad:2")
        #expect(t.current?.text == "a")
        t.binding = nil
        #expect(t.current?.text == "b")
    }

    @Test func actionIsPerformedOnTapAndDefaultTitleApplies() {
        let t = ToastCenter()
        var performed: ToastAction?
        t.perform = { performed = $0 }
        let s = SquadID(UUID())
        t.show("x", action: .openSquad(s))
        #expect(t.current?.actionTitle == "OPEN")
        t.tapped(t.current!)
        #expect(performed == .openSquad(s))
        #expect(t.current == nil)
    }

    @Test func errorStyleCarriesThrough() {
        let t = ToastCenter()
        t.show(.network)
        #expect(t.current?.style == .error)
        #expect(t.current?.text == "no signal ✶")
    }
}
