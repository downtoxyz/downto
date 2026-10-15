// Data/ID+Supabase.swift — lets a phantom-typed ID be used directly as a PostgREST / Realtime filter value
// (`.eq("check_id", value: id)`, ARCHITECTURE §3.3). Lives in Data because Domain imports only Foundation.
import Foundation
import Supabase

extension ID: PostgrestFilterValue {
    /// Lowercase UUID string, the way Postgres renders it.
    var rawValue: String { raw.uuidString.lowercased() }
}

extension ID: RealtimePostgresFilterValue {}
