# downto — web app inventory (source of truth for the native rewrite)

Generated 2026-09-23 from the Next.js app at the repo root. Paths are relative to the repo root.
This supersedes the stale parts of CLAUDE.md: there are **3 tabs** (Feed, Squads, You), no Cal tab, no "Tonight" sub-tab, no "Maybe" response, no `Button.tsx`/`AvatarLetter` components, and squads are created by a DB trigger, not a button.

---

## 1. Screens, sheets and overlays

The shell is `src/app/page.tsx`, a single page. It holds tab state, a `Header` (sort toggle, bell with unread count, glowing "+" button), a `FriendRequestBanner`, a pull-to-refresh scroll area and a `BottomNav` (Feed/Squads/You, with a red unread dot on Squads). Every other surface is an overlay managed from that page.

**Auth / onboarding** (gate order in `src/features/auth/hooks/useOnboarding.tsx`)
- `IOSInstallScreen` (in `src/features/auth/components/EnableNotificationsScreen.tsx`): "Add to Home Screen" walkthrough. Web-only; drop natively.
- `AuthScreen.tsx`: enter email, then an 8-digit OTP. "did you mean gmail.com?" typo nudge, Resend / Different email, links to Terms and Privacy, context banners when arriving from a shared check or `?add=` invite.
- `ProfileSetupScreen.tsx`: display name (required, max 30), username (required, `^[a-z0-9_]{3,20}$`, "that one's taken" on unique-constraint error 23505), optional Instagram handle, live preview of how you'll look in the feed.
- `EnableNotificationsScreen`: push permission prompt, Enable / Skip.
- `OnboardingFriendsPopup.tsx` (the "friend gate"): search and add friends, shared-check author pinned at top. Continue sets `profiles.onboarded = true`.
- `FirstCheckScreen.tsx`: compose first check (text, when, where, timer 1h/4h/12h/24h/∞, squad size 3/4/5/6/8/∞), or skip (makes the "+" glow).

**Feed** (`src/features/feed/components/FeedView.tsx`)
- Checks with a timer pinned at top, most urgent first. Below, open-ended checks and events interleaved, sorted "recent" or "upcoming" (header toggle).
- "NEW" badge: items created since last visit (`localStorage lastSeenFeedAt`).
- Collapsible "Hidden (N)" section with unhide.
- `InstallBanner` (install / notifications variants) and `FeedEmptyState`.
- `DevMockFeedToggle`: dev only.

**Interest checks** (`src/features/checks/`)
- `CheckCard.tsx`:
  - Expiry bar, optional movie header, author row with "via {friend}" for friend-of-friend checks.
  - Check text with @mentions and links, when/where line, ⋯ menu (non-owners only).
  - "X + N others down", or "no responses yet".
  - DOWN toggle: idle, DOWN ✓, dashed "waitlisted".
  - Co-author "You were tagged" Accept/Decline strip.
  - Inline comments, shown only when ≥1 exists.
  - Tap card → detail sheet.
- `CheckDetailSheet.tsx`: full text, movie/Letterboxd link, by-line with co-authors, Down and Waitlist lists, comments thread, Edit for author/co-author.
- `EditCheckModal.tsx` (bottom sheet): text, Date/Time (natural language, "tmr 7pm"), Where, tag co-authors, Share, Delete (archives + "undo?" toast).
- `src/shared/components/CheckActionsSheet.tsx`: Hide or Report.
- `DeletedCheckScreen.tsx`: full-screen "gone" page with a random quip ("press f"); "revive it" if yours.
- Create-check form lives in `CreateModal` (idea mode).

**Mystery checks** (`src/features/checks/lib/mystery.ts`, `src/lib/censor.ts`)
- Requires both event date and location (DB constraint).
- Before event date (viewer local time): non-authors see author as kaomoji + symbol scramble; nobody (incl. author) sees who's down — "guests revealed on the day". In squad: member names → kaomoji, polls/date-confirm hidden, image and poll creation disabled.
- Card gets a border made of "?" characters.
- Toggled in `CreateModal` as "Mystery mode".
- Redaction is client-side only; server still sends `author_id`. Native must re-implement `isMysteryUnrevealed` / `isMysteryGuestsHidden` exactly.

