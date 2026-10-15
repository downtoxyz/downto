// Realtime/ChangeBuffer.swift — per-store buffer of TableChanges received while a hydrate/refresh select is in flight
// (ARCHITECTURE §4.7.1). Main-actor (default isolation), value-typed, one per store.
//
// Rules: hydrate/refresh never assign `raw = fetched`; they call `endSelect(gen, merge:)` whose merge upserts by row id.
// Every change is applied immediately AND recorded while ≥1 select is in flight, then replayed over the merged rows
// for every select whose generation is ≤ the change's, so an older server snapshot cannot overwrite a newer change.
import Foundation

struct ChangeBuffer<Raw> {
    private(set) var generation = 0
    private(set) var inFlight = 0
    private var pending: [(generation: Int, apply: (inout Raw) -> Void)] = []

    init() {}

    /// Marks a select as started; returns its generation to hand back to `endSelect`.
    mutating func beginSelect() -> Int {
        generation += 1
        inFlight += 1
        return generation
    }

    /// Applies `f` now and records it for replay if a select is in flight.
    mutating func record(_ f: @escaping (inout Raw) -> Void, into raw: inout Raw) {
        f(&raw)
        if inFlight > 0 { pending.append((generation, f)) }
    }

    /// Merges server rows, then re-applies every change recorded at or after this select's generation.
    mutating func endSelect(_ gen: Int, merge: (inout Raw) -> Void, into raw: inout Raw) {
        merge(&raw)
        for p in pending where p.generation >= gen { p.apply(&raw) }
        inFlight = max(0, inFlight - 1)
        if inFlight == 0 { pending.removeAll() }
    }

    /// A select that failed still ends (nothing merged); pending changes recorded for it are dropped when nothing else is in flight.
    mutating func abortSelect(_ gen: Int) {
        inFlight = max(0, inFlight - 1)
        if inFlight == 0 { pending.removeAll() }
    }

    var pendingCount: Int { pending.count }
}
