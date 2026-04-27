// Barrel re-exports — see src/lib/db/ for the actual implementations.
//
// Domain split:
//   profiles        — current/profile fetch + update
//   account         — calendar token, version pings, account deletion
//   events          — events, saved events, people-down, crew pool, social signal
//   event-comments  — comments scoped to events (uses check_comments table)
//   friendships     — friends, pending requests, friend links, suggestions, search
//   checks          — interest checks, co-authors, shared checks, hidden, archived, left
//   check-comments  — comments scoped to interest checks
//   squads          — squads, logistics, date confirms, join requests
//   messages        — squad chat messages + image uploads
//   notifications   — notifications + unread counts + read cursors
//   polls           — squad polls (text/dates/when/availability)
//   blocks          — block/unblock + report content
//
// All previous `import { foo } from "@/lib/db"` and `import * as db from "@/lib/db"`
// imports keep working unchanged.

export { API_BASE } from './db/api-base';

export * from './db/profiles';
export * from './db/account';
export * from './db/events';
export * from './db/event-comments';
export * from './db/friendships';
export * from './db/checks';
export * from './db/check-comments';
export * from './db/squads';
export * from './db/messages';
export * from './db/notifications';
export * from './db/polls';
export * from './db/blocks';
