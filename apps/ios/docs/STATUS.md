# Status — paused 2026-10-28

Work on the native SwiftUI app paused here. The App Store launch is **not planned**
for now; this note records where things stand so the branch can be picked up later.

Branch: `feat/ios-native` (not merged to `main`). Last commit at pause: `5fe2ea05`.

## What works

- Full M1 core loop, verified live against local Supabase and by hand on a real
  iPhone against production: sign in with the same email OTP as the web app,
  feed, DOWN on a check, auto-squad, squad chat (text + realtime), posting a check,
  profile, notifications, friends gate, mystery checks with reveal.
- Both editions ship: **guava** (default) and **dragonfruit** (Instrument Serif /
  Space Mono, `df_*` palette). Switch under You → Settings → EDITION.
- Liquid Glass floating tab bar (Folio) with a glass selector pill.
- OTP screen has a Paste button.
- Fake world (`-DT_FAKE_WORLD busyFriday` etc.) for simulator demos and UI tests.
- Test state at pause: 336 unit tests + 10 UI tests green (`make test`, `make gen` first).

## How to run it again

- Simulator: `cd apps/ios && make gen && make run` (ad-hoc signed, see DECISIONS #38).
- Device (Debug-Prod, production backend, real data):
  ```
  xcodebuild -project Downto.xcodeproj -scheme Downto-Prod -configuration Debug-Prod \
    -destination 'generic/platform=iOS' -derivedDataPath build/device \
    CODE_SIGN_ENTITLEMENTS=<file with only aps-environment=development> build
  xcrun devicectl device install app --device <id> build/device/Build/Products/Debug-Prod-iphoneos/Downto.app
  xcrun devicectl device process launch --terminate-existing --device <id> xyz.downto.app
  ```
  The trimmed entitlements file is needed because the current provisioning
  profile predates the Associated Domains entitlement in `project.yml`.

## Not done / known gaps

Blocking any public release:
- No TestFlight or App Store build. Needs the Apple ID signed into Xcode, a
  regenerated profile with Associated Domains, APNs key, App Store Connect record.
- Push notifications never fired from this app on a device (code exists, unverified).
- Universal links are stripped from device builds (same profile issue). The AASA
  file is live at `https://downto.xyz/.well-known/apple-app-site-association`.
- App Store Guideline 1.2: no in-app reporting for chat messages / comments yet.
- No crash reporting (Sentry deferred to M2).
- Prod `DB Migrations` workflow is failing: the `SUPABASE_ACCESS_TOKEN` secret
  expired. `20261027000001_get_shared_check_mystery.sql` is merged (web PR #513)
  but not applied to production. Web and iOS tolerate the old RPC shape.

M2 features still placeholders (per INVENTORY/ARCHITECTURE): polls, event lobby
and crew pool, event edit, paste-link event creation, member management,
sync-to-calendar, message/comment reporting.

Polish backlog: POST text-flight animation, event-start chat countdown, promotion
toast test coverage, segmented edition picker typography, unselected tab label
weight, final checkText face choice on device.

## Do not deprecate the web app

The Next.js deployment is the backend for iOS: every `/api/*` route, the
shared-check pages, invite links, the AASA file and cron jobs live there. It is
also the only client with the M2 features above, and the only one for Android
and desktop users.