**Events** (`src/features/events/components/`)
- `CreateModal.tsx` (1,295 lines), two tabs:
  - **Idea**: create a check — @mention autocomplete → co-authors, when/where, timer, squad size, mystery mode.
  - **Paste link**: `/api/scrape` for Instagram/DICE/Letterboxd → editable preview (venue, date, time, vibes, note), public/friends visibility. Manual fallback with Movie/Event toggle; movie titles via `/api/search-letterboxd`.
- `EventCard.tsx`: blurred hero image with colour wash, poster attribution, title/date/venue/vibes, DOWN toggle, "X is down" row excluding the poster (`specs/events-flow.md`), tappable "N people down →" → lobby, inline comments.
- `EventLobby.tsx` (sheet): "Who's down" split into friends / "Also down", squad facepiles; "Start squad" → select-members mode → "Create Squad (n) →"; "Go to squad" / "Request to join"; "I'm looking for a squad · N looking" / "Leave squad pool".
- `EditEventModal.tsx`: Title, Date/Time, Where, Vibes, Note, linked squads with join-request counts, Share.

**Calendar**
- No calendar screen. `src/app/components/SyncCalendarModal.tsx` from Profile: "Export" tab (select items → Google Calendar or .ics) and "Subscribe" tab (`webcal://…/api/calendar/{calendar_token}?tz=` with copy).

**Squads and chat** (`src/features/squads/components/`)
- `GroupsView.tsx` (Squads tab): sections NEW MESSAGES / UPCOMING / FADING ✶. Rows show countdown (Xm/Xh/Xd/Xw → ENDED or PAST when date locked), last message preview, time, waitlisted badge, unread dot. Empty: "No squads yet."
- `SquadChat.tsx` (1,749 lines), full-screen overlay sliding from right, swipe-right-to-close:
  - `ChatHeader`: back, name, avatars, countdown.
  - `ChatMessage`: text, system, date_confirm, poll, images, fullscreen viewer.
  - `MessageComposer`: @mention autocomplete, image attach (client resize `src/lib/imageResize.ts`), poll button. Hidden for waitlisted members.
  - Date confirm sticky bar: "are you still down?" STILL DOWN / CAN'T MAKE IT.
  - Active-poll chip (scrolls to poll). Join-request banners (Accept/Decline).
  - Poll creator modal, three variants: text (2–10 options, multi-select), dates (parsed from "thurs or fri"), grid/availability (range weekend / next-7 / next-14 / custom; window evenings / afternoons / all-day; 30 or 60-min slots).
  - Edit-event modal (title only editable by check author for check-backed squads; when; where). Leave-squad confirm, kick-member confirm.
- `PollMessage.tsx`: list vote, close/reopen, results.
- `GridPollMessage.tsx`: drag-to-paint availability heat-map; when closed → ranked time blocks with "propose this".
- `SquadSettingsModal.tsx`: members preview, See members, squad-size stepper (∞ when unlimited), Edit event, "Extend chat +7 days".
- `SquadMembersView.tsx`: member list; move to/from waitlist, kick, add from people who are down. Non-interactive before mystery reveal.
- `SquadNotificationBanner.tsx`: in-app "squad formed" banner.

**Notifications** (`src/features/notifications/components/NotificationsPanel.tsx`)
- Bell sheet. Opening marks all read except pending friend requests (stay unread, pinned top). Rows have icon + tint per type; tap routes via `NavigateAction`. Check rows first call `get_check_state`; if gone → `DeletedCheckScreen`.

**Profile** (`src/features/profile/components/ProfileView.tsx`)
- Avatar letter, name, @username, edit modal (username change confirms, 14-day cooldown).
- Friends row (→ `FriendsModal`), theme switcher (guava / dragonfruit), availability (open ✨ / awkward 👀 / not available 🌙), Instagram handle.
- Push toggle, "Sync to Calendar".
- Archived checks with restore; Blocked users with unblock.
- "Reset Onboarding" when `is_test`. About: build version; long-press copies build ID.
- Log out; Delete account (type your username to confirm).

**Friends** (`src/features/friends/`)
- `FriendsModal.tsx`: **Friends** tab (filtered list); **Add** tab (search by name/@username, invite-link button (`create_friend_link` → share `/friend?token=`), incoming requests, outgoing "Requested", friend-of-friend suggestions).
- `UserProfileOverlay.tsx`: avatar, name, @username, Instagram, availability; Add / Accept / Remove / Cancel; Block/Report row. Blocking removes friendship.
- `src/app/components/FriendRequestBanner.tsx`: sticky while incoming requests exist.

**Block / report**
- `src/shared/components/ReportSheet.tsx`: reasons harassment, spam, impersonation, inappropriate, threats, other; optional details.
- Schema targets: profile, check, squad_message, event_comment, check_comment. UI wires only **check** and **profile**.

**Web-only pages** (`src/app/`): `check/[id]` (public OG preview of a shared check; "Join to respond" → `/?pendingCheck=`), `friend` (redeem invite token), `privacy`, `terms`, `admin`, `error.tsx`, `UpdateBanner`. Keep on web.

---

## 2. Data model

**Tables**
- `profiles`: id (= auth uid), username (unique), display_name, `avatar_letter` (generated from display_name[0]), availability, ig_handle, onboarded, is_test, timezone (client-synced on load), theme_enabled (unused), calendar_token, referred_by_check_id, username_changed_at, created_at/updated_at.
- `interest_checks`: id, author_id, text; expires_at (null = open), event_date, event_date_label, event_time, event_tz, date_flexible, time_flexible; location, max_squad_size (**null = unlimited**), mystery; letterboxd_url, movie_metadata JSON; shared_at (required for `/check/[id]`), archived_at, last_rallied_at.
- `check_responses`: check_id, user_id, response ('down' | 'waitlist'), created_at. Unique (check_id, user_id). Waitlist order by created_at.
- `check_co_authors`: check_id, user_id, invited_by, status (pending/accepted/declined).
- `check_comments`: check_id **or** event_id, user_id, text (≤280), mentions uuid[].
- `hidden_checks`: user_id, check_id. `left_checks`: user_id, check_id (written by `leave_squad`; hydrated, not rendered).
- `events`: title, venue, neighborhood, date, date_display, time_display, vibes[], note; image_url, ig_handle, ig_url, dice_url, letterboxd_url, ra_url, movie_metadata; is_public, visibility ('public'|'friends', kept in sync by `sync_event_is_public`); created_by.
- `saved_events`: user_id, event_id, is_down, saved_at, reminded_24h_at, reminded_2h_at.
- `crew_pool`: event_id, user_id ("looking for a squad").
- `squads`: name, check_id / event_id, created_by; meeting_spot, arrival_time, transport_notes; expires_at (null = none), grace_started_at, warned_at, archived_at, date_nudge_sent_at; locked_date, date_status ('proposed'|'locked'|null). One active squad per check (unique).
- `squad_members`: squad_id, user_id, role ('member'|'waitlist'), joined_at.
- `messages`: squad_id, sender_id (null for system), text, is_system, message_type ('text'|'poll'|'date_confirm'), mentions uuid[], image_path, image_width, image_height.
- `squad_polls`: squad_id, message_id, question, options JSON, status (active/closed), created_by, multi_select, poll_type (text/dates/availability(legacy)/when), collection_style (preference/availability), grid_dates, grid_hour_start/end, grid_slot_minutes, grid_range_start/end.
- `squad_poll_votes`: poll_id, user_id, option_index. `squad_poll_availability`: legacy grid cells.
- `squad_date_confirms`: squad_id, message_id, user_id, response (yes/no/null), responded_at.
- `squad_join_requests`: squad_id, user_id, status.
- `squad_read_cursors`: (user_id, squad_id) → last_read_at. Drives squad unread dots.
- `friendships`: requester_id, addressee_id, status (pending/accepted/blocked).
- `friend_links`: creator_id, token (UUID), redeemed_by, redeemed_at, expires_at (24h, one use).
- `notifications`: user_id, title, body, is_read, related_user_id / related_squad_id / related_check_id / related_event_id, `type` ∈ {friend_request, friend_accepted, check_response, squad_message, squad_invite, friend_check, date_confirm, check_tag, check_comment, poll_created, squad_join_request, squad_mention, comment_mention, friend_event, event_reminder, event_down, check_date_updated, check_text_updated, event_date_updated, event_comment, check_archived, check_revived, squad_date_nudge}.
- `push_subscriptions`: user_id, platform ('web'|'ios'|'android'), endpoint (synthetic `ios://{token}`), p256dh, auth, device_token, user_agent.
- `push_logs`, `version_pings`: telemetry. `blocked_users`: blocker_id, blocked_id (mutual via RLS). `reported_content`: append-only.

**Storage**: `event-images` (public); `squad-chat-images` (private, 5 MB, path `{squad_id}/{uuid}.{ext}`, signed URLs 1h).

**RPCs the client calls** (`src/lib/db/*`)
- Checks: `get_shared_check(p_check_id)`, `get_shared_check_author`, `get_fof_check_annotations`, `get_check_state` → `{active, isMine}`, `archive_interest_check` / `revive_interest_check`.
- Squads: `join_squad_if_room(p_squad_id)` → 'joined'|'waitlisted', `leave_squad`, `reactivate_squad`, `get_event_squad_members`, `get_unread_squad_ids(p_user_id)`.
- Events: `get_friends_events` (friends + FoF events as JSON).
- Friends: `get_friends_of_friends`, `create_friend_link`, `redeem_friend_link(p_token)`.

**RLS helpers**: `check_is_active` (single rule for liveness; RLS returns only active checks — client applies no date filters), `is_friend_or_fof`, `is_blocked`, `can_view_check_squad`, `is_squad_member`.

**Triggers that change what the client sees**
- Responses: `cap_down_responses` (down → waitlist when capped; author slot reserved; accepted co-authors bypass), `auto_create_squad_on_first_other_down` (**squad forms on first non-author down**), `auto_join_squad_on_down_response` / `auto_rejoin_squad_on_check_down`; deleting/changing a response removes from squad and promotes next waitlisted; `cleanup_left_check_on_redown`.
- Co-authors: `auto_down_on_coauthor_accept`.
- Squad members: `enforce_squad_max_size`, `post_join_system_message` (playful "X just entered the chat"), `init_squad_read_cursor`, `remove_from_pool_on_squad_join`, `prevent_squad_creator_removal`, `undown_event_on_squad_member_delete`.
- Events: `auto_squad_on_event_down`, `auto_leave_squad_on_event_undown`, `auto_rejoin_squad_on_event_redown`.
- Squad expiry: `set_squad_expiry`, `recalc_squad_expiry_on_check_date_change`. Rule: event date + 1 day + 24h grace, or check timer + 24h. Open-ended checks → no expiry.
- Join requests: `auto_join_on_request_accept`.
- Profiles: `enforce_username_cooldown` (14d). `handle_new_user` creates profile with random `user_xxxxxxxx` username and empty display_name (empty name triggers profile setup).
- Every `notify_*` trigger inserts notifications; mentions → squad_mention / comment_mention.

**Cron (pg_cron)**: `squad-expiry` (15 min: warn ~1h before, `squad_date_nudge` 24h after creation, archive expired, purge archived >7d), `event-reminders` (30 min: 24h/2h), `archive-stale-dateless-checks`, `archive-past-date-checks`, `abandoned-onboarding-sweep` (daily 06:00 UTC, deletes un-onboarded accounts >24h).

**Realtime**
- Published: interest_checks, check_responses, check_co_authors, check_comments, messages, notifications, friendships (replica identity full), squad_date_confirms, squad_poll_votes, squad_poll_availability.
- Client channels: `checks:all` (`*` on the 4 check tables → full reload), `check_comments:{id}` / `event_comments:{id}` (INSERT), `squad:{id}` (INSERT on messages; system/poll messages also refresh polls), `notifications:{userId}` (INSERT → squad unread flags, toasts, reload), `friendships:{userId}` (`*`), `poll_votes:{pollId}`, `poll_availability:{pollId}`.
- **No realtime on squads / squad_members / squad_date_confirms** — refreshed via notifications or reload.

---

## 3. API routes (`src/app/api/`)

Authenticated routes expect `Authorization: Bearer <supabase access_token>` (`src/lib/api-auth.ts`). Base URL `https://downto.xyz`.

**Needed natively**
| Route | Purpose |
|---|---|
| `push/subscribe` POST/DELETE | Register/remove device token |
| `account/delete` POST | Hard-delete account |
| `checks/respond-shared` POST `{checkId, response:"down"}` | Respond via shared link (bypasses RLS, sets referred_by_check_id) |
| `scrape` POST `{url}` | Instagram (Apify) / DICE / Letterboxd parser; unauthenticated |
| `search-letterboxd` POST `{query}` | Movie lookup; unauthenticated |
| `squads/set-date` | `{squadId, date, time, locked}` or `{clear:true}` |
| `squads/confirm-date` | `{squadId, response:'yes'|'no'}`; auto-locks when all answered |
| `squads/create-poll` | `{squadId, pollType, question, options, multiSelect, slots, collectionStyle}` |
| `squads/vote-poll`, `close-poll`, `reopen-poll`, `clear-my-votes` | Poll lifecycle |
| `squads/vote-availability`, `clear-availability` | Legacy grid polls |
| `squads/propose-from-poll` | `{pollId, date, time}` |
| `squads/extend` | `{squadId, days=7}` |
| `squads/update-size` | `{checkId, maxSquadSize}` |
| `squads/set-member-role`, `kick-member`, `add-member` | Member management |
| `calendar/[token]` GET | .ics feed (native just shows the webcal URL) |
| `version` GET | Build ID (optional) |

**Not needed natively**: `push/send` (webhook), `push/notify` (legacy), `admin/metrics`, `dev/switch-user`, web pages `check/[id]` and `friend`.

---

## 4. Auth flow

- Supabase email OTP, `flowType: 'implicit'`: `signInWithOtp({email})` → `verifyOtp({email, token, type:'email'})`. OTP is **8 digits** (`supabase/config.toml` `otp_length = 8`), 1h expiry. JWT 3600s. Template `supabase/templates/magic_link.html`. Pre-send checks `src/lib/emailValidity.ts`.
- Session: `onAuthStateChange` → load `profiles` row. On login write device timezone to `profiles.timezone`. Sign-out `supabase.auth.signOut()`.
- Gate order: (1) not logged in → auth; (2) profile exists, `!onboarded && !display_name` → profile setup; (3) `!onboarded` → notifications screen → wait for feed → friend gate (sets `onboarded = true`); (4) optional first-check screen.
- Shared-check onboarding: `?pendingCheck=` stored locally; notification step skipped; `respond-shared` fired; author suggested first in friend gate. `profiles.referred_by_check_id` is the backup.
- Other pending intents: `?add=username` (opens that profile), `pendingFriendToken` (auto-redeemed).

---

## 5. Push notifications

- **Register**: `POST /api/push/subscribe` `{platform:'ios', deviceToken}` + Bearer. Upsert on (user_id, device_token); deletes same-device Safari web-push rows. `DELETE {deviceToken}` unregisters. Native should unregister on logout (Capacitor client doesn't).
- **Delivery**: notifications insert → Supabase DB webhook (dashboard-configured) → `/api/push/send` → `sendPushToUser` (`src/lib/push.ts`): APNs via `@parse/node-apn`, topic `xyz.downto.app`, sandbox when `APNS_SANDBOX=true`. Bad tokens pruned; logged to `push_logs`.
- **APNs payload**: `alert {title, body}`, `sound: default`, `badge: 1` (always 1), custom `{type, relatedId}` (first non-null of related_squad_id, related_check_id, related_event_id, related_user_id).
- **Tap routing** (`src/lib/pushNavigation.ts` `mapPushToNavigateAction`; replays stored action on cold launch):
  | Types | Destination |
  |---|---|
  | friend_request | Friends modal, "add" tab |
  | friend_accepted | Friends modal, "friends" tab |
  | squad_message, squad_invite, squad_mention, squad_join_request, poll_created, date_confirm, squad_date_nudge | Squads tab → auto-open squad |
  | friend_check, check_response, check_tag, check_date/text_updated, check_comment, comment_mention | Feed, highlight + scroll to check 3s |
  | event_down, friend_event, event_date_updated, event_comment, event_reminder | Feed |
  | check_archived, check_revived | unmapped |
- **Foreground**: suppress pushes for the currently open squad (native: `willPresent`). Opening a squad clears OS notifications tagged `{type}-{squadId}` and moves the read cursor. Server sets no thread id today.
- Setup: `ios/PUSH_SETUP.md`. Bundle id `xyz.downto.app`.

---

## 6. Cross-cutting UI patterns

- **Themes**: `src/lib/themes/guava.ts` (default), `dragonfruit.ts`; tokens in `src/lib/themes/types.ts`. Switchable in Profile, stored locally.
  - Colours: accent #FE44FF, bg/card #FCFFE2, surface #E0DCC8, deep #D8D4C0, text #2A2A1A / #6B6B5A / #8A8A70 / #B0B098, borders #D8D4C0 / #C8C4B0 / #B8B4A0, pool #00D4FF, danger #ff6b6b, squad #a855f7.
  - Card states: checkMine #F0FFD8, checkDown #ECFFA5, checkNew #FFF5CC (border #E8E0B0), downIdle bg #F5F7EA border #CDC999.
  - Fonts: Inter headings (tracking -0.04em), IBM Plex Mono body. Dragonfruit: Instrument Serif + Space Mono.
  - Film-grain overlay (`src/app/components/Grain.tsx`).
- **Bottom sheet** (`src/shared/hooks/useBottomSheet.ts`, `src/shared/components/DetailSheet.tsx`): backdrop blur 8px/300ms; panel bg-surface, 24pt top radius, max width 420, 70–80% height; 40×4 grab handle; slide up on open, down 250ms on close; swipe-down 60pt to dismiss only when scrolled to top; optional dismissal guard.
- **Expiry bar**: 3–4pt at top of check card, magenta fill shrinking with time, shimmer; "Xh left" turns danger after 75% elapsed. `computeExpiry` → "open" | "expired" | "Xh"/"Xm".
- **Avatars**: single letter in circle at 20/24/28/40/72pt; own = magenta fill, others border-light; stacks overlap 6–8pt with 2pt ring, "+N" counter; mystery → kaomoji.
- **DOWN toggle**: idle pill (downIdle bg/border, magenta text); active magenta fill + check; waitlist dashed border; disabled when expired. Card bg tints per state (down, mine, new).
- **Badges/dots**: "NEW" lime #C2FF8A strip with #ff00d4 text bleeding to card's right edge; bell count caps 99+; notification dot magenta; squad dot red #ff3b30; vibe pills.
- **Metadata** joined with " · ". **Toast** with optional action ("squad formed!" → open squad; "Check removed — undo?").
- Pull-to-refresh on Feed and Squads; full reload on foreground.
- Natural-language date input everywhere: `parseWhen`, `parseNaturalDate`, `parseNaturalTime` in `src/lib/dateParse.ts` (533 lines, has tests). ISO dates are local YYYY-MM-DD. Port carefully.
- `Linkify` for URLs and @mentions. Bottom nav sliding highlight. Playful system copy.

---

## 7. Other

- **Client env**: Supabase URL + anon key, API base `https://downto.xyz`, optional Sentry DSN. Everything else server-only. Environments: local (`127.0.0.1:54321`), staging (`.env.staging.local`), production.
- **Sentry**: production only, 10% traces; ignores network/auth-lock/refresh-token errors; strips note/caption/email; tags user id + theme.
- **Flags**: none real. `profiles.is_test` → Reset Onboarding. Dev-only `DevMockFeedToggle`, `DevUserSwitcher`.
- **Calendar sync**: webcal `/api/calendar/{calendar_token}?tz=` (saved events + down checks + authored dated checks). One-off export `src/lib/ics.ts`. Native could use EventKit.
- **Deep links** (none configured in the Capacitor app today): `https://downto.xyz/check/{id}` (needs `shared_at` set via `markCheckShared`), `/friend?token=`, `/?add={username}`, `/?pendingCheck={id}`; sw.js also uses `/?tab=&squadId=&checkId=&openFriends=`.
- **Share flows**: check (URL), event (source URL + title + venue), friend invite ("Add me on down to"). → `ShareLink`.
- **Known gaps**: `/check/[id]` and push bodies may leak mystery authors (client-side redaction only); `scrape`/`search-letterboxd` unauthenticated; `respondToCheck` blocks expired on client but RLS enforces; `specs/interest-check-flow.md` lists a fixed cap bug and outdated "Squad →" CTA states; squads list isn't realtime; event-comment and chat-message reporting not wired (App Store 1.2 expects UGC reportable).
