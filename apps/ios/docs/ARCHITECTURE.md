# down to — native iOS architecture spec

**Status:** final — **revision 4 (reconciliation)**: synthesized from the "direct" proposal, with targeted grafts from "layered"; revision 4 reconciles it with `DESIGN.md` (ledger in §16, every conflict resolved in `DECISIONS.md`). This document plus `INVENTORY.md` plus `DESIGN.md` is sufficient to build the app. **Precedence:** `INVENTORY.md` wins on product behaviour (*what*); this document wins on structure (*how it is built* — module layout, stores, router, data flow, milestone scope); `DESIGN.md` wins on everything visual (*how it looks and feels* — tokens, type, springs, haptics, component anatomy, screen layouts); `DECISIONS.md` wins over all three. The token, spring, haptic and component names used below are `DESIGN.md`'s (`Color.paper`, `Font.dt.meta`, `DTSpring.stamp`, `CheckEntry`, `Folio`, `Slip`, `Pull`, `Masthead`, `.dtSheet`); §13 is the naming map.

**Target:** `/Users/katsu/downto/apps/ios`. iOS 26.0+, SwiftUI only, Swift 6.2 strict concurrency, Xcode 26.2, one iPhone app, portrait only. Bundle id `xyz.downto.app`. The existing Capacitor shell at `/Users/katsu/downto/ios/` stays untouched until the native app ships to TestFlight, then is deleted in its own PR.

**Guiding rule:** one app target, one module, `@Observable` stores per domain, each store talks straight to `supabase-swift`. No repository / use-case / coordinator / protocol-per-client layers. Supabase RLS and DB triggers are the source of truth for liveness, caps, waitlists and squad formation; the client never re-implements them. The only indirections we keep are ones that pay for themselves on day one:

- `Domain/` — pure, `Foundation`-only, no Supabase import: `DateParse`, `Mystery` + `Censor`, `Expiry`, `PushRouting`, `resolveGate`, `LocalDate`, `EmailValidity`, `SquadCountdown`. These are the highest-risk logic and get exhaustive tests. `Domain/` is import-clean so it can be lifted into a local SPM package (`make test-domain`) for a seconds-fast macOS test path — see §12. **Everything Domain functions mention lives in Domain too**: `ID<Tag>` + typealiases, `TolerantEnum` and every DB-backed enum, `Route`/`Tab`/`FriendsTab`, `SessionState`, `GateProfile`, `NotificationFacts`, `Presence`. `Data/` and `Stores/` import nothing from each other that Domain needs — the dependency arrow is strictly `Domain ← Data ← Stores ← Features` (§1.0).
- `DowntoAPI` — the Bearer `/api/*` client (needs 401-retry and typed errors).
- `RealtimeHub` — the only thing that touches `supabase.realtime`.
- `Presence` — a two-case enum that makes mystery-mode leaks a compile error (§9).

**The brief is "make it f***ing beautiful."** The beauty budget is `DESIGN.md` (§14 below is the index into it, with the structural notes that survive here). Do not flatten the brand into a stock iOS template: cream paper `#FCFFE2`, magenta `#FE44FF` as a stamp, Inter headings, IBM Plex Mono body, full-bleed broadsheet entries (no card corners), a transcript chat (no bubbles), kaomoji, "press f".

---

## 0. Glossary

| Term | Meaning |
|---|---|
| **check** | An interest check (`interest_checks` row): "who's down for X?" |
| **DOWN** | The single response type. Tapping DOWN inserts a `check_responses` row; the DB may convert it to `waitlist` when the check is capped. |
| **squad** | A small group chat (`squads` + `squad_members` + `messages`) auto-created by a DB trigger on the first non-author DOWN. |
| **mystery check** | `interest_checks.mystery = true`: author identity hidden from non-authors and guest list hidden from everyone until local midnight of `event_date`. |
| **FoF** | friend-of-friend. Checks from FoF show "via {mutualFriend}". |
| **raw** | Normalised table rows held in a store (`FeedRaw`). Never rendered directly. |
| **display** | The redacted, view-ready projection built by `rebuild()` (`FeedCheck`, `MemberDisplay`, `ChatMessageDisplay`). The only thing views see. |
| **TableChange<T>** | A decoded realtime Postgres change: `.insert(T)`, `.update(T)`, `.delete(T.Key)`. |
| **LocalDate** | A calendar day with no time zone (`YYYY-MM-DD`). Never a `Date`. |

---

## 1. Project layout

```
apps/ios/
├── project.yml                          # XcodeGen spec (committed); Downto.xcodeproj is gitignored
├── Makefile                             # gen / build / test / test-domain / ui-test / ui-test-live / run
├── .tool-versions                       # xcodegen 2.44 (required); xcbeautify 2.x (optional — Makefile falls back to cat)
├── .gitignore                           # Downto.xcodeproj, .build, Config/Secrets.xcconfig, Config/*.override.xcconfig
├── Config/
│   ├── Base.xcconfig                    # bundle id, deployment target, Swift settings, `#include? "Secrets.xcconfig"`
│   ├── Local.xcconfig                   # SUPABASE_URL = http://127.0.0.1:54321, API_BASE_URL = http://127.0.0.1:3000
│   ├── Staging.xcconfig
│   ├── Prod.xcconfig
│   └── Secrets.example.xcconfig         # DEVELOPMENT_TEAM = ; copy to Secrets.xcconfig (gitignored) for device builds
├── Downto/                              # the single app target
│   ├── App/
│   │   ├── DowntoApp.swift              # @main, builds AppEnvironment, ScenePhase + onOpenURL + NSUserActivity
│   │   ├── AppDelegate.swift            # APNs callbacks, UNUserNotificationCenterDelegate
│   │   ├── AppEnvironment.swift         # composition root: SupabaseClient + all stores, built once
│   │   ├── RootView.swift               # switch resolveGate(...) → onboarding screens or MainShell
│   │   ├── MainShell.swift              # root ZStack (DESIGN §10 order): 3 tab roots → Folio → CreateOverlay → stamp layer → Slip host → offline band → Grain; sheet/cover host
│   │   ├── Router.swift                 # @Observable Router, Route/Sheet/FeedDestination enums, feedPath/squadPath, hidesFolio, pending-route replay, drainPendingIntents (§7.4)
│   │   └── InteractivePopEnabler.swift  # UIViewControllerRepresentable shim: re-enables UINavigationController's interactive pop under a hidden nav bar (§7.5)
│   ├── Config/
│   │   ├── AppConfig.swift              # throwing init from Info.plist
│   │   └── Info.plist                   # generated by xcodegen from project.yml `info:`; committed for readability
│   ├── Data/
│   │   ├── Supabase.swift               # SupabaseClient factory, JSON coders, PostgresTimestamp strategy
│   │   ├── SessionStorage.swift         # AuthLocalStorage impl — ONLY for the ThisDeviceOnly accessibility variant (§6); delete if that is dropped
│   │   ├── Models/                      # one file per table (Profile.swift, InterestCheck.swift, …)
│   │   ├── Payloads.swift               # RPC / API result shapes: SharedCheck, CheckState, RedeemResult, FriendsEventPayload, … (§3.9)
│   │   ├── RPC.swift                    # typed rpc wrappers
│   │   ├── DowntoAPI.swift              # /api/* Bearer client with 401 retry
│   │   ├── AppError.swift               # error normalisation + toast copy
│   │   ├── LocalCache.swift             # actor: snapshot JSON to Application Support
│   │   ├── ImageCache.swift             # actor over URLCache for hero + chat images
│   │   └── ImageResizer.swift           # nonisolated resize for chat uploads
│   ├── Stores/
│   │   ├── SessionStore.swift
│   │   ├── ProfileStore.swift
│   │   ├── FeedStore.swift              # + FeedRaw, rebuild(), ExpiryClock
│   │   ├── SquadsStore.swift            # list + unread + per-squad channels
│   │   ├── ChatStore.swift              # one instance per open squad chat
│   │   ├── NotificationsStore.swift     # + NotificationSideEffects
│   │   ├── FriendsStore.swift
│   │   ├── PushStore.swift
│   │   └── ToastCenter.swift
│   ├── Realtime/
│   │   ├── RealtimeHub.swift
│   │   ├── ChangeBuffer.swift           # per-store buffer of TableChanges received while a hydrate/refresh select is in flight (§4.7.1)
│   │   └── TableChange.swift            # decoding of Postgres change payloads → TableChange<T>
│   ├── Domain/                          # PURE. Only `import Foundation`. No Supabase, no UIKit, no SwiftUI. Every type here is `nonisolated`.
│   │   ├── ID.swift                     # phantom-typed ID<Tag> + typealiases (moved here so Domain can name UserID/CheckID/…)
│   │   ├── Enums.swift                  # TolerantEnum + every DB CHECK-backed enum (ResponseKind, DateStatus, NotificationType, …)
│   │   ├── Route.swift                  # Route, Tab, FriendsTab (Codable; consumed by Router and PushRouting)
│   │   ├── SessionState.swift           # enum SessionState { booting, signedOut, signedIn(UserID) } — SessionStore.state's type
│   │   ├── LocalDate.swift
│   │   ├── DateParse.swift              # port of src/lib/dateParse.ts
│   │   ├── Mystery.swift                # port of src/features/checks/lib/mystery.ts
│   │   ├── Censor.swift                 # exact port of src/lib/censor.ts
│   │   ├── Presence.swift               # Presence, PersonRef, GuestList
│   │   ├── Expiry.swift                 # computeExpiry
│   │   ├── SquadCountdown.swift         # GroupsView countdown/fading rules
│   │   ├── PushRouting.swift            # mapPushToRoute
│   │   ├── Gate.swift                   # resolveGate + GateInput + GateProfile
│   │   ├── NotificationSideEffects.swift  # takes NotificationFacts (type + related ids), not AppNotification
│   │   ├── EmailValidity.swift          # port of src/lib/emailValidity.ts
│   │   └── FeedOrdering.swift           # timed-pinned + chrono tier sort
│   ├── DesignSystem/                    # names are DESIGN.md's (§13 is the map); every value lives in DESIGN.md, none is restated here
│   │   ├── Tokens/
│   │   │   ├── Color+DT.swift           # Color.paper/ink/dt/dtInk/… (Asset Catalog colour sets, DESIGN §1.2–1.3), PaperStock environment key,
│   │   │   │                            #   the stock-resolving ShapeStyles (.dtInk, .inkMuted, .squadInk, …), Increase Contrast / Reduce Transparency remaps (DESIGN §8)
│   │   │   ├── Typography.swift         # DTTextStyle (the DESIGN §2.1 table), Font.dt.*, .dtFont(_:), Text.dtTracking / .dtTracked, kaomoji cascade (DESIGN §2.2), checkText face token (DESIGN §2.3)
│   │   │   └── Layout.swift             # Space.*, Radius.*, Elevation.* (DESIGN §3)
│   │   ├── Motion.swift                 # DTSpring.page/.settle/.snap/.ink/.stamp/.reveal + Motion.resolve(_:) for Reduce Motion (DESIGN §5, §8)
│   │   ├── Haptics.swift                # HapticEngine actor + HapticPattern.squadFormed/.mysteryReveal (DESIGN §6.2); the .sensoryFeedback map is DESIGN §6.1, applied at call sites
│   │   ├── Components/                  # DTButton, DownToggle, AvatarLetter, AvatarStack, Pill, NewFlag, ExpiryRule, MysteryFrame, Slip, Grain,
│   │   │                                #   MetaLine, LinkifiedText, Folio, Masthead, Pull, SectionLabel, EmptyState, ErrorColophon, Skeleton,
│   │   │                                #   ScrambleRenderer, WobbleRenderer (DESIGN §4, §5.9, §7.15)
│   │   ├── Sheets/                      # DTSheet.swift — the .dtSheet(detents:) modifier incl. the drag handle (DESIGN §4.9); confirms are native .confirmationDialog
│   │   └── PreviewGrid.swift            # ComponentGallery — the design-review surface + snapshot target
│   ├── Features/
│   │   ├── Auth/                        # AuthView, OTPView, ProfileSetupView, EnableNotificationsView, FriendGateView (FirstCheck = CreateOverlay in "first" mode)
│   │   ├── Feed/                        # FeedView, CheckEntry, EventEntry (read-only in M1), CheckDetailView (zoom push), CreateOverlay (root overlay),
│   │   │                                #   EditCheckSheet, CheckActionsSheet, DeletedCheckView (push), HiddenSection, WhenField, NotifNudgeBanner
│   │   ├── Squads/                      # SquadsView, SquadRow, SquadChatView, ChatHeader (§7.5), ChatScrollController (§7.6), MessageGroupRow, SystemMessageRow,
│   │   │                                #   ImageMessageRow, PollPlaceholderRow, ComposerSlot (composer + lifecycle strips, DESIGN §4.10), MentionPicker, DateConfirmBar,
│   │   │                                #   DateProposalSheet, JoinRequestBanner, SquadSettingsSheet, SquadMembersView, ImageViewer
│   │   ├── Notifications/               # NotificationsSheet, NotificationRow
│   │   ├── Friends/                     # FriendsSheet, FriendRow, UserProfileSheet, FriendRequestBanner
│   │   ├── Profile/                     # ProfileView, EditProfileSheet, ArchivedChecksSection, BlockedUsersSection
│   │   └── Report/                      # ReportSheet
│   ├── Resources/
│   │   ├── Assets.xcassets              # AppIcon (+ dark/tinted/clear, DESIGN §7.18), AccentColor (#FE44FF), one colour set per DESIGN §1.2–1.3 token (Any/Dark),
│   │   │                                #   grain-256.png (256×256 tileable noise, DESIGN §1.4)
│   │   ├── Fonts/                       # InterVariable.ttf (variable, wght+opsz) + IBMPlexMono-{Regular,Medium,SemiBold,Bold,Italic}.ttf (static) — §13, DESIGN §2
│   │   ├── PrivacyInfo.xcprivacy        # App Store privacy manifest: Required Reason APIs (UserDefaults, file timestamps, disk space) + collected data (§1.3)
│   │   └── Downto.entitlements
│   └── Preview/
│       ├── Fixtures.swift               # Fixtures.world(.busyFriday) etc. — seeded worlds
│       └── FakeWorldBoot.swift          # -DT_FAKE_WORLD launch-arg handling (#if DEBUG)
├── DowntoTests/                         # Swift Testing
│   ├── Domain/                          # DateParseTests, MysteryTests, CensorGoldenTests, ExpiryTests, SquadCountdownTests,
│   │                                    #   PushRoutingTests, GateTests, EmailValidityTests, FeedOrderingTests, NotificationSideEffectsTests
│   ├── Data/                            # ModelDecodingTests, AppConfigTests, AppErrorTests, IDTests
│   ├── Stores/                          # FeedRebuildTests, RealtimeInvariantTests, UnreadRuleTests, ChatStoreTests
│   ├── Snapshots/                       # ComponentGallerySnapshotTests (swift-snapshot-testing) + __Snapshots__/
│   └── Fixtures/rows/*.json             # captured JSON per table + per RPC from local Supabase
└── DowntoUITests/
    ├── FakeWorldSmokeTests.swift        # no network; runs on every CI push
    └── LiveSmokeTests.swift             # needs local Supabase + next dev + Mailpit; `make ui-test-live`
```

**One module, no local SPM packages in M1.** At < 25k lines a single module compiles in well under a minute incrementally, previews stay simple, `internal` is the default access level. `Domain/` is kept `Foundation`-only so that `make test-domain` can compile it (plus `DowntoTests/Domain`) as an ad-hoc `swift test` package on macOS; see §12. If that path proves valuable, promote `Domain/` to `Packages/DowntoDomain` in M2 — a folder move, zero code change.

### 1.0 Layering and isolation rules (what the compiler enforces)

- **Dependency arrow**: `Domain ← Data ← Stores/Realtime ← Features/App`. `Domain/` names only Foundation and its own types; `Data/Models` may name Domain types (`ID`, enums, `LocalDate`); stores may name both; nothing below `Stores/` names a store. `scripts/test-domain.sh` proves the first link by compiling `Domain/` alone.
- **Types that Domain functions take or return live in Domain.** Concretely: `ID<Tag>` and all typealiases (`Domain/ID.swift`); `TolerantEnum` and every DB-backed enum, because `SquadCountdown.countdown` takes `DateStatus`, `PushRouting` switches on `NotificationType`, `FeedOrdering` reads `ResponseKind` (`Domain/Enums.swift`); `Route`/`Tab`/`FriendsTab` because `mapPushToRoute` returns `Route` (`Domain/Route.swift`); `SessionState` because `resolveGate` takes it; `GateProfile` (`onboarded`, `displayName`, `referredByCheckId`) instead of the full `Profile`; `NotificationFacts` (`type`, `relatedCheckId`, `relatedSquadId`, `relatedEventId`, `relatedUserId`) instead of `AppNotification` — `AppNotification` exposes `var facts: NotificationFacts`. `Presence`/`PersonRef`/`GuestList` already live there.
- **Default actor isolation is `MainActor`** (SE-0466) for the app target, so stores, views and the router need no annotation. Under SE-0470 that would also make every `Codable` conformance main-actor-isolated, and `LocalCache` (an actor), `ImageResizer` (`Task.detached`), the `nonisolated` `JSON` coders, `PostgresTimestamp.decode`, and supabase-swift's own `execute().value` / `decodeRecord` all decode from non-main contexts. Therefore: **every type in `Domain/` (including `Domain/ID.swift` — it lives in Domain, not Data, see the tree and §3.3), `Data/Models/`, `Data/Payloads.swift`, the display models in §3.5, `TableChange`, `AppError`, `FeedRaw`/`SquadsRaw`/`ChatRaw`/`FriendsRaw`, and `Fixtures.Built` is declared `nonisolated struct` / `nonisolated enum`** (Swift 6.2 allows `nonisolated` on type declarations; it makes the type and all its conformances non-isolated). The code samples in this document omit the keyword for brevity — treat it as present on every value type below and on every `static func` in `Domain/`. A `-warnings-as-errors` build with a missing `nonisolated` fails at the first off-main decode, so this is self-policing. A test in `ModelDecodingTests` decodes every fixture from inside `Task.detached` to lock it in.
- Classes (`@Observable` stores, `Router`, `RealtimeHub`, `AppEnvironment`) stay main-actor by default. The three explicit actors in `Data/` hold no model state that views read directly.

### 1.1 `project.yml`

```yaml
name: Downto
options:
  bundleIdPrefix: xyz.downto
  deploymentTarget: { iOS: "26.0" }
  xcodeVersion: "26.2"
  createIntermediateGroups: true
  generateEmptyDirectories: true
configs:
  Debug-Local: debug
  Debug-Staging: debug
  Debug-Prod: debug
  Release: release
configFiles:
  Debug-Local:   Config/Local.xcconfig
  Debug-Staging: Config/Staging.xcconfig
  Debug-Prod:    Config/Prod.xcconfig
  Release:       Config/Prod.xcconfig
settings:
  base:
    SWIFT_VERSION: "6"                                    # language MODE (Xcode accepts 4/4.2/5/6); the toolchain is Swift 6.2 (Xcode 26.2). DECISIONS #33
    SWIFT_STRICT_CONCURRENCY: complete
    SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor          # Swift 6.2 (SE-0466): everything is @MainActor unless marked nonisolated — all model/domain/display value types ARE marked nonisolated (§1.0)
    SWIFT_UPCOMING_FEATURE_NONISOLATED_NONSENDING_BY_DEFAULT: YES   # SE-0461
    SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY: YES
    TARGETED_DEVICE_FAMILY: "1"
    INFOPLIST_KEY_UISupportedInterfaceOrientations: UIInterfaceOrientationPortrait
    INFOPLIST_KEY_UILaunchScreen_Generation: YES
    CODE_SIGN_STYLE: Automatic
    DEVELOPMENT_TEAM: $(DEVELOPMENT_TEAM)               # empty is fine for simulator
    ENABLE_USER_SCRIPT_SANDBOXING: YES
    OTHER_SWIFT_FLAGS: -warnings-as-errors                # keep the build clean from day one
packages:
  Supabase:
    url: https://github.com/supabase/supabase-swift
    exactVersion: "2.55.2"                                # PINNED (not `from:`): `main` has already renamed AuthOptions.autoRefreshToken →
                                                          # automaticallyRefreshesToken and added KeychainLocalStorage(useDataProtectionKeychain:);
                                                          # every snippet in this doc is written against v2.55.2. Bumping = a PR that re-reads §3.1 + §6.
  SnapshotTesting:
    url: https://github.com/pointfreeco/swift-snapshot-testing
    from: "1.18.0"
targets:
  Downto:
    type: application
    platform: iOS
    sources:
      - path: Downto
        excludes: ["**/*.md"]
      - path: Downto/Resources/PrivacyInfo.xcprivacy      # listed explicitly so xcodegen puts it in the Copy Bundle Resources phase (must land at the bundle root)
        buildPhase: resources
    entitlements:                                          # xcodegen WRITES this file on every `make gen` — the keys live here, never edited on disk (DECISIONS #33)
      path: Downto/Resources/Downto.entitlements
      properties:
        aps-environment: development
    info:
      path: Downto/Config/Info.plist
      properties:
        CFBundleDisplayName: down to
        CFBundleShortVersionString: "1.0.0"
        CFBundleVersion: $(BUILD_NUMBER)                   # set by CI; 1 locally
        APP_ENV: $(APP_ENV)
        SUPABASE_URL: $(SUPABASE_URL)
        SUPABASE_ANON_KEY: $(SUPABASE_ANON_KEY)
        API_BASE_URL: $(API_BASE_URL)
        UIAppFonts: [InterVariable.ttf, IBMPlexMono-Regular.ttf, IBMPlexMono-Medium.ttf, IBMPlexMono-SemiBold.ttf, IBMPlexMono-Bold.ttf, IBMPlexMono-Italic.ttf]   # §13 / DESIGN §2
        CFBundleURLTypes: [{ CFBundleURLSchemes: [downto] }]       # fallback custom scheme; universal links are primary (§7.2)
        UIBackgroundModes: [remote-notification]
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true }   # local Supabase over http
        NSPhotoLibraryUsageDescription: "to send a pic to your squad"
        NSCameraUsageDescription: "to send a pic to your squad"
        UIUserInterfaceStyle: Light                          # cream theme is light-only in M1
        ITSAppUsesNonExemptEncryption: false
    dependencies:
      - package: Supabase
        products: [Supabase]                                # umbrella: Auth, PostgREST, Realtime, Storage, Functions
  DowntoTests:
    type: bundle.unit-test
    platform: iOS
    sources: [DowntoTests]
    dependencies:
      - target: Downto
      - package: SnapshotTesting
        products: [SnapshotTesting]
    settings:
      base:
        SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor
  DowntoUITests:
    type: bundle.ui-testing
    platform: iOS
    sources: [DowntoUITests]
    dependencies: [{ target: Downto }]
    settings:
      base:
        SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated      # XCTestCase's inherited inits are nonisolated; a MainActor default breaks every subclass. Test bodies opt in with @MainActor. (DECISIONS #33)
schemes:
  Downto-Local:
    build: { targets: { Downto: all, DowntoTests: [test], DowntoUITests: [test] } }
    run:  { config: Debug-Local }
    test: { config: Debug-Local, targets: [DowntoTests, DowntoUITests] }
  Downto-Staging:
    build: { targets: { Downto: all } }
    run:  { config: Debug-Staging }
  Downto-Prod:
    build: { targets: { Downto: all } }
    run:  { config: Debug-Prod }
    archive: { config: Release }
```

`Info.plist` is generated from the `info:` block (xcodegen writes it); commit the generated file so reviewers can read it, and regenerate with `make gen`.

`UIBackgroundModes: [remote-notification]` is kept only so a future silent push can be adopted without a plist change; **the app registers no silent-push handler in M1** and has no background execution path (§6). Remove the key if App Review asks why it is declared.

### 1.2 Config injection

`Config/Base.xcconfig`:
```
PRODUCT_BUNDLE_IDENTIFIER = xyz.downto.app
IPHONEOS_DEPLOYMENT_TARGET = 26.0
BUILD_NUMBER = 1
#include? "Secrets.xcconfig"
```

`Config/Local.xcconfig`:
```
#include "Base.xcconfig"
APP_ENV = local
SUPABASE_URL = http:/$()/127.0.0.1:54321
SUPABASE_ANON_KEY = <paste the local anon key from `supabase status`>
API_BASE_URL = http:/$()/127.0.0.1:3000
#include? "Local.override.xcconfig"
```
(`$()` is the xcconfig trick that stops `//` being read as a comment.) `Staging.xcconfig` / `Prod.xcconfig` follow the same shape with `https:/$()/…` URLs and `APP_ENV = staging|prod`. Anon keys are public by design and are committed. `Config/Secrets.xcconfig` (gitignored) holds `DEVELOPMENT_TEAM` — the same Team ID is the `<TEAMID>` prefix in the web's AASA `appID` (§7.2), so `Secrets.example.xcconfig` documents both uses. `Config/Local.override.xcconfig` (gitignored) is for a LAN IP when testing on a device against a laptop.

`Config/AppConfig.swift` — **fail fast, no force-unwraps**:

```swift
struct AppConfig: Sendable {
    enum Env: String, Sendable { case local, staging, prod }
    enum ConfigError: Error, CustomStringConvertible {
        case missing(String), malformed(String, String)
        var description: String {
            switch self {
            case .missing(let k): "Info.plist is missing \(k). Check Config/*.xcconfig and run `make gen`."
            case .malformed(let k, let v): "Info.plist key \(k) has malformed value \(v)."
            }
        }
    }
    let env: Env
    let supabaseURL: URL
    let supabaseAnonKey: String
    let apiBase: URL
    let build: String                          // "1.0.0 (42)"
    static let webBase = URL(string: "https://downto.xyz")!   // share links always point at prod web

    init(bundle: Bundle = .main) throws {
        func str(_ k: String) throws -> String {
            guard let v = bundle.object(forInfoDictionaryKey: k) as? String, !v.isEmpty else { throw ConfigError.missing(k) }
            return v
        }
        func url(_ k: String) throws -> URL {
            let s = try str(k)
            guard let u = URL(string: s), u.scheme != nil, u.host != nil else { throw ConfigError.malformed(k, s) }
            return u
        }
        let e = try str("APP_ENV")
        guard let env = Env(rawValue: e) else { throw ConfigError.malformed("APP_ENV", e) }
        self.env = env
        supabaseURL = try url("SUPABASE_URL")
        supabaseAnonKey = try str("SUPABASE_ANON_KEY")
        apiBase = try url("API_BASE_URL")
        build = "\(try str("CFBundleShortVersionString")) (\(try str("CFBundleVersion")))"
    }
}
```

`DowntoApp.init` does `do { config = try AppConfig() } catch { fatalError("\(error)") }` — a loud crash at launch on a misconfigured build, with the message telling the engineer what to fix. `AppConfigTests` constructs from a test `Bundle` with each key removed and asserts the specific error.

### 1.3 Privacy manifest (`Downto/Resources/PrivacyInfo.xcprivacy`)

Since May 2024 App Store Connect rejects an upload whose binary calls a Required Reason API without a manifest entry, so the §12 nightly TestFlight upload and the M1 definition-of-done fail at upload without this file. The app itself uses three such API categories: **`UserDefaults`** (every `dt.*` key, §4.6), **file timestamp** APIs (`LocalCache` reads `savedAt` via `FileManager.attributesOfItem` / `URLResourceValues.contentModificationDate` to tag snapshots stale, §4.6) and **disk space** (`ImageCache` checks `volumeAvailableCapacityForImportantUsage` before growing the 200 MB `URLCache`). Checked on 2026-09-23: **supabase-swift v2.55.2 ships no `PrivacyInfo.xcprivacy` of its own** (`find` over the tag's tarball returns nothing), and even when a dependency does ship one it declares only the dependency's own usage — it never covers the app's. Contents:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeOtherUserContent</string>   <!-- checks, messages, comments, chat photos -->
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeDeviceID</string>          <!-- APNs device token, push_subscriptions -->
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>          <!-- app's own defaults only -->
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>          <!-- timestamps of files inside the app container -->
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>E174.1</string></array>          <!-- to size the image cache / write snapshots safely -->
    </dict>
  </array>
</dict></plist>
```

Rules: (a) the file is listed in `project.yml` with `buildPhase: resources` so it lands at the **bundle root** (a nested path is ignored by App Store Connect); (b) `make test` runs `scripts/check-privacy.sh`, which greps `Downto/` for `UserDefaults`, `contentModificationDate|attributesOfItem|creationDate`, `volumeAvailableCapacity|systemFreeSize`, `systemUptime|mach_absolute_time`, `activeInputModes` and fails if a category is used in code but missing from the manifest (system boot time and keyboard APIs are *not* used today and must stay out until added here); (c) the Xcode 26 **Privacy Report** (Product → Archive → Generate Privacy Report) is attached to the first TestFlight PR; (d) if a future dependency (e.g. `sentry-cocoa` in M2) needs a reason, it ships its own manifest — the app's file still only declares the app's own calls.

---

## 2. Dependencies

| Package | Version | Why | Alternative rejected |
|---|---|---|---|
| `supabase-swift` (umbrella `Supabase`) | **exactly v2.55.2** (`exactVersion`, §1.1) | Auth OTP + Keychain session + auto refresh; PostgREST builder with Codable; Realtime v2 channels as `AsyncStream`; Storage signed URLs. It *is* the backend surface. Pinned because `main` has already renamed `AuthOptions.autoRefreshToken` → `automaticallyRefreshesToken` and added `KeychainLocalStorage(useDataProtectionKeychain:)`; a floating `from:` would break §3.1 on the next resolve. | Hand-rolled REST — would re-implement refresh + Phoenix realtime. No. |
| `swift-snapshot-testing` | ≥ 1.18 | **Test target only.** One snapshot of `ComponentGallery` (the DesignSystem preview grid) at iPhone 17 Pro scale as a guard against someone turning the broadsheet entries back into cards. | Nothing; it's 1 test file. |
| **Nothing else.** | | | |

Explicitly rejected for M1:
- **Sentry** — deferred to M2. `os.Logger` (subsystem `xyz.downto.app`, categories `feed`, `squads`, `realtime`, `push`, `auth`) + `MetricKit` crash diagnostics. Adding `sentry-cocoa` later is ~20 lines in `DowntoApp.init`.
- **Kingfisher / Nuke** — `AsyncImage` + `ImageCache` actor (memory 50 MB / disk 200 MB `URLCache`). Revisit if scroll perf demands.
- **swift-dependencies / TCA / Factory** — `AppEnvironment` is constructed once and injected via `.environment(_:)`.
- **SwiftData / GRDB** — not offline-first (§4.4).
- **KeychainAccess** — the session lives in the Keychain via supabase-swift's own `KeychainLocalStorage` (already `kSecAttrAccessibleAfterFirstUnlock`, §6); the optional 40-line `Data/SessionStorage.swift` exists only to add `ThisDeviceOnly`. No wrapper needed either way.
- **swift-async-algorithms** — not needed: the only timer in the app is a `while !Task.isCancelled { try? await Task.sleep(for:) }` loop on `ContinuousClock` (§4.8). Do not add it for `AsyncTimerSequence`.
- **swiftlint / swiftformat** — not in M1 CI; `-warnings-as-errors` and code review are enough for a small team.

Fonts: **`InterVariable.ttf`** (the variable font, `wght` + `opsz` axes) and the **five static IBM Plex Mono cuts** (Regular, Medium, SemiBold, Bold, Italic). SwiftUI's `.weight()` / `.bold()` cannot drive a variable font's `wght` axis, so no style is ever built with them — every `Font.dt.*` goes through `UIFontDescriptor` variation attributes, which do drive the axes (§13, `DESIGN.md` §2; DECISIONS #5). Dragonfruit theme (Instrument Serif + Space Mono) deferred; the Asset Catalog colour sets and `DTTextStyle` are structured so a second token set is a drop-in.

---

## 3. Data layer

### 3.1 Coders and client

```swift
// Data/Supabase.swift
enum JSON {
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom(PostgresTimestamp.decode)
        return d
    }()
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .custom(PostgresTimestamp.encode)   // ISO8601 with fractional seconds, "Z"
        return e
    }()
    /// Reserved for any RPC that returns camelCase JSON. As of 2026-09-23 NONE does: get_check_state is a TABLE (snake_case),
    /// get_friends_events is `to_jsonb(events)` (snake_case). INVENTORY's `{active, isMine}` is the web wrapper's camelised copy. See §3.9.
    static let camelDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom(PostgresTimestamp.decode)
        return d
    }()
}

enum PostgresTimestamp {
    // Accepts: 2026-09-23T18:04:11.123456+00:00 | 2026-09-23T18:04:11+00:00 | 2026-09-23T18:04:11.123Z | 2026-09-23 18:04:11.123456+00
    nonisolated static func decode(_ decoder: Decoder) throws -> Date
    nonisolated static func encode(_ date: Date, _ encoder: Encoder) throws
}
```

Implementation: **one regex-validated path** — `^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$` with range guards on month/day/hour/minute/second, then `Calendar(.gregorian)` in a fixed-offset zone plus the fraction as nanoseconds. An earlier draft tried `Date.ISO8601FormatStyle` first and fell back to a `DateFormatter`; both were dropped because `ISO8601FormatStyle.parse` silently rolls `25:99:99` over into the next day (verified on iOS 26.3) — a bad server value must surface, not become a wrong `Date`. Any failure → `DecodingError.dataCorrupted` with the raw string in the debug description. Encoding is `Date.ISO8601FormatStyle(includingFractionalSeconds: true).format` (`…T18:04:11.123Z`). `ModelDecodingTests` covers all four forms, a non-UTC offset, and the roll-over rejection.

```swift
let supabase = SupabaseClient(
    supabaseURL: config.supabaseURL,
    supabaseKey: config.supabaseAnonKey,
    options: .init(
        db: .init(encoder: JSON.encoder, decoder: JSON.decoder),
        // SupabaseClientOptions.AuthOptions at v2.55.2 (Sources/Supabase/Types.swift:37-47), EXACT labels, in declaration order — verified against the
        // resolved checkout on 2026-09-23:
        //   init(storage:, redirectToURL: = nil, storageKey: = nil, flowType: = .pkce, encoder: = …, decoder: = …, autoRefreshToken: = true,
        //        emitLocalSessionAsInitialSession: = false, accessToken: = nil)          // the last two are defaulted and unused
        // RealtimeClientOptions (Sources/RealtimeV2/Types.swift:165): init(headers:, heartbeatInterval:, reconnectDelay:, timeoutInterval:, …) — labels below are exact.
        // KeychainLocalStorage(service: String? = "supabase.gotrue.swift", accessGroup: String? = nil) — Sources/Auth/Storage/KeychainLocalStorage.swift:14.
        auth: .init(
            storage: KeychainLocalStorage(service: "xyz.downto.app", accessGroup: nil),   // library storage; already kSecAttrAccessibleAfterFirstUnlock (§6)
            flowType: .implicit,                 // matches web
            autoRefreshToken: true               // v2.55.2 label. On `main` this is `automaticallyRefreshesToken:` — the package is pinned (§1.1), do NOT "fix" this label
            // `emitsSessionEvents` is NOT a field and must not appear. `authStateChanges` always emits.
        ),
        global: .init(headers: ["x-client-info": "downto-ios/\(config.build)"]),
        realtime: .init(heartbeatInterval: 25, reconnectDelay: 2)
    )
)
```

### 3.2 Typing rules

- **snake_case → camelCase** via `.convertFromSnakeCase` everywhere. Never hand-write `CodingKeys` on a table model. If a column ever needs one, add a comment saying why. (Known-good round-trips: `ig_url`→`igUrl`, `reminded_24h_at`→`reminded24hAt`, `p256dh` (never decoded), `related_user_id`→`relatedUserId`.)
- **UUIDs** — `UUID`. PostgREST returns lowercase; Foundation accepts it. We encode uppercase; Postgres accepts it. Wrapped in phantom-typed IDs (§3.3).
- **Timestamps** (`timestamptz`) — `Date` via `PostgresTimestamp`.
- **Local dates** (`event_date`, `events.date`, `locked_date`, `grid_dates`, `grid_range_*`) — **`LocalDate`, never `Date`**:

```swift
// Domain/LocalDate.swift
struct LocalDate: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    let year: Int, month: Int, day: Int
    init?(iso: String)                                    // "2026-09-23"; nil on any other shape
    init(_ date: Date, calendar: Calendar)                // calendar.dateComponents([.year,.month,.day], from:)
    var iso: String                                       // zero-padded, "%04d-%02d-%02d"
    static func < (a: Self, b: Self) -> Bool              // (year, month, day) tuple compare == lexicographic on iso
    func adding(days: Int, calendar: Calendar) -> LocalDate
    func startOfDay(in calendar: Calendar) -> Date         // local midnight; used by SquadCountdown only
    // Codable: single-value string
}
```
  This is the single most important typing decision: `mystery.ts` and `dateParse.ts` both say "compare ISO strings, never `Date`". `LocalDate` makes that the only option.
- **Times** (`event_time`, `time_display`, `arrival_time`) — `String` ("7pm", "7:30pm"). Only `SquadCountdown.eventStart` parses them, with the same regex as `GroupsView.getEventStartMs`.
- **Enums** — `String`-backed, `Codable`, `Sendable`, all in `Domain/Enums.swift` (§1.0). Every enum backed by a DB CHECK constraint gets a tolerant `init(from:)` that maps unknown raw values to `.unknown` so a new server value never crashes a decode. Implemented once as a `protocol TolerantEnum: RawRepresentable & Codable { static var unknown: Self { get } }` with a default `init(from:)`. **Confirm each CHECK constraint against the *latest* migration that touches it, not the initial schema**: e.g. `check_responses.response` was `('down','maybe','nah')` in `20260214000001_initial_schema.sql` but is `('down','waitlist')` since `20260316000001_unify_down_and_squad_size.sql`. `ResponseKind { down, waitlist, unknown }` is correct as of 2026-09-23; `scripts/check-enums.sh` (run in `make test`) greps the last `ADD CONSTRAINT … CHECK (… IN (…))` for each enum's column and diffs it against the Swift cases, so a future migration that adds a value fails CI here instead of silently decoding to `.unknown`.
- **JSONB** — `movie_metadata` → `MovieMetadata` struct (`title`, `year: String?`, `director: String?`, `thumbnail: String?`, `vibes: [String]?`), `squad_polls.options` → `[PollOption]` (`text: String`, `date: LocalDate?`, `time: String?`).

### 3.3 Phantom-typed IDs

```swift
// Domain/ID.swift  (Domain, not Data — see §1.0; `nonisolated struct`)
struct ID<Tag>: Hashable, Sendable, Codable, CustomStringConvertible {
    let raw: UUID
    init(_ raw: UUID) { self.raw = raw }
    init?(_ string: String) { guard let u = UUID(uuidString: string) else { return nil }; raw = u }
    init(from decoder: Decoder) throws { raw = try decoder.singleValueContainer().decode(UUID.self) }
    func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(raw) }
    var description: String { raw.uuidString.lowercased() }
}
extension ID: CodingKeyRepresentable { … }   // `[ID<Tag>: V]` must encode as a JSON OBJECT (§3.9 raw stores); without this JSONEncoder emits a flat pair array. Key = raw.uuidString.
enum UserTag {}; enum CheckTag {}; enum SquadTag {}; enum EventTag {}; enum MessageTag {}; enum PollTag {}; enum NotificationTag {}; enum FriendshipTag {}; enum CommentTag {}
enum ResponseRowTag {}; enum CoAuthorRowTag {}; enum HiddenRowTag {}; enum LeftRowTag {}; enum JoinRequestTag {}; enum ConfirmRowTag {}
typealias UserID = ID<UserTag>; typealias CheckID = ID<CheckTag>; typealias SquadID = ID<SquadTag>
typealias EventID = ID<EventTag>; typealias MessageID = ID<MessageTag>; typealias PollID = ID<PollTag>
typealias NotificationID = ID<NotificationTag>; typealias FriendshipID = ID<FriendshipTag>; typealias CommentID = ID<CommentTag>
typealias ResponseRowID = ID<ResponseRowTag>; typealias CoAuthorRowID = ID<CoAuthorRowTag>; typealias HiddenRowID = ID<HiddenRowTag>; typealias LeftRowID = ID<LeftRowTag>; typealias JoinRequestID = ID<JoinRequestTag>; typealias ConfirmRowID = ID<ConfirmRowTag>
```

The `*RowID` aliases exist because `check_responses`, `check_co_authors`, `hidden_checks`, `left_checks` and `squad_date_confirms` (`20260302000001_date_confirm_flow.sql:9-17` — `id UUID PRIMARY KEY` + `UNIQUE(squad_id, user_id)`) all have a **surrogate `id UUID PRIMARY KEY`** (their `(check_id, user_id)` pair is a separate `UNIQUE` constraint), and Postgres realtime DELETE payloads for tables without `REPLICA IDENTITY FULL` carry **only the primary key** — i.e. `{id}` and nothing else (§5.2). Every model must therefore carry its row id, and the raw stores must be able to find a row by it.

Why: the push payload's `relatedId` "means different things per type", and the web has had bugs from passing a squad id where a check id was expected. With typed IDs `mapPushToRoute` returns `.squads(SquadID?)` vs `.feed(CheckID?)` and the compiler rejects the mix-up. Cost: `supabase.rpc(...params: ["p_squad_id": id.raw])` — write `.raw` at the boundary (RPC params are `[String: AnyJSON]`-ish and take `UUID`). `ID` conforms to `PostgrestFilterValue` via `raw.uuidString` so `.eq("check_id", value: id)` works directly.

### 3.4 Models (`Data/Models/`), one file per table

All are `nonisolated struct … : Codable, Hashable, Sendable` (§1.0), and `Identifiable` where a single `id` exists — which, after the surrogate-key finding above, is every table except `saved_events`, `crew_pool`, `squad_members`, `squad_poll_votes`, `squad_read_cursors`, `friend_links` and `blocked_users`. (`squad_date_confirms` **does** have a surrogate `id` — it was wrongly listed here in an earlier draft; its realtime DELETE payload is `{id}` only, so the model carries `ConfirmRowID`.) Optionals mirror nullable columns. `var` on columns the client updates; `let` otherwise.

```swift
struct Profile: Codable, Identifiable, Hashable, Sendable {
    let id: UserID; var username: String; var displayName: String; let avatarLetter: String
    var availability: Availability?; var igHandle: String?; var onboarded: Bool; let isTest: Bool
    var timezone: String?; let calendarToken: UUID?; let referredByCheckId: CheckID?
    let usernameChangedAt: Date?; let createdAt: Date; let updatedAt: Date
}
enum Availability: String, TolerantEnum { case open, awkward, notAvailable = "not-available", unknown }   // HYPHEN: profiles.availability CHECK is ('open','awkward','not-available') (20260214000001:30) and src/lib/types.ts agrees; an earlier draft wrote "not_available" (DECISIONS #34)

struct InterestCheck: Codable, Identifiable, Hashable, Sendable {
    let id: CheckID; let authorId: UserID; var text: String
    var expiresAt: Date?; var eventDate: LocalDate?; var eventDateLabel: String?; var eventTime: String?; var eventTz: String?
    var dateFlexible: Bool; var timeFlexible: Bool; var location: String?
    var maxSquadSize: Int?                   // nil = unlimited
    let mystery: Bool; var letterboxdUrl: String?; var movieMetadata: MovieMetadata?
    var sharedAt: Date?; var archivedAt: Date?; var lastRalliedAt: Date?; let createdAt: Date
}
struct CheckResponse: Codable, Identifiable, Hashable, Sendable { let id: ResponseRowID; let checkId: CheckID; let userId: UserID; var response: ResponseKind; let createdAt: Date }
enum ResponseKind: String, TolerantEnum { case down, waitlist, unknown }       // constraint as of 20260316000001; 'maybe'/'nah' were removed (§3.2)
struct CheckCoAuthor: Codable, Identifiable, Hashable, Sendable { let id: CoAuthorRowID; let checkId: CheckID; let userId: UserID; let invitedBy: UserID; var status: CoAuthorStatus; let createdAt: Date }
enum CoAuthorStatus: String, TolerantEnum { case pending, accepted, declined, unknown }
struct CheckComment: Codable, Identifiable, Hashable, Sendable { let id: CommentID; let checkId: CheckID?; let eventId: EventID?; let userId: UserID; let text: String; let mentions: [UserID]; let createdAt: Date }
struct HiddenCheck: Codable, Identifiable, Hashable, Sendable { let id: HiddenRowID; let userId: UserID; let checkId: CheckID; let hiddenAt: Date }
struct LeftCheck:   Codable, Identifiable, Hashable, Sendable { let id: LeftRowID;   let userId: UserID; let checkId: CheckID; let leftAt: Date }

struct Event: Codable, Identifiable, Hashable, Sendable {
    let id: EventID; var title: String; var venue: String?; var neighborhood: String?
    var date: LocalDate?; var dateDisplay: String?; var timeDisplay: String?; var vibes: [String]; var note: String?
    var imageUrl: String?; var igHandle: String?; var igUrl: String?; var diceUrl: String?; var letterboxdUrl: String?; var raUrl: String?
    var movieMetadata: MovieMetadata?; var isPublic: Bool; var visibility: EventVisibility; let createdBy: UserID; let createdAt: Date
}
enum EventVisibility: String, TolerantEnum { case `public`, friends, unknown }
struct SavedEvent: Codable, Hashable, Sendable { let userId: UserID; let eventId: EventID; var isDown: Bool; let savedAt: Date }
struct CrewPoolEntry: Codable, Hashable, Sendable { let eventId: EventID; let userId: UserID }

struct Squad: Codable, Identifiable, Hashable, Sendable {
    let id: SquadID; var name: String; let checkId: CheckID?; let eventId: EventID?; let createdBy: UserID
    var meetingSpot: String?; var arrivalTime: String?; var transportNotes: String?
    var expiresAt: Date?; var graceStartedAt: Date?; var warnedAt: Date?; var archivedAt: Date?; var dateNudgeSentAt: Date?
    var lockedDate: LocalDate?; var dateStatus: DateStatus?; let createdAt: Date
}
enum DateStatus: String, TolerantEnum { case proposed, locked, unknown }
struct SquadMember: Codable, Hashable, Sendable { let squadId: SquadID; let userId: UserID; var role: SquadRole; let joinedAt: Date }
enum SquadRole: String, TolerantEnum { case member, waitlist, unknown }

struct Message: Codable, Identifiable, Hashable, Sendable {
    let id: MessageID; let squadId: SquadID; let senderId: UserID?; let text: String?; let isSystem: Bool
    let messageType: MessageType; let mentions: [UserID]; let imagePath: String?; let imageWidth: Int?; let imageHeight: Int?; let createdAt: Date
}
enum MessageType: String, TolerantEnum { case text, poll, dateConfirm = "date_confirm", unknown }

struct SquadPoll: Codable, Identifiable, Hashable, Sendable {
    let id: PollID; let squadId: SquadID; let messageId: MessageID; let question: String; let options: [PollOption]
    var status: PollStatus; let createdBy: UserID; let multiSelect: Bool; let pollType: PollType; let collectionStyle: CollectionStyle?
    let gridDates: [LocalDate]?; let gridHourStart: Int?; let gridHourEnd: Int?; let gridSlotMinutes: Int?; let gridRangeStart: LocalDate?; let gridRangeEnd: LocalDate?
}
enum PollStatus: String, TolerantEnum { case active, closed, unknown }
enum PollType: String, TolerantEnum { case text, dates, availability, when, unknown }
enum CollectionStyle: String, TolerantEnum { case preference, availability, unknown }
struct SquadPollVote: Codable, Hashable, Sendable { let pollId: PollID; let userId: UserID; let optionIndex: Int }
struct SquadDateConfirm: Codable, Identifiable, Hashable, Sendable { let id: ConfirmRowID; let squadId: SquadID; let messageId: MessageID; let userId: UserID; var response: ConfirmResponse?; var respondedAt: Date?; let createdAt: Date? }
// `id` is the surrogate PK (20260302000001:9-17). set-date clear / re-propose DELETE these rows (src/app/api/squads/set-date/route.ts) and the
// dateConfirms(squadId) channel is `*`, so ChatStore.apply(.delete(keys: ["id"])) must match on ConfirmRowID — ChatRaw.confirms is keyed by it (§3.9).
enum ConfirmResponse: String, TolerantEnum { case yes, no, unknown }
struct SquadJoinRequest: Codable, Identifiable, Hashable, Sendable { let id: JoinRequestID; let squadId: SquadID; let userId: UserID; var status: JoinRequestStatus; let createdAt: Date }
enum JoinRequestStatus: String, TolerantEnum { case pending, accepted, declined, unknown }
struct SquadReadCursor: Codable, Hashable, Sendable { let userId: UserID; let squadId: SquadID; var lastReadAt: Date }

struct Friendship: Codable, Identifiable, Hashable, Sendable { let id: FriendshipID; let requesterId: UserID; let addresseeId: UserID; var status: FriendshipStatus; let createdAt: Date }
enum FriendshipStatus: String, TolerantEnum { case pending, accepted, blocked, unknown }
struct FriendLink: Codable, Hashable, Sendable { let token: UUID; let creatorId: UserID; let expiresAt: Date }

struct AppNotification: Codable, Identifiable, Hashable, Sendable {
    let id: NotificationID; let userId: UserID; let title: String; let body: String?; var isRead: Bool; let type: NotificationType
    let relatedUserId: UserID?; let relatedSquadId: SquadID?; let relatedCheckId: CheckID?; let relatedEventId: EventID?; let createdAt: Date
    var facts: NotificationFacts { .init(type: type, relatedUserId: relatedUserId, relatedSquadId: relatedSquadId, relatedCheckId: relatedCheckId, relatedEventId: relatedEventId) }
}
// Domain/NotificationSideEffects.swift — the Domain-side view of a notification (so Domain never imports Data/Models)
struct NotificationFacts: Hashable, Sendable { let type: NotificationType; let relatedUserId: UserID?; let relatedSquadId: SquadID?; let relatedCheckId: CheckID?; let relatedEventId: EventID? }
enum NotificationType: String, TolerantEnum {
    case friendRequest = "friend_request", friendAccepted = "friend_accepted", checkResponse = "check_response"
    case squadMessage = "squad_message", squadInvite = "squad_invite", friendCheck = "friend_check", dateConfirm = "date_confirm"
    case checkTag = "check_tag", checkComment = "check_comment", pollCreated = "poll_created", squadJoinRequest = "squad_join_request"
    case squadMention = "squad_mention", commentMention = "comment_mention", friendEvent = "friend_event", eventReminder = "event_reminder"
    case eventDown = "event_down", checkDateUpdated = "check_date_updated", checkTextUpdated = "check_text_updated"
    case eventDateUpdated = "event_date_updated", checkArchived = "check_archived"
    case checkRevived = "check_revived", squadDateNudge = "squad_date_nudge", unknown
    // NO `eventComment` case: the LATEST notifications_type_check (20260603000001:331-343) lists 22 values and does NOT include 'event_comment',
    // although 20260423000002 added it and the comment trigger (20260429000002:93) still tries to INSERT it — a web-repo inconsistency (DECISIONS #35).
    // Until a migration re-adds it, an 'event_comment' row cannot exist, and if one ever arrives it decodes as `.unknown` (routes nowhere, no side effects).
    // `scripts/check-enums.sh` fails the build the day the constraint changes, which is the signal to add the case back here and in §5.3 / §7.3.
}

struct BlockedUser: Codable, Hashable, Sendable { let blockerId: UserID; let blockedId: UserID; let createdAt: Date }
struct ReportedContent: Encodable, Sendable { let targetType: ReportTarget; let targetId: UUID; let reason: ReportReason; let details: String? }
enum ReportTarget: String, Codable, Sendable { case profile, check, squadMessage = "squad_message", eventComment = "event_comment", checkComment = "check_comment" }
enum ReportReason: String, Codable, Sendable, CaseIterable { case harassment, spam, impersonation, inappropriate, threats, other }
```

Not modelled (never decoded client-side): `push_subscriptions`, `push_logs`, `version_pings`, `squad_poll_availability` (legacy grid cells; M2 if ever).

### 3.5 Composed display models

These are the only things views see. Built by pure `rebuild()` functions from raw rows (§4.2, §9).

```swift
// Domain/Presence.swift
/// Who a row is attributed to, after mystery redaction. A masked presence carries NO id and NO name —
/// the view literally cannot render the real person.
enum Presence: Hashable, Sendable {
    case person(PersonRef)
    case masked(kaomoji: String, scramble: String)
    var kaomojiOrLetter: String { switch self { case .person(let p): p.avatarLetter; case .masked(let k, _): k } }
    var label: String        { switch self { case .person(let p): p.displayName; case .masked(_, let s): s } }
    var isMasked: Bool       { if case .masked = self { true } else { false } }
}
struct PersonRef: Hashable, Sendable { let id: UserID; let displayName: String; let username: String; let avatarLetter: String; let isMe: Bool }
enum GuestList: Hashable, Sendable {
    case revealed(downs: [PersonRef], waitlist: [PersonRef])
    case hidden                                    // "guests revealed on the day" — no count either (count leaks)
    case countOnly(Int)                            // synthetic shared-link card (§7.1): get_shared_check gives response_count, no list
}

// Tuples are neither Hashable nor Codable — every "pair" below is a named struct.
struct CoAuthorDisplay: Hashable, Sendable { let person: Presence; let status: CoAuthorStatus }
struct SquadMembership: Hashable, Codable, Sendable { let squadId: SquadID; let role: SquadRole }
struct ConfirmEntry: Hashable, Sendable { let person: Presence; let response: ConfirmResponse? }

// Stores/FeedStore.swift (display layer)
struct FeedCheck: Identifiable, Hashable, Sendable {
    let id: CheckID
    let text: String                               // stripAtMentions applied when author is masked
    let author: Presence
    let coAuthors: [CoAuthorDisplay]
    let via: String?                               // "via Sara" (FoF); "shared link" for the synthetic card; nil for direct friends / own
    let guests: GuestList
    let downCount: Int?                            // nil while guests hidden; response_count for .countOnly
    let when: WhenLine?                            // rendered "FRI MAY 1 · 7pm" from eventDateLabel/eventTime/flexible flags
    let location: String?
    let mystery: MysteryState                      // .none | .unrevealed | .revealedToday (drives ? border + scramble→settle)
    let expiry: ExpiryState                        // §10.3, recomputed on ExpiryClock tick
    let myResponse: ResponseKind?
    let mySquad: SquadMembership?
    let isMine: Bool; let isCoAuthorPending: Bool  // "You were tagged" strip
    let isHidden: Bool; let isNew: Bool
    let isSynthetic: Bool                          // true only for the shared-link card: no comments composer, no ⋯ menu, DOWN → api.respondShared (§7.1)
    let comments: [CommentDisplay]                 // sender: Presence
    let movie: MovieMetadata?; let letterboxdUrl: String?
    let createdAt: Date; let eventDate: LocalDate? // sort keys only
}
enum MysteryState: Hashable, Sendable { case none, unrevealed, revealedToday }
struct WhenLine: Hashable, Sendable { let dateLabel: String?; let time: String?; let dateFlexible: Bool; let timeFlexible: Bool }
struct CommentDisplay: Identifiable, Hashable, Sendable { let id: CommentID; let sender: Presence; let text: AttributedString; let createdAt: Date }
struct FeedEvent: Identifiable, Hashable, Sendable {   // M1 read-only card
    let id: EventID; let title: String; let venue: String?; let dateDisplay: String?; let timeDisplay: String?; let vibes: [String]
    let imageUrl: URL?; let poster: PersonRef; let downs: [PersonRef]; let myIsDown: Bool; let createdAt: Date; let date: LocalDate?
}
// `poster` is built from FriendsEventPayload.creator (display_name + avatar_letter; the payload has no username → PersonRef.username = "" for posters,
// and UserProfileSheet resolves it from `profiles` on tap). `downs` come from a separate `saved_events` select (`event_id in`, `is_down = true`)
// joined to `raw.profiles`, excluding the poster (specs/events-flow.md) — the RPC JSON carries no downs list.
enum FeedItem: Identifiable, Hashable, Sendable {
    case check(FeedCheck), event(FeedEvent)
    var id: String { switch self { case .check(let c): "c:\(c.id)"; case .event(let e): "e:\(e.id)" } }
}

// Stores/SquadsStore.swift
struct SquadRow: Identifiable, Hashable, Sendable {
    let id: SquadID; let name: String; let kind: Kind; enum Kind: Hashable, Sendable { case check(CheckID), event(EventID) }
    let members: [Presence]; let memberCount: Int; let myRole: SquadRole
    let eventDate: LocalDate?; let eventDateLabel: String?; let eventTime: String?; let dateStatus: DateStatus?
    //   check squads: from checks-by-squad (event_date / event_date_label / event_time). event squads: from events-by-squad
    //   (events.date / date_display / time_display) — same as useSquads.ts:229-245. locked_date overrides both when set.
    let expiresAt: Date?; let lastMessage: MessagePreview?; let lastActivityAt: Date?
    let hasUnread: Bool; let isMystery: Bool
}
struct MessagePreview: Hashable, Sendable { let sender: Presence?; let text: String; let createdAt: Date }   // text = "📷 photo" for images
// In a mystery-locked squad the preview is built from the last message that SURVIVES the lock filter (§9.3): system / poll /
// date_confirm rows are skipped, so a bare "X just entered the chat" never reaches SquadRow. If nothing survives, lastMessage == nil.

// Stores/ChatStore.swift
struct MemberDisplay: Identifiable, Hashable, Sendable { let id: MemberKey; let presence: Presence; let role: SquadRole; let joinedAt: Date }
/// Opaque row key. Unmasked: "u:<uuid>". Masked: "k:<hex of Censor.hashSeed("\(squadId)::\(userId)")>" — one-way, so a masked
/// MemberDisplay carries neither a name nor a recoverable id. ChatStore keeps a private `memberKeys: [MemberKey: UserID]` map for
/// markRead / kick / mention resolution; views pass the key back and never see the UserID. MysteryLeakTests can therefore reflect
/// the WHOLE MemberDisplay (§9.3). In mystery-locked chats `MentionPicker` is disabled anyway.
struct MemberKey: Hashable, Sendable, CustomStringConvertible { let description: String }
struct ChatMessageDisplay: Identifiable, Hashable, Sendable {
    let id: MessageID; let sender: Presence?; let kind: Kind; let createdAt: Date; let isMine: Bool
    enum Kind: Hashable, Sendable {
        case text(AttributedString)                                   // linkified + @mentions
        case system(String)                                           // "kat just entered the chat" — NEVER emitted while isMysteryLocked (§9.3)
        case image(path: String, width: Int, height: Int)             // signed URL resolved lazily by ImageCache
        case dateConfirm(date: LocalDate, time: String?, responses: [ConfirmEntry])
        case pollPlaceholder(question: String)                        // M1: "poll — open on web for now"
        case unknown
    }
}
```

### 3.6 RPC wrappers (`Data/RPC.swift`)

```swift
struct RPC: Sendable {
    let client: SupabaseClient
    func getCheckState(_ id: CheckID) async throws -> CheckState                     // TABLE(active, is_mine) — snake_case, JSON.decoder (§3.9)
    func archiveCheck(_ id: CheckID) async throws                                    // archive_interest_check(p_check_id)
    func reviveCheck(_ id: CheckID) async throws                                     // revive_interest_check(p_check_id)
    func fofAnnotations() async throws -> [CheckID: String]                          // get_fof_check_annotations → (check_id, via_friend_name)
    func joinSquadIfRoom(_ id: SquadID) async throws -> JoinResult                   // 'joined' | 'waitlisted'
    func leaveSquad(_ id: SquadID) async throws
    func reactivateSquad(_ id: SquadID) async throws
    func eventSquadMembers(_ id: EventID) async throws -> [EventSquadMember]         // M2
    func unreadSquadIds(userId: UserID) async throws -> Set<SquadID>                  // get_unread_squad_ids(p_user_id)
    func friendsEvents() async throws -> [FriendsEventPayload]                       // get_friends_events — jsonb array of to_jsonb(events) rows, snake_case, JSON.decoder (§3.9)
    func friendsOfFriends() async throws -> [FoFSuggestion]                          // get_friends_of_friends
    func createFriendLink() async throws -> UUID                                     // token
    func redeemFriendLink(_ token: UUID) async throws -> RedeemResult                // jsonb: {success, creator_id, creator_name} | {error, already_friends?}
    func sharedCheck(_ id: CheckID) async throws -> SharedCheck?                     // get_shared_check(p_check_id) — SECURITY DEFINER, callable by anon; nil when not shared/archived
    func sharedCheckAuthor(_ id: CheckID) async throws -> Profile?                   // get_shared_check_author — RETURNS SETOF profiles
}
```
Each body is two lines: `try await client.rpc("join_squad_if_room", params: ["p_squad_id": id.raw]).execute().value`. RPC result shapes are captured as JSON fixtures in `DowntoTests/Fixtures/rows/rpc_*.json`, **and** their Swift shapes are written out in §3.9 so a builder does not need the fixtures to start.

### 3.7 `/api/*` client (`Data/DowntoAPI.swift`)

```swift
struct DowntoAPI: Sendable {
    let base: URL; let session: URLSession; let auth: AuthClient       // supabase.auth
    enum Method: String { case POST, DELETE }

    /// Core: attaches Bearer, sends, decodes. On HTTP 401 forces `auth.refreshSession()` and retries exactly once.
    func send<Body: Encodable & Sendable, Out: Decodable & Sendable>(_ method: Method, _ path: String, _ body: Body, requiresAuth: Bool = true, as: Out.Type = Out.self) async throws -> Out
    func send<Body: Encodable & Sendable>(_ method: Method, _ path: String, _ body: Body, requiresAuth: Bool = true) async throws   // Out == Empty

    // Typed surface (one per route in INVENTORY §3)
    func pushSubscribe(deviceToken: String) async throws                          // POST push/subscribe {platform:"ios", deviceToken}
    func pushUnsubscribe(deviceToken: String) async throws                        // DELETE push/subscribe {deviceToken}
    func deleteAccount() async throws                                             // POST account/delete
    func respondShared(checkId: CheckID) async throws                             // POST checks/respond-shared {checkId, response:"down"}
    func scrape(url: URL) async throws -> ScrapeResult                            // M2, requiresAuth: false
    func searchLetterboxd(query: String) async throws -> [MovieHit]               // M2, requiresAuth: false
    func setDate(squadId: SquadID, date: LocalDate, time: String?, locked: Bool) async throws   // POST squads/set-date
    func clearDate(squadId: SquadID) async throws                                 // POST squads/set-date {squadId, clear:true}
    func confirmDate(squadId: SquadID, response: ConfirmResponse) async throws    // POST squads/confirm-date
    func createPoll(_ req: CreatePollRequest) async throws -> PollID              // M2
    func votePoll(pollId: PollID, optionIndexes: [Int]) async throws              // M2
    func closePoll(_ id: PollID) async throws; func reopenPoll(_ id: PollID) async throws; func clearMyVotes(_ id: PollID) async throws   // M2
    func proposeFromPoll(pollId: PollID, date: LocalDate, time: String?) async throws   // M2
    func extendSquad(_ id: SquadID, days: Int = 7) async throws                   // POST squads/extend
    func updateSize(checkId: CheckID, maxSquadSize: Int?) async throws            // POST squads/update-size
    func setMemberRole(squadId: SquadID, userId: UserID, role: SquadRole) async throws   // M2
    func kickMember(squadId: SquadID, userId: UserID) async throws                // M2
    func addMember(squadId: SquadID, userId: UserID) async throws                 // M2
    func version() async throws -> String                                         // GET version (About screen, optional)
}
```

Request details: `Content-Type: application/json`; body/response use the `JSON` coder pair; timeout 15 s; `URLSession` with `waitsForConnectivity = false` (fail fast, we toast). A non-2xx response is decoded as `{ "error": String }` → `AppError.api(status:message:)`. `vote-availability` / `clear-availability` are not wrapped.

### 3.8 Error typing (`Data/AppError.swift`)

```swift
enum AppError: Error, Sendable, Equatable {
    case network                                     // URLError (offline, timeout)
    case unauthenticated                             // no session / refresh failed
    case postgrest(code: String, message: String)    // raw PG/PostgREST code
    case rlsDenied                                   // 42501 — see MEMORY: web shows this as empty `Error: {}`
    case usernameTaken                               // 23505 on profiles.username
    case usernameCooldown(until: Date?)              // P0001 with message == "USERNAME_COOLDOWN" — the trigger sends NO date (20260313000002); see note below
    case checkGone(isMine: Bool)                     // get_check_state.active == false, or RLS returned no row
    case squadFull                                   // enforce_squad_max_size: ERRCODE check_violation (23514) with message hasPrefix "Squad is full" (20260226000005:50)
    case api(status: Int, message: String)           // /api/* non-2xx
    case decoding(String)
    case cancelled
    case unknown(String)

    init(_ error: any Error)                         // normalises PostgrestError / AuthError / URLError / DecodingError / CancellationError
    var toastCopy: String {
        switch self {
        case .network: "no signal ✶"
        case .unauthenticated: "you got logged out — sign in again"
        case .rlsDenied: "not allowed (yet)"
        case .usernameTaken: "that one's taken"
        case .usernameCooldown(let d): d.map { "you can change it again \($0.formatted(.relative(presentation: .named)))" } ?? "you changed your username too recently"
        case .checkGone: "press f — that check is gone"
        case .squadFull: "squad's full — you're on the waitlist"
        case .api(_, let m), .postgrest(_, let m), .unknown(let m): m.isEmpty ? "something broke, try again" : m
        case .decoding: "something broke, try again"
        case .cancelled: ""
        }
    }
}
```

Stores catch `any Error`, wrap in `AppError(_:)`, keep it in `store.lastError` for inline UI, and call `toasts.show(error.toastCopy)` unless the copy is empty. `AppErrorTests` asserts the mapping for `23505`, `42501`, `URLError.notConnectedInternet`, a 401 `api`, `P0001`/`USERNAME_COOLDOWN`, and `23514`/`Squad is full (4/4)`.

**Trigger-raised errors carry no structured data — match on the message, compute the rest locally.**
- `enforce_username_cooldown` does `RAISE EXCEPTION 'USERNAME_COOLDOWN' USING ERRCODE = 'P0001'`. `AppError.init` maps `PostgrestError.code == "P0001" && message == "USERNAME_COOLDOWN"` → `.usernameCooldown(until: nil)`; `ProfileStore.update` then fills `until = me.usernameChangedAt.map { $0 + cooldownInterval }` before toasting. **Note the interval mismatch**: the trigger as written enforces `interval '24 hours'` even though the web UI copy says "14-day cooldown"; `ProfileStore.cooldownInterval` is a single constant (24 h today) with a comment pointing at the migration, and `EditProfileSheet` copy says "you can change it again {relative}" rather than hard-coding "14 days". Fixing the trigger to 14 d is a web-repo issue, not something native re-implements.
- `enforce_squad_max_size` raises `'Squad is full (%/%)'` with `ERRCODE = 'check_violation'` (SQLSTATE `23514`). Map `code == "23514" && message.hasPrefix("Squad is full")` → `.squadFull`. Any other `23514` stays `.postgrest`.

### 3.9 Payload and shape types (`Data/Payloads.swift`, plus the store-private raw structs)

Every type this document references but no table defines, in one place. All `nonisolated struct … : Hashable, Sendable` (`Codable` where noted). Column lists were read from the migrations on 2026-09-23.

**RPC results** (decoded with `JSON.decoder`, snake_case, unless noted):

```swift
/// get_shared_check(p_check_id) → RETURNS TABLE (20260319000004). Array of 0 or 1 rows.
struct SharedCheck: Codable, Identifiable, Hashable, Sendable {
    let id: CheckID; let text: String; let authorId: UserID; let authorName: String; let authorAvatar: String   // author_avatar CHAR(1)
    let eventDate: LocalDate?; let eventTime: String?; let location: String?; let expiresAt: Date?; let createdAt: Date
    let responseCount: Int                                                                                    // BIGINT
    // NOT returned by the RPC (the web adds these client-side from RLS-visible tables): myResponse, squadId, squadMemberCount, inSquad.
    // Natively FeedStore derives them from raw.responses / raw.mySquadMemberships when present; absent → nil / 0 / false.
    // `mystery` is NOT returned either. §7.3 lists adding `mystery BOOLEAN` to the RPC as a web-repo deliverable; until it lands,
    // `let mystery: Bool?` decodes as nil and the pre-login banner treats nil as "unknown → mask".
    let mystery: Bool?
}
/// get_check_state(p_check_id) → TABLE(active BOOLEAN, is_mine BOOLEAN) (20260425000003). snake_case (INVENTORY's `{active, isMine}` is the web wrapper's camelised copy).
struct CheckState: Codable, Hashable, Sendable { let active: Bool; let isMine: Bool }
/// join_squad_if_room → TEXT 'joined' | 'waitlisted'
enum JoinResult: String, TolerantEnum { case joined, waitlisted, unknown }
/// redeem_friend_link(p_token) → JSONB: {"success":true,"creator_id":uuid,"creator_name":text} | {"error":text,"already_friends"?:true}
struct RedeemResult: Codable, Hashable, Sendable {
    let success: Bool?; let creatorId: UserID?; let creatorName: String?; let error: String?; let alreadyFriends: Bool?
    var outcome: Outcome { … }                                   // .friends(PersonRef-ish name), .alreadyFriends, .invalid(reason)
    enum Outcome: Hashable, Sendable { case friends(id: UserID, name: String), alreadyFriends, invalid(String) }
}
/// get_friends_of_friends() → TABLE(suggested_user_id, mutual_friend_id, mutual_friend_name) (20260325000005). Profiles fetched separately by id.
struct FoFSuggestion: Codable, Hashable, Sendable { let suggestedUserId: UserID; let mutualFriendId: UserID; let mutualFriendName: String }
/// get_fof_check_annotations() → TABLE(check_id, via_friend_name)
struct FoFAnnotation: Codable, Hashable, Sendable { let checkId: CheckID; let viaFriendName: String }
/// get_event_squad_members(p_event_id) — M2; shape captured to fixture when built.
struct EventSquadMember: Codable, Hashable, Sendable { let squadId: SquadID; let userId: UserID; let role: SquadRole }
/// get_friends_events() → jsonb ARRAY of `to_jsonb(events) || {creator: {display_name, avatar_letter}}` (20260419000001).
/// Keys are the events columns in snake_case (to_jsonb of the row) — decode with JSON.decoder, NOT camelDecoder. The only nested key is `creator`.
struct FriendsEventPayload: Codable, Identifiable, Hashable, Sendable {
    let id: EventID; let title: String; let venue: String?; let neighborhood: String?
    let date: LocalDate?; let dateDisplay: String?; let timeDisplay: String?; let vibes: [String]?; let note: String?
    let imageUrl: String?; let igHandle: String?; let igUrl: String?; let diceUrl: String?; let letterboxdUrl: String?; let raUrl: String?
    let movieMetadata: MovieMetadata?; let isPublic: Bool; let visibility: EventVisibility; let createdBy: UserID; let createdAt: Date
    let creator: Creator; struct Creator: Codable, Hashable, Sendable { let displayName: String?; let avatarLetter: String? }
}
```
`JSON.camelDecoder` is therefore only needed if a future RPC emits camelCase; today none does — keep it but don't use it for the two RPCs INVENTORY mislabels.

**API results / requests** (`DowntoAPI`, camelCase JSON as the Next routes emit/accept):

```swift
struct ScrapeResult: Codable, Hashable, Sendable { let title: String?; let venue: String?; let date: String?; let time: String?; let vibes: [String]?; let note: String?; let imageUrl: String?; let sourceUrl: String? }   // M2; captured from /api/scrape
struct MovieHit: Codable, Hashable, Sendable { let title: String; let year: String?; let director: String?; let thumbnail: String?; let letterboxdUrl: String? }   // M2
struct CreatePollRequest: Encodable, Sendable { let squadId: SquadID; let pollType: PollType; let question: String; let options: [PollOption]; let multiSelect: Bool; let slots: [String]?; let collectionStyle: CollectionStyle? }   // M2
```

**Store inputs** (built by views, consumed by stores):

```swift
struct CheckDraft: Hashable, Sendable { var text: String; var when: DateParse.ParsedWhen; var eventDateLabel: String?; var location: String?; var timerHours: Int?; var maxSquadSize: Int?; var mystery: Bool; var coAuthorIds: [UserID] }
struct CheckPatch: Hashable, Sendable { var text: String?; var eventDate: LocalDate??; var eventDateLabel: String??; var eventTime: String??; var location: String??; var dateFlexible: Bool?; var timeFlexible: Bool?; var coAuthorIds: [UserID]? }   // double-optional = "set to null"
struct ProfilePatch: Hashable, Sendable { var displayName: String?; var username: String?; var igHandle: String??; var availability: Availability??; var onboarded: Bool? }
struct CreatePrefill: Hashable, Sendable { var text: String?; var when: String?; var location: String? }                      // FirstCheck → CreateOverlay hand-off (router.createPrefill)
struct FriendRequest: Identifiable, Hashable, Sendable { let id: FriendshipID; let person: PersonRef; let createdAt: Date }   // incoming (requester) / outgoing (addressee)
struct DateConfirmPrompt: Hashable, Sendable { let messageId: MessageID; let date: LocalDate; let time: String?; let answered: ConfirmResponse? }
struct PendingSend: Hashable, Sendable { let clientId: MessageID; let text: String?; let imageData: Data?; let startedAt: Date; var failed: Bool }
enum ToastAction: Hashable, Sendable { case openSquad(SquadID), undoArchive(CheckID), openCheck(CheckID), retry }
```

**Raw stores** (`Codable` because `LocalCache` snapshots them; all dictionary keys are `ID<Tag>`, which conforms to **`CodingKeyRepresentable`** (§3.3) so `JSONEncoder` produces objects, not pair arrays — a plain `Codable` key would NOT be enough, `[ID: V]` encodes as `[k, v, k, v]` without that conformance; `IDTests.idsAreDictionaryKeysThatEncodeAsObjects` pins it and `ModelDecodingTests` round-trips each raw store):

```swift
struct FeedRaw: Codable, Sendable, Equatable {                    // full listing in §4.2
    var checks: [CheckID: InterestCheck]; var responses: [ResponseRowID: CheckResponse]; var coAuthors: [CoAuthorRowID: CheckCoAuthor]
    var comments: [CheckID: [CheckComment]]; var hidden: [HiddenRowID: HiddenCheck]; var left: [LeftRowID: LeftCheck]
    var profiles: [UserID: Profile]; var fofAnnotations: [CheckID: String]; var mySquadMemberships: [CheckID: SquadMembership]
    var events: [EventID: FriendsEventPayload]; var eventDowns: [EventID: [UserID]]; var myEventDowns: Set<EventID>
    var sharedCheck: SharedCheck?                                  // §7.1 synthetic card source; persisted with the snapshot
}
struct SquadsRaw: Codable, Sendable, Equatable {
    var squads: [SquadID: Squad]; var members: [SquadID: [SquadMember]]; var profiles: [UserID: Profile]
    var checks: [SquadID: InterestCheck]                          // checks-by-squad: name/date/time/mystery/max_squad_size/author
    var events: [SquadID: SquadEventLite]                         // events-by-squad: `events` select `id,title,date,date_display,time_display,venue` where id in (event_id)
    var readCursors: [SquadID: Date]; var lastMessages: [SquadID: Message]
}
struct SquadEventLite: Codable, Hashable, Sendable { let id: EventID; let title: String; let date: LocalDate?; let dateDisplay: String?; let timeDisplay: String?; let venue: String? }
struct ChatRaw: Codable, Sendable, Equatable {
    var squad: Squad?; var check: InterestCheck?; var event: SquadEventLite?; var members: [SquadMember]; var profiles: [UserID: Profile]
    var messages: [MessageID: Message]; var polls: [PollID: SquadPoll]; var votes: [PollID: [SquadPollVote]]
    var confirms: [ConfirmRowID: SquadDateConfirm]                // row-keyed so a `{id}`-only realtime DELETE can be applied (§3.4, §5.2)
    var joinRequests: [SquadJoinRequest]; var oldestLoadedAt: Date?
}
struct FriendsRaw: Codable, Sendable, Equatable {
    var friendships: [FriendshipID: Friendship]; var profiles: [UserID: Profile]; var suggestions: [FoFSuggestion]; var blocked: [BlockedUser]
}
```

---

## 4. State

### 4.1 Concurrency model

- `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. Every store, view and the router is implicitly `@MainActor`. Stores are `@Observable final class`. UI code never writes `nonisolated`.
- Network calls are `async`; stores `await` them on the main actor without blocking (I/O runs inside URLSession/supabase-swift).
- Explicit actors, all in `Data/`: `LocalCache` (JSON snapshot writes), `ImageCache` (disk I/O + signed-URL memo), `ImageResizer` (`nonisolated static func resize(_ data: Data, maxEdge: 1600, quality: 0.85) -> (Data, Int, Int)` run via `Task.detached(priority: .userInitiated)` — `quality` 0.85 and `maxEdge` 1600 match `src/lib/imageResize.ts:4`; keep them equal so a photo sent from iOS and web weighs the same).
- Model types are `nonisolated` `Sendable` value types (§1.0) — so are their `Codable` conformances, which is what lets `LocalCache`, `ImageResizer`, `JSON.decoder` and supabase-swift's internal decoding use them off the main actor. `TableChange<T>` crosses the realtime stream → main actor boundary for free.
- `Domain/` types and functions are `nonisolated` (pure, so tests can run them from any context). Inside `nonisolated` code, never touch a store or a view.
- Closures handed to Foundation/UIKit APIs that are `@Sendable` (`NotificationCenter.addObserver(forName:object:queue:)`, `Timer`, `DispatchQueue`) may not call main-actor methods on `self`. We don't use those APIs: every observation is an `AsyncSequence` iterated inside a store-owned `Task` (§4.8), which stays on the main actor.

### 4.2 Store shape — FeedStore in full

```swift
struct FeedRaw: Codable, Sendable, Equatable {
    var checks: [CheckID: InterestCheck] = [:]
    // Row-keyed, not check-keyed: realtime DELETEs on these tables deliver ONLY {id} (surrogate PK, no replica identity full — §3.3, §5.2).
    var responses: [ResponseRowID: CheckResponse] = [:]
    var coAuthors: [CoAuthorRowID: CheckCoAuthor] = [:]
    var hidden: [HiddenRowID: HiddenCheck] = [:]
    var left: [LeftRowID: LeftCheck] = [:]
    var comments: [CheckID: [CheckComment]] = [:]            // sorted asc; check_comments has its own `id` PK and no DELETE path in the UI
    var profiles: [UserID: Profile] = [:]
    var fofAnnotations: [CheckID: String] = [:]
    var mySquadMemberships: [CheckID: SquadMembership] = [:] // from squads join, refreshed by SquadsStore
    var events: [EventID: FriendsEventPayload] = [:]         // read-only in M1
    var eventDowns: [EventID: [UserID]] = [:]                // saved_events where is_down, for the "X is down" row
    var myEventDowns: Set<EventID> = []
    var sharedCheck: SharedCheck?                            // §7.1: the synthetic shared-link card; nil once the real row is visible

    // Derived indexes (computed, not stored; rebuilt lazily inside project()):
    //   responsesByCheck: [CheckID: [CheckResponse]]  sorted createdAt asc (waitlist order)
    //   coAuthorsByCheck: [CheckID: [CheckCoAuthor]]
    //   hiddenCheckIds: Set<CheckID>, leftCheckIds: Set<CheckID>
    // What rebuild() does with `left` (web: useChecks.ts hydrateLeftChecks + page.tsx "Profile-only state"): NOTHING for the feed —
    //   a left check is neither excluded nor pinned; it is simply a check I have no response row on. `leftCheckIds` feeds ONLY
    //   `FeedStore.leftChecks: [FeedCheck]` (raw.left ∩ raw.checks, dropping expired / past-dated, same filter as the web), which
    //   ProfileView renders as "checks you left" with a DOWN button. DOWN on one of those = normal toggleDown; the leave_squad RPC is
    //   the only writer of left_checks and the client only ever DELETEs its own row (RLS) — done inside toggleDown's insert path
    //   when `raw.left` has a row for that check, before the response insert, so the section empties itself.
    // Helpers used by optimistic paths (§4.5):
    //   func myResponseRow(checkId:, me:) -> CheckResponse?   // O(n) over responses is fine at friend scale (< 2k rows); memoised per rebuild
}

@Observable final class FeedStore {
    // rendered state
    private(set) var items: [FeedItem] = []                  // pinned-timed first, then chrono tier (§4.3)
    private(set) var hidden: [FeedCheck] = []
    private(set) var leftChecks: [FeedCheck] = []            // ProfileView "checks you left" section (see FeedRaw comment)
    var sort: FeedSort = .recent { didSet { defaults.set(sort); rebuild() } }
    private(set) var phase: LoadPhase = .idle                // .idle, .loading, .loaded(at: Date, stale: Bool), .failed(AppError, hadSnapshot: Bool) — UI treatment in §4.9
    private(set) var lastError: AppError?
    var hasChecks: Bool { raw.checks.contains { !$0.value.isArchived } || raw.sharedCheck != nil }   // GateInput.feedHasChecks (§6.1)
    private(set) var revealedNow: Set<CheckID> = []          // §4.8; consumed by CheckEntry / CheckDetailView for the DESIGN §5.7 reveal
    private(set) var squadOutcome: [CheckID: SquadOutcome] = [:]   // §4.5: .formed → SQUAD FORMED, .joined → "you're in" strip (DESIGN §5.6); cleared by the entry after the strip folds
    enum SquadOutcome: Hashable, Sendable { case formed, joined }
    private(set) var heldInserts: [FeedItem] = []            // §4.7: realtime inserts held behind the "N new ↑" pill while the reader is scrolled deep (DESIGN §5.1)
    var lastSeenFeedAt: Date                                 // UserDefaults "dt.lastSeenFeedAt"; drives NEW; bumped on tab leave
    private(set) var now: Date = .now                        // ExpiryClock tick, drives expiry + mystery projection
    // raw
    private(set) var raw = FeedRaw()
    private var inflight: [CheckID: Task<Void, Never>] = [:] // one mutation per check at a time
    private var hydrateGeneration = 0                        // §4.7.1: bumped per select; a TableChange applied during a select is re-applied after the merge
    private let buffer = ChangeBuffer<FeedRaw>()              // §4.7.1

    init(env: AppEnvironment)
    func hydrate() async                                     // full load: TaskGroup of parallel selects, then rowMerge + replay buffer + rebuild() (§4.7.1)
    func refresh() async                                     // pull-to-refresh / foreground / reconnect; same as hydrate but keeps items until new raw arrives; NEVER assigns raw wholesale (§4.7.1)
    func refreshCheck(_ id: CheckID) async                   // single check + its 4 sub-tables + missing profiles → merge → rebuild
    func ensureLoaded(_ id: CheckID) async -> Bool           // deep link: in raw? else refreshCheck; false if RLS returns nothing
    func resolveCheckRoute(_ id: CheckID) async -> CheckRouteOutcome   // §7.4: the ONE resolution step shared by deep links, notification taps and push taps
    func setMySquadMemberships(_ m: [CheckID: SquadMembership])        // the only external write into raw: called by SquadsStore.rebuild() (§4.10)
    func injectSharedCheck(_ id: CheckID) async -> Bool      // §7.1: rpc.sharedCheck → raw.sharedCheck; persists dt.activeSharedCheckId; false if RPC returns no row
    func toggleDown(_ id: CheckID) async                     // optimistic; §4.5. On the synthetic card → api.respondShared then refreshCheck/injectSharedCheck
    func hide(_ id: CheckID) async; func unhide(_ id: CheckID) async
    func archive(_ id: CheckID) async -> Bool; func revive(_ id: CheckID) async
    func acceptTag(_ id: CheckID) async; func declineTag(_ id: CheckID) async
    func createCheck(_ draft: CheckDraft) async throws -> CheckID
    func updateCheck(_ id: CheckID, _ patch: CheckPatch) async throws
    func markShared(_ id: CheckID) async
    func addComment(checkId: CheckID, text: String, mentions: [UserID]) async throws
    func setEventDown(_ id: EventID, down: Bool) async        // M1 read-only events: only mutation allowed
    // realtime
    func apply(_ change: TableChange<InterestCheck>) async
    func apply(_ change: TableChange<CheckResponse>) async   // .delete(keys) → raw.responses.removeValue(forKey: ResponseRowID(keys["id"])); if it was MY row → squads.refreshMembership(checkId:)
    func apply(_ change: TableChange<CheckCoAuthor>) async   // .delete(keys) → raw.coAuthors.removeValue(forKey: CoAuthorRowID(keys["id"]))
    func apply(_ change: TableChange<CheckComment>)          // checkId == nil && eventId != nil → EVENT comment (20260417000001): M1 ignores it (EventEntry has no comments, §15.1); never indexes by CheckID
                                                             // any of the three sub-table changes whose checkId ∉ raw.checks (check newly visible via FoF / co-author) → refreshCheck(checkId) instead of apply
    func isGuestsHidden(_ id: CheckID) -> Bool               // used by NotificationsStore row rendering
    // pure projection
    func rebuild()                                           // raw + me + now + sort + lastSeenFeedAt → items/hidden
}
```

`rebuild()` is `nonisolated static func project(raw: FeedRaw, me: UserID, now: Date, calendar: Calendar, sort: FeedSort, lastSeen: Date) -> (items: [FeedItem], hidden: [FeedCheck])` under the hood so `FeedRebuildTests` can call it with plain values. Budget: < 1 ms for 200 checks (assert in a test with `ContinuousClock`).

Same skeleton for the others:

```swift
@Observable final class SquadsStore {
    private(set) var rows: [SquadRow] = []                    // all active, non-archived, where I'm a member/waitlist
    private(set) var sections: (newMessages: [SquadRow], upcoming: [SquadRow], fading: [SquadRow])
    private(set) var unread: Set<SquadID> = []
    private(set) var readCursors: [SquadID: Date] = [:]
    private(set) var lastMessages: [SquadID: Message] = [:]
    var openSquadId: SquadID?                                 // set by Router from the NavigationStack path
    private var raw: SquadsRaw                                // squads, members, profiles, checks-by-squad, EVENTS-BY-SQUAD, readCursors, lastMessages (§3.9)
    func hydrate() async; func refresh() async                // hydrate selects: squads (via squad_members where user_id = me, archived_at is null), squad_members (in squad_id),
                                                              //   profiles (in id), interest_checks (in check_id), events `id,title,date,date_display,time_display,venue` (in event_id),
                                                              //   squad_read_cursors (user_id = me), last message per squad (messages order created_at desc limit 1 per squad — one
                                                              //   `in squad_id` select ordered desc, first-per-squad in memory), get_unread_squad_ids
    func refreshSquad(_ id: SquadID) async                    // single squad + members + its check OR event row + last message
    func refreshMembership(checkId: CheckID) async            // after my response row changed (insert/update/delete — incl. waitlist promotion, §5.6). Also after feed.acceptTag (auto_down_on_coauthor_accept inserts my response + joins the squad) — §4.10
    func markUnread(_ id: SquadID); func markRead(_ id: SquadID) async     // upsert squad_read_cursors, set cursor = now locally first
    func apply(_ change: TableChange<Message>)                // last-message preview + unread rule, every subscribed squad; forwards to `openChat?.apply` (§4.10)
    func leave(_ id: SquadID) async; func extend(_ id: SquadID) async
    weak var openChat: ChatStore?                             // set/cleared by SquadChatView.task(id:) — the hub's squad(id) handler reaches the open chat through this (§4.10)
    func rebuild()                                            // SquadCountdown + unread rule → sections; THEN feed.setMySquadMemberships(…) and realtime.setSquadList(rows.map(\.id)) (§4.10)
}

@Observable final class ChatStore {                            // one per open chat; created by SquadChatView.task(id:)
    let squadId: SquadID
    private(set) var squad: Squad?; private(set) var members: [MemberDisplay] = []
    private(set) var messages: [ChatMessageDisplay] = []       // ascending; last 200 hydrated, older paged on scroll-to-top (limit 100)
    private(set) var polls: [PollID: SquadPoll] = [:]; private(set) var votes: [PollID: [SquadPollVote]] = [:]
    private(set) var confirms: [SquadDateConfirm] = []         // projected from raw.confirms.values sorted by createdAt; raw is keyed by ConfirmRowID (§3.9)
    private(set) var joinRequests: [SquadJoinRequest] = []
    private(set) var scroll = ChatScrollState()                // §7.6: isAtBottom, pendingPrependAnchor, unseenCount — owned here so realtime inserts can consult it
    private(set) var myRole: SquadRole?; private(set) var pendingConfirm: DateConfirmPrompt?; private(set) var isMysteryLocked = false
    var draft: String { didSet { defaults["dt.draft.\(squadId)"] = draft } }  // persisted per squad
    private(set) var sending: [MessageID: PendingSend] = [:]   // client-generated ids for optimistic rows (0.6 opacity until acked, DESIGN §4.10)
    private var raw: ChatRaw                                   // rows + profiles (§3.9)
    private var memberKeys: [MemberKey: UserID] = [:]          // §3.5: opaque MemberDisplay.id → real id; never exposed
    func userId(for key: MemberKey) -> UserID?                 // used by kick/setRole/mention insertion only when !isMysteryLocked
    func hydrate() async                                       // subscribes dateConfirms + registers as squads.openChat BEFORE the selects (§4.7.1)
    func send(text: String, mentions: [UserID]) async          // optimistic insert with client UUID; echo dedupes by id
    func sendImage(_ data: Data) async                         // resize → storage upload {squadId}/{uuid}.jpg → insert message
    func markRead() async                                      // squads.markRead + PushStore.clearDelivered(squadId)
    func confirmDate(_ r: ConfirmResponse) async
    func respondJoinRequest(_ id: UUID, accept: Bool) async    // update squad_join_requests.status; trigger auto_join_on_request_accept
    func leave() async
    func apply(_ change: TableChange<Message>) async; func apply(_ change: TableChange<SquadPollVote>)
    func apply(_ change: TableChange<SquadDateConfirm>)        // .insert/.update → raw.confirms[row.id] = row; .delete(keys) → raw.confirms.removeValue(forKey: ConfirmRowID(keys["id"])) (set-date clear / re-propose delete these rows); then rebuild → pendingConfirm recomputed
    func loadOlder() async -> Int                              // returns rows prepended so ChatScrollController can anchor (§7.6); no-op while a page is in flight
    func reloadSideTables() async                              // polls, votes, confirms, joinRequests, members (after system / non-text message)
    func rebuild()                                             // raw → members/messages via Presence (§9)
}

@Observable final class NotificationsStore {
    private(set) var items: [AppNotification] = []            // newest first, limit 50
    private(set) var unreadCount: Int = 0
    private(set) var pendingFriendRequests: [AppNotification]  // type == .friendRequest && !isRead; pinned at top
    func hydrate() async; func refresh() async
    func prepend(_ n: AppNotification) async                  // realtime; runs NotificationSideEffects
    func markAllReadExceptFriendRequests() async               // on sheet open
    func markRead(_ id: NotificationID) async
    func tap(_ n: AppNotification) async                       // check rows: router.go(.check(id)) → feed.resolveCheckRoute (§7.4); gone → feedPath = [.deletedCheck]. Same resolver as push taps + deep links.
    func rowBody(for n: AppNotification) -> String             // "someone's down ✶" when feed.isGuestsHidden(relatedCheckId)
}

@Observable final class FriendsStore {
    private(set) var friends: [PersonRef] = [], incoming: [FriendRequest] = [], outgoing: [FriendRequest] = []
    private(set) var suggestions: [FoFSuggestion] = [], blocked: [PersonRef] = []
    private(set) var friendIds: Set<UserID>                    // used by FeedStore for isMine/via computation? no — FoF comes from the RPC; this is for FriendGate + mention picker
    func hydrate() async
    func search(_ q: String) async -> [PersonRef]              // ilike on username/display_name, excludes blocked, limit 20
    func request(_ id: UserID) async; func accept(_ f: FriendshipID) async; func remove(_ f: FriendshipID) async; func cancel(_ f: FriendshipID) async
    func block(_ id: UserID) async                             // insert blocked_users + delete friendship, then `.feedRefreshDebounced` + squads.refresh() — RLS (is_blocked) now hides their checks/responses/messages, and only a refetch drops the cards
    func unblock(_ id: UserID) async                           // same refresh afterwards (their content becomes visible again)
    func createInviteLink() async -> URL?                      // webBase/friend?token=
    func redeem(token: UUID) async -> PersonRef?
    func profile(username: String) async -> Profile?
    func report(_ r: ReportedContent) async
    func apply(_ change: TableChange<Friendship>) async         // replica identity full: deletes carry old row
}

@Observable final class ProfileStore {
    private(set) var me: Profile?
    private(set) var archived: [InterestCheck] = []
    func loadMe() async -> Profile?                             // nil → abandoned-onboarding sweep case (§6)
    func saveSetup(displayName: String, username: String, igHandle: String?) async throws   // 23505 → usernameTaken
    func update(_ patch: ProfilePatch) async throws
    func syncTimezoneIfNeeded() async                            // TimeZone.current.identifier != me.timezone
    func setOnboarded() async
    func loadArchived() async; func restore(_ id: CheckID) async
    func resetOnboarding() async                                 // is_test only: onboarded=false, displayName=""
}
```

### 4.3 Feed ordering (`Domain/FeedOrdering.swift`, pure)

Port of `FeedView.tsx`:
1. **Pinned tier**: checks with `expiresAt != nil` and not expired, sorted by `expiry.percent` descending (most urgent first).
2. **Chrono tier**: open-ended checks + all events.
   - `.recent`: `createdAt` descending.
   - `.upcoming`: items with a date first, ascending by `LocalDate`; then dateless by `createdAt` descending.
3. Hidden checks (`raw.hidden` contains id) are excluded from both tiers and listed in `hidden` (same sort as chrono `.recent`).
4. `isNew = createdAt > lastSeenFeedAt && !isMine`.
5. Expired timed checks are removed (RLS should already exclude them; the client applies **no** date filters but does drop `expiry == .expired` so a card can't linger between cron runs).

### 4.4 AppEnvironment and hydration

```swift
@Observable final class AppEnvironment {
    let config: AppConfig; let supabase: SupabaseClient; let api: DowntoAPI; let rpc: RPC
    let session: SessionStore; let profile: ProfileStore; let feed: FeedStore; let squads: SquadsStore
    let notifications: NotificationsStore; let friends: FriendsStore; let push: PushStore
    let realtime: RealtimeHub; let router: Router; let toasts: ToastCenter; let cache: LocalCache; let images: ImageCache
    private(set) var lastHydratedAt: Date?

    init(config: AppConfig)                                   // live
    static func fake(_ world: Fixtures.World) -> AppEnvironment   // §11.3; stores pre-filled, realtime .offline, api → stub URLProtocol

    /// Step A of the boot sequence (§4.4.1). Runs the moment SessionStore reports .signedIn — BEFORE the gate can resolve.
    func loadMeForGate(userId: UserID) async                   // profile.loadMe() alone; sets GateInput.meLoaded. Nothing else touches the network yet.

    /// Step C. Called by RootView exactly once per session, only after the gate has passed .profileSetup and runPreGate() finished (§7.1).
    func bootAfterLogin(userId: UserID) async {
        await cache.loadSnapshots(into: self, userId: userId)          // instant paint, tagged stale
        await realtime.startUserChannels(userId: userId, env: self)    // SUBSCRIBE FIRST and await `.subscribed` on every channel (§4.7.1);
                                                                       // changes that stream in before the selects land go into each store's ChangeBuffer
        await withTaskGroup { g in                                     // == web's single Promise.all (profile.loadMe already ran in step A; re-run here only to pick up timezone/onboarded drift)
            g.addTask { await self.profile.loadMe() }
            g.addTask { await self.feed.hydrate() }
            g.addTask { await self.squads.hydrate() }
            g.addTask { await self.notifications.hydrate() }
            g.addTask { await self.friends.hydrate() }
        }
        lastHydratedAt = .now
        await push.syncIfNeeded()
        await profile.syncTimezoneIfNeeded()
    }
    func refreshAll() async                                    // feed.refresh + squads.refresh + notifications.refresh + friends.hydrate, TaskGroup; all row-merge, all buffer-aware (§4.7.1)
    func teardownOnLogout()                                    // every store → reset(); cache.wipe(); defaults dt.* except dt.feedSort cleared
}
```

#### 4.4.1 Boot sequence — one ordered list per user class

The three sequences below are the **only** legal orderings; `RootView` drives them and `BootSequenceTests` (Stores/, §11.1) asserts each with an ordered stub log. Names refer to §6.1 `resolveGate`, §7.1 `runPreGate`, §7.4 `drainPendingIntents`.

| Step | Returning user (onboarded), with or without a pending link | New user, no link | New user arriving via `/check/{id}` and/or `/friend?token=` |
|---|---|---|---|
| A | `session.start()` → `.signedIn(me)` → `env.loadMeForGate()` → `meLoaded = true`, `me.onboarded == true` | same → `me.displayName.isEmpty` → gate `.profileSetup` | same → gate `.profileSetup` (`hasSharedCheck == true` because `dt.pendingCheckId` is set) |
| B | **skipped** — `runPreGate()` early-returns when `me.onboarded` and flips `preGateDone = true` without redeeming or responding to anything (§7.1) | `ProfileSetupView` save → `me.displayName` non-empty → `runPreGate()` runs but has nothing pending → `preGateDone = true`; gate → `.enableNotifications` | `ProfileSetupView` save → `runPreGate()`: (1) redeem token, (2) respond-shared **because `!me.onboarded`**, then `preGateDone = true`; gate skips `.enableNotifications` (`hasSharedCheck`) |
| C | `bootAfterLogin()` (subscribe → hydrate) | after `.enableNotifications`: `bootAfterLogin()`; gate holds `.booting` until `feedLoaded` (§6.1) | `bootAfterLogin()`; the synthetic card is injected from `dt.activeSharedCheckId` during hydrate (§7.1 step 3) |
| D | gate → `.main` immediately (`feed.phase` may still be `.loading`; snapshot paints) | `.friendGate` → Continue → `setOnboarded()` → `.firstCheck` or `.main` | `.friendGate` with the pinned author → Continue → `.main` (never `.firstCheck`) |
| E | once `Gate == .main` **and** `feed.phase ∈ {.loaded, .failed}`: `router.drainPending()` (push/URL routes) **then** `router.drainPendingIntents(env:)` (§7.4) — for a returning user with `dt.pendingCheckId` this is the onboarded deep-link path: inject/glow, **no auto-DOWN** | same call; nothing pending | same call; `dt.pendingCheckId` is already nil (consumed in B) and `dt.pendingFriendToken` is already nil, so it is a no-op |

Invariants: `bootAfterLogin` never runs before `runPreGate` has returned (the `respond-shared` row must exist before the hydrate so `myResponse` and `mySquad` are present on the first paint); `runPreGate` never runs before `meLoaded` (it needs `me.onboarded`); `drainPendingIntents` never runs before `.main` (a not-yet-onboarded user must not have a UserProfile sheet thrown over the friend gate). A user who kills the app between B and C relaunches as "returning" if `setOnboarded()` already ran, otherwise re-enters the new-user column at the same gate step with `dt.pending*` already consumed — hence the `dt.activeSharedCheckId` / `referred_by_check_id` recovery in §7.1.

Feed hydrate selects (all in one `TaskGroup`, RLS filters liveness): `interest_checks` (`select *`, order `created_at desc`), `check_responses` (`in check_id`, **`select *` so `id` comes back**), `check_co_authors` (same), `check_comments` (`check_id in`, order asc), `hidden_checks` (`user_id eq me`), `left_checks`, `profiles` for every referenced id (`in id`, chunked by 100), `get_fof_check_annotations`, `squads` + `squad_members` where I'm a member (for `mySquadMemberships`), `get_friends_events`, `saved_events` (`event_id in`, `is_down eq true` → `eventDowns`; the subset with `user_id == me` → `myEventDowns`). If `dt.activeSharedCheckId` is set and that id is not among the returned checks → `rpc.sharedCheck(id)` in the same group → `raw.sharedCheck` (§7.1). Then `rebuild()`.

`bootAfterLogin` runs **before** the onboarding gate can reach `.friendGate` — the gate waits on `feed.phase` (§6.1) — and **after** `runPreGate` (§7.1). `profile.loadMe()` is therefore called twice on a new-user boot: once in step A (`loadMeForGate`, to feed `resolveGate`) and once inside the TaskGroup (cheap; picks up `onboarded`/`referred_by_check_id` written by respond-shared). The full ordering per user class is §4.4.1.

Hydrate selects never *assign* `raw`. Each select's rows are merged **by row** (`raw.checks.merge(fetched) { _, new in new }` plus a removal pass for ids the select owned but did not return — see §4.7.1), so a realtime change applied while the select was in flight is not overwritten by an older server snapshot.

### 4.5 Optimistic mutations — `toggleDown` in full

```
toggleDown(id):
  guard inflight[id] == nil else return                       // debounce double taps
  if raw.sharedCheck?.id == id && raw.checks[id] == nil { return await respondToSharedCard(id) }   // §7.1 — RLS can't see the row, go through /api
  let before = raw                                            // value-type snapshot
  let mine = raw.myResponseRow(checkId: id, me: me)           // CheckResponse? — carries the row id
  // No haptic here: DownToggle fires the stamp haptics itself (DESIGN §4.3 / §6.1 — touch-down, apex, then .success on ack)
  let tempId = ResponseRowID(UUID())                          // client-side placeholder row id; replaced by the server's on echo
  withAnimation(DTSpring.settle) {                            // the store only reflows; the stamp/dye choreography is DownToggle's (DESIGN §4.3)
     if let mine { raw.responses.removeValue(forKey: mine.id) }
     else        { raw.responses[tempId] = CheckResponse(id: tempId, checkId: id, userId: me, response: .down, createdAt: .now) }
     rebuild()
  }
  inflight[id] = Task {
     do {
        if let mine { try await supabase.from("check_responses").delete().eq("id", mine.id).execute() }
        else {
           let inserted: CheckResponse = try await supabase.from("check_responses").insert(["check_id": id, "user_id": me, "response": "down"]).select().single().execute().value
           raw.responses.removeValue(forKey: tempId); raw.responses[inserted.id] = inserted   // server may have turned it into .waitlist (cap trigger)
           rebuild()
           if inserted.response == .waitlist { toasts.show("check is full — you're #\(waitlistPosition(id)) on the waitlist", key: "squad:\(id)") }   // DESIGN §4.3 waitlist landing; a plain DOWN gets no slip (the .success haptic + the "you're in" strip are the feedback)
           let membership = await squads.refreshMembership(checkId: id)   // trigger may have created/joined a squad
           squadOutcome[id] = membership.formedNow ? .formed : membership.joined ? .joined : nil   // CheckEntry plays SQUAD FORMED or "you're in" (DESIGN §5.6); the §5.3 notification slip is deduped by key
        }
     } catch {
        withAnimation(DTSpring.settle) { raw = before; rebuild() }   // exact restore
        toasts.show(AppError(error).toastCopy, style: .error)         // the Slip host fires .error (DESIGN §6.1); DownToggle rolls back
     }
     inflight[id] = nil
  }
```

The realtime echo of my own INSERT arrives keyed by the server's `id`; `apply(.insert)` first removes any placeholder row for `(checkId, me)` whose id is not the incoming one, then upserts — that is invariant (2) in §11.1.

Every mutation follows this `before → optimistic → await → reconcile-or-restore` shape. `RealtimeInvariantTests` (§11.1) assert the restore is byte-exact.

### 4.6 Cache / persistence — **not offline-first**

The product is live and social; stale "who's down" is worse than a spinner. What we do:

- `LocalCache` actor writes `FeedRaw`, `SquadsRaw`, `[AppNotification]` to `Application Support/DowntoCache/{name}.json` after each successful hydrate (atomic write, envelope `{schema: 1, userId, savedAt, payload}`). On cold launch `bootAfterLogin` loads snapshots first so the feed paints in the first frame, `phase = .loaded(at: savedAt, stale: true)` (UI: the "catching up ✶" strip, §4.9) until the live hydrate lands and sets `stale: false`; a failed live hydrate becomes `.failed(error, hadSnapshot: true)`. Wiped on logout, schema bump, and when `userId` mismatches.
- No mutation queue. Offline DOWN fails → restores → toasts "no signal ✶".
- `UserDefaults`, all keys `dt.`-namespaced: `dt.lastSeenFeedAt`, `dt.feedSort`, `dt.pendingRoute` (JSON `Route`), `dt.pendingCheckId` (set by a `/check/{id}` or `?pendingCheck=` link; consumed once by the onboarding sequence in §7.1), `dt.activeSharedCheckId` (the check whose synthetic card is re-injected after every hydrate — web's `activeSharedCheckId`), `dt.pendingFriendToken`, `dt.pendingAddUsername`, `dt.seenNotifPrompt`, `dt.skippedFirstCheck`, `dt.showAddGlow`, `dt.notifNudgeDismissed`, `dt.push.token`, `dt.push.registeredForUser`, `dt.push.registeredAt`, `dt.draft.{squadId}`. A `Defaults` enum wraps them with typed accessors; `teardownOnLogout` removes every `dt.*` key except `dt.feedSort`.

### 4.7 Replacing "full reload on realtime event"

The web reloads the whole feed on any `checks:all` change. Natively:
- `FeedStore.raw` holds normalised tables; `rebuild()` is pure and cheap.
- Each realtime change is decoded into `TableChange<T>` and applied to `raw` with `withAnimation(DTSpring.page)` (list insertion/removal, `DESIGN.md` §5.1) — a friend tapping DOWN visibly lights up that entry only (the `Color.dtSubtle → tint` flash, `DESIGN.md` §5.1); while the reader is scrolled > 200 pt down, inserts are held behind the "N new ↑" pill (`DESIGN.md` §5.1) — `FeedStore.heldInserts` — and applied on tap or on return to top.
- If a change references a profile not in `raw.profiles` (new FoF, new co-author), fetch that one profile, then rebuild.
- A check `INSERT` can't carry `viaFriendName` → call `get_fof_check_annotations` once (cheap) and merge.
- Fallbacks: decode failure or unknown table → `refresh()` (the old behaviour, safety net only). **Staleness rule — one number: 30 s.** On foreground, `refreshAll()` if `lastHydratedAt` is > 30 s old (the web does a full reload every foreground; we do the cheap merge version). There is no separate 5-minute rule; an earlier draft's "5-minute" wording was a leftover.

#### 4.7.1 Realtime vs. hydrate ordering (the thing the web's "reload everything" hid)

The web reloads the whole feed on every event, so it never has to reason about a change arriving *during* a load. Native replaces that with per-row merges, which creates two windows a builder must close explicitly:

1. **Boot gap** — a row committed between the hydrate selects and the channel join is lost until the next `refreshAll`. Closed by ordering: `bootAfterLogin` calls `realtime.startUserChannels` **before** the TaskGroup and `await`s each channel's `.subscribed` status (`RealtimeChannelV2.statusChange` → `.subscribed`, 5 s timeout → log + continue; the socket reconnect path in §5.4 covers the rest). The same rule applies to every store-scoped channel: `ChatStore.hydrate()` registers `squads.openChat = self` and subscribes `dateConfirms(squadId)` before its selects; `SquadsStore.hydrate()` calls `realtime.setSquadList` with the *snapshot's* squad ids before its selects (and again from `rebuild()` after).
2. **In-flight gap** — `refresh()` keeps the old raw while the selects run; a `TableChange` applied to it during that window is overwritten if the select result (which may predate the change) is assigned wholesale. Closed by `ChangeBuffer` + row merge:

```swift
// Realtime/ChangeBuffer.swift — one per store, main-actor, value-typed
struct ChangeBuffer<Raw> {
    private(set) var generation = 0
    private var pending: [(generation: Int, apply: (inout Raw) -> Void)] = []
    mutating func beginSelect() -> Int { generation += 1; return generation }
    /// Called by every apply(): applies now AND records for replay if a select is in flight.
    mutating func record(_ f: @escaping (inout Raw) -> Void, into raw: inout Raw) { f(&raw); if inFlight > 0 { pending.append((generation, f)) } }
    /// Called when a select lands: merge server rows by row id, then re-apply every change recorded at or after this select's generation.
    mutating func endSelect(_ gen: Int, merge: (inout Raw) -> Void, into raw: inout Raw) {
        merge(&raw)
        for p in pending where p.generation >= gen { p.apply(&raw) }
        inFlight -= 1; if inFlight == 0 { pending.removeAll() }
    }
    private var inFlight = 0
}
```

Rules that follow: (a) `hydrate`/`refresh` never write `raw = fetched`; they call `endSelect(gen, merge:)` whose `merge` does `raw.checks.merge(fetched.checks) { _, new in new }` and removes ids that were in `raw` **and in the select's scope** but absent from the result (a check that vanished because it was archived); (b) a change recorded during a select is idempotent by construction (§11.1 invariant 1), so replaying it over the merged rows is safe; (c) a `.delete` replayed over a row the select re-fetched still deletes it — the delete is newer than the select by causality (it arrived on a channel that was `.subscribed` before the select started); (d) `refreshCheck(id)` is a scoped select (scope = that check's rows) and uses the same buffer with a scope predicate so unrelated pending changes are not replayed twice; (e) `ChatStore.loadOlder()` is *not* a select in this sense — it only prepends rows older than `oldestLoadedAt` and can never conflict with realtime inserts (which are newer), so it bypasses the buffer.

`RealtimeInvariantTests` (7)–(9) in §11.1 pin all three: the friend's DOWN that lights up during a refresh stays lit after the (older) select result merges; a delete during a refresh stays deleted; a change that arrives between `startUserChannels` and the hydrate is present after hydrate.

### 4.8 ExpiryClock and day-change tick

```swift
// in FeedStore (and SquadsStore, same shape). No swift-async-algorithms: a plain sleep loop on ContinuousClock.
private var clockTask: Task<Void, Never>?
private var dayTask: Task<Void, Never>?
private var tzTask: Task<Void, Never>?
func startClock() {
    clockTask = Task { [weak self] in                                // inherits MainActor isolation — no hop, no @Sendable closure
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(30), tolerance: .seconds(5), clock: .continuous)
            guard !Task.isCancelled else { break }
            self?.tick()
        }
    }
    // Foundation's async notification sequence keeps us on the main actor; the closure-based addObserver(forName:object:queue:)
    // takes a @Sendable closure and could not call self?.dayChanged() under strict concurrency.
    dayTask = Task { [weak self] in
        for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) { self?.dayChanged() }
    }
    tzTask = Task { [weak self, env] in
        for await _ in NotificationCenter.default.notifications(named: .NSSystemTimeZoneDidChange) {
            self?.dayChanged(); await env.profile.syncTimezoneIfNeeded()
        }
    }
}
func stopClock() { clockTask?.cancel(); dayTask?.cancel(); tzTask?.cancel() }
private func tick() { now = .now; rebuild() }                       // expiry bars, "Xh left", countdowns
private func dayChanged() {
    now = .now
    let before = Set(items.compactMap { if case .check(let c) = $0, c.mystery == .unrevealed { c.id } else { nil } })
    rebuild()                                                       // Mystery.localToday(now) moved → masked → revealed
    let after  = Set(items.compactMap { if case .check(let c) = $0, c.mystery == .unrevealed { c.id } else { nil } })
    revealedNow = before.subtracting(after)                         // CheckEntry / CheckDetailView / SquadChatView watch this and play the DESIGN §5.7 reveal (ScrambleRenderer + HapticPattern.mysteryReveal)
}
```
`ChatStore` observes the same `NSCalendarDayChanged` and re-runs `rebuild()` so kaomoji members become names at midnight without leaving the chat. **These store observers are the only midnight and 30-second ticks in the app** — views do not schedule their own `TimelineView(.explicit)` / `.periodic(by: 30)`; the one exception is the < 5 min `ExpiryRule`, which runs a view-local 1-second `TimelineView` for the seconds (`DESIGN.md` §4.2). The clock runs only while the app is `.active` (`stopClock()` on `.background`, `startClock()` + an immediate `tick()` on `.active`). (iOS 26's typed `NotificationCenter.MainActorMessage` for `NSCalendarDayChanged` is an acceptable alternative if Foundation ships a message type for it; the untyped `notifications(named:)` sequence is the baseline.)

### 4.9 Load / connection states and their UI (nothing is silent)

| State | Where | Treatment |
|---|---|---|
| `feed.phase == .loading` and no snapshot | FeedView | `Skeleton` — four shimmer-rule entries under a real masthead (`DESIGN.md` §7.15 table); never a spinner. Squads: three 72 pt skeleton rows. |
| `.loaded(stale: true)` (snapshot painted, live hydrate in flight, §4.6) | Masthead running head | The running head reads "updated 14m ago" `Color.inkMuted` until the live hydrate lands, then returns to its normal copy (`DESIGN.md` §7.15 "cache-first"). Entries are interactive (a DOWN tap waits for the hydrate to finish first via `inflight` gating). |
| `.failed(error, hadSnapshot: false)` | FeedView / SquadsView | `ErrorColophon` inline in the content area — "✶" + headline pool + honest cause + "RETRY" → `refresh()` (`DESIGN.md` §7.15 "error colophon"). Pull-to-refresh also works. |
| `.failed(error, hadSnapshot: true)` | same | Keep the stale entries; the running head reads "updated 14m ago · couldn't refresh" `Color.inkMuted`, tap → `refresh()`; a `Slip` with a `Color.danger` rule names the cause once. |
| `NWPathMonitor` path `.unsatisfied` / `.requiresConnection`, debounced 1.5 s (`Reachability`) | Root, under the masthead | The inverted "✶ press not running — you're offline ✶" band; server actions disabled-not-hidden; "back on" slip on reconnection (`DESIGN.md` §7.15 "offline"). |
| `realtime.status == .reconnecting` for > 3 s while the path is satisfied | Masthead running head / chat header countdown line | "· reconnecting" `Color.inkMuted` appended to the running head (feed) or "reconnecting…" in the chat header for at most 10 s (`DESIGN.md` §7.15 "realtime"). Web has nothing here; we promise live entry lighting, so a dead socket must be visible. |
| `realtime.status == .offline` while `scenePhase == .active` for > 5 s and the path is satisfied | same | same copy; tapping the running head calls `realtime.resume()` + `refreshAll()`. |
| Notifications skipped in onboarding (`push.authorization != .authorized && !dt.notifNudgeDismissed`) | FeedView, top of list | `NotifNudgeBanner` — look per `DESIGN.md` §7.4 (a `Color.surface` band): "turn on notifications so you know when they're down" · "ENABLE" (→ `push.requestPermission()`; if `.denied` → open Settings) · "×" (sets `dt.notifNudgeDismissed`). Shown only after the user has ≥ 1 squad or ≥ 1 check (not on day zero). |
| Chat `sending[id].failed == true` | MessageGroupRow | The optimistic row stays at 0.6 with a `Color.danger` 2 pt left rule replacing the magenta one and "didn't send · RETRY" under it; `.error` once (`DESIGN.md` §4.10 "send failure"); tap RETRY → resend, DISCARD → delete. |
| `phase == .failed` while a pending route is queued | RootView | `drainPending()` also runs on `.failed` (not only `.loaded`) — the route dispatches (e.g. to Squads) and the failing store shows its own retry surface. A pending route never waits forever. |

### 4.10 Cross-store entry points (every call one store makes into another, with its owner)

Stores talk to each other only through `AppEnvironment` references and only via the entries below. Anything not listed is a layering violation for review to catch.

| Call | Caller | Owner / API | What it does |
|---|---|---|---|
| `feed.setMySquadMemberships(_:)` | `SquadsStore.rebuild()` | `FeedStore` (the **only** external write into `FeedStore.raw`; `raw` stays `private(set)`) | Replaces `raw.mySquadMemberships` with `[checkId: SquadMembership]` derived from `SquadsRaw.members` where `userId == me`, then `feed.rebuild()`. `refreshMembership(checkId:)` therefore never touches `FeedRaw` directly — it refetches the squad rows and lets `rebuild()` propagate. |
| `realtime.setSquadList(_:)` | `SquadsStore.rebuild()` (and `hydrate()` once before its selects, with the snapshot ids — §4.7.1) | `RealtimeHub` | Diff-subscribes `squad(id)` for the open squad + the 29 most-recently-active others (§5.1 cap). Called after every rebuild; idempotent (no churn when the set is unchanged). |
| `squads.openChat` (`weak var ChatStore?`) | set in `SquadChatView.task(id:)` right after creating the `ChatStore`, cleared in its cancellation handler | `SquadsStore` | The hub's `squad(id)` handler calls `squads.apply(.insert(msg))`; `SquadsStore` forwards to `openChat?.apply(...)` when `msg.squadId == openChat?.squadId`. Neither `RealtimeHub` nor `SquadsStore` creates or retains a `ChatStore`. `Router.openSquadId` is derived from `squadPath`; `openChat` is the object. |
| `squads.refreshMembership(checkId:) -> MembershipOutcome` | `FeedStore` (`toggleDown` insert success; `apply(TableChange<CheckResponse>)` when the row is mine; **`acceptTag` success** — `auto_down_on_coauthor_accept` inserts my response and joins the squad server-side, so the feed and squads must catch up; `respondToSharedCard`) | `SquadsStore` | Refetches `squads` + `squad_members` where I'm a member for that check, merges into `SquadsRaw`, `rebuild()` → which pushes `mySquadMemberships` back into the feed (row 1). Returns `MembershipOutcome { squadId: SquadID?; role: SquadRole?; joined: Bool /* I was not a member before */; formedNow: Bool /* squad.createdAt ≥ my response's createdAt − 2 s */ }` so `toggleDown` can set `FeedStore.squadOutcome[checkId]` — `.formed` plays SQUAD FORMED, `.joined` the "you're in" strip (`DESIGN.md` §5.6); `CheckEntry` clears it after the strip folds. |
| `feed.refreshCheck(_:)` | `NotificationsStore` (`.refreshCheck` effect); `FeedStore` itself when a `check_responses` / `check_co_authors` / `check_comments` change arrives for a `checkId ∉ raw.checks` (the check just became visible to me — via FoF, a co-author tag, or a friendship accepted a second ago) | `FeedStore` | Selects that one check + its sub-tables + missing profiles; a no-row result (RLS) is a silent no-op. Coalesced: at most one in-flight refresh per id. |
| `SideEffect.refreshEvent(EventID)` | `NotificationsStore` | `FeedStore.refreshEvent(_:)` | There is no per-event RPC: `get_friends_events` returns the whole set and is the only source of `FriendsEventPayload.creator`. So `refreshEvent` = re-run `rpc.friendsEvents()` (one round trip, friend-scale small) + a scoped `saved_events` select for that `event_id` → row-merge into `raw.events` / `raw.eventDowns` / `raw.myEventDowns` → `rebuild()`. Debounced 1 s so a burst of `event_down` notifications makes one call. |
| `feed.apply(TableChange<CheckComment>)` for **event** comments | `RealtimeHub` (`checksAll` subscribes `check_comments` unfiltered; `20260417000001_event_comments.sql` adds `event_id` rows with `check_id = NULL`) | `FeedStore` | Branch on `comment.checkId`: non-nil → `raw.comments[checkId]`; nil → `comment.eventId` — M1 **drops it** (EventCard shows no comments, §15.1); M2 routes it to `raw.eventComments[eventId]`. Never `comment.checkId!`. |
| `feed.isGuestsHidden(_:)` | `NotificationsStore.rowBody` | `FeedStore` | read-only |
| `friends.redeem(token:)` | `AppEnvironment.runPreGate` (step 1), `Router.drainPendingIntents` (§7.4), `.onOpenURL` while onboarded | `FriendsStore` | rpc + `hydrate()` + toast |
| `feed.injectSharedCheck(_:)` / `feed.resolveCheckRoute(_:)` | `Router` (§7.4) | `FeedStore` | see §7.4 |
| `squads.refreshSquad(_:)` / `reloadSideTables` | `NotificationsStore` effects, `RealtimeHub` `squad(id)` handler on `isSystem` / non-text | `SquadsStore` / `ChatStore` via `squads.openChat` | compensates for no realtime on `squads` / `squad_members` |
| `env.refreshAll()` | `RealtimeHub` (`.connected` after gap), `DowntoApp` (`.active` + staleness), the offline pill | `AppEnvironment` | §4.7.1-aware |

---

## 5. Realtime

`RealtimeHub` owns all channels and is the only thing that touches `supabase.realtime`.

```swift
@Observable final class RealtimeHub {
    enum Status: Sendable { case connected, reconnecting, offline }
    private(set) var status: Status = .offline
    private var channels: [ChannelKey: RealtimeChannelV2] = [:]
    private var tasks: [ChannelKey: [Task<Void, Never>]] = [:]
    private var wasDisconnected = false

    enum ChannelKey: Hashable, Sendable {
        case checksAll, notifications(UserID), friendshipsRequester(UserID), friendshipsAddressee(UserID)
        case squad(SquadID), dateConfirms(SquadID), eventComments(EventID) /* M2 */, pollVotes(PollID) /* M2 */
    }
    func startUserChannels(userId: UserID, env: AppEnvironment)     // checksAll + notifications + both friendships
    func setSquadList(_ ids: [SquadID], env: AppEnvironment)          // diff-subscribes squad:{id} for every listed squad (cap 30)
    func subscribePollVotes(pollId: PollID, into chat: ChatStore) -> Task<Void, Never>   // M2
    func subscribeDateConfirms(squadId: SquadID, into chat: ChatStore) -> Task<Void, Never>
    func suspend() async                                              // ScenePhase.background: unsubscribe all + disconnect socket
    func resume(env: AppEnvironment) async                            // ScenePhase.active: reconnect + resubscribe same keys
    func stopAll() async                                              // logout
}
```

**No `Subscription` type.** A `~Copyable` struct with `deinit { cancel() }` where `cancel` is `@MainActor` does not compile under strict concurrency (a struct `deinit` is nonisolated unless declared `isolated deinit`, SE-0371), and a non-copyable value cannot live in `@State`. View-scoped subscriptions are simply the `Task` returned by the hub, owned by SwiftUI:

```swift
.task(id: squadId) {                                  // SquadChatView
    let sub = env.realtime.subscribeDateConfirms(squadId: squadId, into: chat)
    await withTaskCancellationHandler { await sub.value } onCancel: { sub.cancel() }
}
```
`.task(id:)` cancels on id change and on disappear; the hub's `Task` unsubscribes the channel in its cancellation path. Store-lifetime subscriptions (`checksAll`, `notifications`, `friendships*`, `squad(id)`) are held in `tasks` and cancelled by `suspend()` / `stopAll()`.

### 5.1 Channel table

| Key | Postgres changes | Handler |
|---|---|---|
| `checksAll` (`"checks:all"`) | `*` on `interest_checks`, `check_responses`, `check_co_authors`, `check_comments` (no filter; RLS scopes delivery) | `feed.apply(TableChange)` per table |
| `notifications(me)` | INSERT `notifications` where `user_id=eq.{me}` | `notifications.prepend(n)` → `NotificationSideEffects` (§5.3) |
| `friendshipsRequester(me)` + `friendshipsAddressee(me)` | `*` on `friendships`, `requester_id=eq.{me}` / `addressee_id=eq.{me}` (Realtime filters are single-column, so two channels) | `friends.apply`; on `.update` to `.accepted` or `.insert` accepted → `feed.refresh()` debounced 2 s (FoF visibility changed) |
| `squad(id)` — **for every squad in the list, cap 30**; the id set comes from `SquadsStore.rebuild()` → `realtime.setSquadList` (§4.10) | INSERT `messages` where `squad_id=eq.{id}` | `squads.apply(.insert)` (preview + unread) which forwards to `squads.openChat?.apply(.insert)` when the squad matches (the hub holds no `ChatStore` reference, §4.10); if `isSystem || messageType != .text` → `openChat?.reloadSideTables()` + `squads.refreshSquad(id)` (compensates for no realtime on `squads`/`squad_members`) |
| `dateConfirms(squadId)` | `*` `squad_date_confirms` where `squad_id=eq.` (table IS in the publication; surrogate `id` PK → DELETE payload is `{id}` only) | subscribed by `ChatStore.hydrate()` **before** its selects (§4.7.1), only while that chat is open → `chat.apply(TableChange<SquadDateConfirm>)` keyed by `ConfirmRowID` (§3.4). Replaces the "system message → reload side tables" compensation for confirms specifically; polls/members still use it. |
| `pollVotes(pollId)` | `*` `squad_poll_votes` where `poll_id=eq.` | M2 (polls read-only in M1; `chat.apply(vote)` keeps counts live) |

**Removed from the earlier draft**: a `checkComments(id)` channel. `checksAll` already subscribes `check_comments` with no filter and `feed.apply(TableChange<CheckComment>)` dedupes by `id`; a second per-sheet channel delivered the same rows twice for nothing. `eventComments(id)` is M2 with EventLobby.

**Archive is not realtime for non-responders — say it out loud.** `interest_checks` UPDATEs setting `archived_at` are filtered by RLS on the *new* row (`check_is_active` is false), so Realtime delivers the UPDATE to nobody but the author. Responders get the `check_archived` notification (`.removeCheck`). A non-responder friend keeps seeing the archived card until the next `refreshAll()` (foreground, reconnect, pull) or until `ExpiryClock` drops it as expired. Accepted; the card is inert (DOWN would fail with `rlsDenied` → toast "press f — that check is gone" → `removeCheck`).

Cap rule for `squad(id)`: subscribe to open squad + up to 29 most-recently-active others. Beyond that the notifications channel still marks unread (`squad_message` etc.), so nothing is lost, only previews go stale for the 31st+ squad — never expected at friend scale.

### 5.2 `TableChange<T>` decoding

```swift
enum TableChange<T: Decodable & Sendable>: Sendable {
    case insert(T), update(new: T, old: T?), delete(old: T?, keys: [String: AnyJSON])
}
```
Decoded from supabase-swift's `AnyAction` (`InsertAction.decodeRecord`, `UpdateAction.decodeRecord/decodeOldRecord`, `DeleteAction.oldRecord`). For tables without replica identity full (everything except `friendships`, `20260216000006_friendships_realtime.sql:5`), **`.delete` carries only the primary-key columns, and for `check_responses`, `check_co_authors`, `check_comments`, `interest_checks`, `messages`, `notifications`, `squad_date_confirms` that is the single surrogate `id`** — `check_id`/`user_id` are *not* in the payload (§3.3).

**Which tables are actually published** (`ALTER PUBLICATION supabase_realtime ADD TABLE …` across all migrations, checked 2026-09-23): `interest_checks`, `check_responses`, `check_co_authors`, `check_comments`, `friendships`, `messages`, `notifications`, `squad_date_confirms`, `squad_poll_votes`, `squad_poll_availability`. **`hidden_checks` and `left_checks` are NOT in the publication** — they never produce a `TableChange`, so `FeedRaw.hidden` / `.left` change only through the client's own optimistic hide/unhide/toggleDown paths and hydrate. `FeedStore` has no `apply(TableChange<HiddenCheck>)` / `apply(TableChange<LeftCheck>)`, and a `HiddenRowID`/`LeftRowID` exists only so the client can delete its own row by id. Handlers therefore resolve deletes purely by row id: `raw.responses.removeValue(forKey: ResponseRowID(keys["id"]))`, and if the removed row was mine → `squads.refreshMembership(checkId:)` (the leave/cap triggers also delete rows). `old` is `nil` for these tables and non-nil only for `friendships`. Any decode error (including a missing `id` key) → `os.Logger.realtime.error` + `feed.refresh()`.

Each subscription is a `Task` iterating `channel.postgresChange(InsertAction.self, schema: "public", table:, filter:)`; cancellation = unsubscribe (see the `Task`-not-`Subscription` note above).

### 5.3 NotificationSideEffects (`Domain/NotificationSideEffects.swift`, pure)

```swift
enum SideEffect: Hashable, Sendable {
    case refreshCheck(CheckID), removeCheck(CheckID), refreshSquad(SquadID), markUnread(SquadID)
    case reloadSquadSideTables(SquadID), friendsHydrate, feedRefreshDebounced, refreshEvent(EventID)
    case toast(String, action: ToastAction?)
}
/// What the DB actually sends as `squad_invite` (one type, four meanings — the triggers write no structured discriminator, only `body` copy):
///   • auto-squad formed / joined on DOWN            → 20260406000001:147,160 "You've been added to the squad"; :163 "{name} is down — squad created" (to the event creator)
///   • DOWN landed you on the waitlist               → 20260406000001:144 "Squad is full — you're on the waitlist"
///   • promoted from the waitlist                    → 20260309000002:72-75 "A spot opened up — you're in!" (plus a system message "X was promoted from the waitlist")
///   • date-confirm promotion                        → 20260302000001:93-99 is type `date_confirm`, "A spot opened up — are you still down?" (+ system message "X was added from the waitlist")
/// So the effect is chosen by MY ROLE in that squad, which SquadsStore knows (or learns via refreshSquad), never by type alone.
enum SquadInviteKind: Hashable, Sendable { case formed, waitlisted, promoted, memberAddedToMine }
func sideEffects(for n: NotificationFacts, openSquadId: SquadID?, myRole: (SquadID) -> SquadRole?, previousRole: (SquadID) -> SquadRole?) -> [SideEffect] {   // NotificationFacts, not AppNotification: Domain stays Data-free (§1.0)
    switch n.type {
    case .squadInvite:
        guard let s = n.relatedSquadId else { return [] }
        // refreshSquad ALWAYS runs first (§4.10 wiring); NotificationsStore re-queries the roles after it lands and calls this again with the fresh values.
        switch (previousRole(s), myRole(s)) {
        case (_, .waitlist):          return [.refreshSquad(s), .toast("squad's full — you're on the waitlist ✶", action: .openSquad(s))]
        case (.waitlist, .member):    return [.refreshSquad(s), .toast("you're in — a spot opened up ✶", action: .openSquad(s))]   // the ONLY promotion toast; §5.6's response-row path emits none
        case (nil, .member):          return [.refreshSquad(s), .toast("squad formed! → open", action: .openSquad(s))]   // DESIGN §5.6 copy; when the optimistic DOWN path already played the stamp, this slip is deduped by key (below)
        case (.member, .member):      return [.refreshSquad(s), .markUnread(s)]                                                       // "X is down — squad created" to a creator already in it, or a re-DOWN
        default:                      return [.refreshSquad(s)]                                                                       // role unknown yet: silent, wait for the re-run
        }
    case .squadJoinRequest, .squadDateNudge:  n.relatedSquadId.map { [.refreshSquad($0), .markUnreadUnlessOpen($0)] } ?? []
    case .squadMessage, .squadMention:        n.relatedSquadId.flatMap { $0 == openSquadId ? nil : [.markUnread($0)] } ?? []
    case .pollCreated:                        n.relatedSquadId.map { [$0 == openSquadId ? nil : .markUnread($0), .reloadSquadSideTables($0)].compactMap { $0 } } ?? []
    case .dateConfirm:                        // also the date-confirm-flow promotion (20260302000001:93-99): role flips waitlist → member here too
        guard let s = n.relatedSquadId else { return [] }
        let promoted = previousRole(s) == .waitlist && myRole(s) == .member
        return [s == openSquadId ? nil : .markUnread(s), .reloadSquadSideTables(s), .refreshSquad(s),
                promoted ? .toast("you're in — still down? ✶", action: .openSquad(s)) : nil].compactMap { $0 }
    case .checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention, .friendCheck, .checkRevived:
                              n.relatedCheckId.map { [.refreshCheck($0)] } ?? []
    case .checkArchived:      n.relatedCheckId.map { [.removeCheck($0)] } ?? []
    case .friendRequest:      [.friendsHydrate]
    case .friendAccepted:     [.friendsHydrate, .feedRefreshDebounced]          // FoF visibility changed
    case .eventDown, .friendEvent, .eventDateUpdated, .eventReminder: n.relatedEventId.map { [.refreshEvent($0)] } ?? []   // no .eventComment case — see §3.4 / DECISIONS #35
    case .unknown:            []
    }
}
```
`NotificationsStore.prepend` runs the effects against the stores: it snapshots `previousRole = squads.role(of: me, in: s)`, runs `sideEffects` once (which always yields `.refreshSquad`), awaits `squads.refreshSquad(s)`, then runs `sideEffects` **again** with the fresh `myRole` and executes only the toast/markUnread effects from the second pass (the refresh is not repeated). Two-pass so the toast copy is never decided on stale membership. **Slip dedupe with the optimistic path**: `toggleDown` (§4.5) already plays the SQUAD FORMED stamp / the "you're in" strip / the waitlist landing (`DESIGN.md` §5.6, §4.3) the moment the insert returns, and the DB then emits a `squad_invite` for the same event ~100 ms later. `ToastCenter.show(_:key:)` takes a dedupe key; the §4.5 waitlist slip, the `squadOutcome` choreography and every `.squadInvite`/`.dateConfirm` slip use `key: "squad:\(squadId)"` (the feed path resolves the squad id from `mySquadMemberships` after `refreshMembership`) and `ToastCenter` drops a keyed toast that arrives within 5 s of another with the same key. Net effect: one toast per DOWN, one per promotion, whichever signal wins the race. `NotificationSideEffectsTests` stays pure (it asserts the effect list); `ToastCenterTests` asserts the 5 s key window. `NotificationSideEffectsTests` covers every type × (open squad matches / doesn't) × the four `(previousRole, myRole)` pairs for `.squadInvite` and `.dateConfirm`, and asserts **exactly one** toast per notification.

### 5.4 Reconnection and lifecycle

- supabase-swift Realtime v2 reconnects with backoff on its own. The hub iterates `supabase.realtime.statusChange` and mirrors it into `status`. On `.connected` after `wasDisconnected` → **first** wait until every channel in `channels` reports `.subscribed` again (they rejoin automatically; the hub awaits their `statusChange`), **then** `env.refreshAll()` (cheap row merge) + `squads.openChat?.hydrate()` for the open chat, because events were missed in the gap. Changes that stream in while `refreshAll`'s selects are in flight go through the same `ChangeBuffer` replay as any other refresh (§4.7.1), so the reconnect path needs no special casing — the order "subscribed → select → replay" is the same as boot.
- **`ScenePhase.background`** → `realtime.suspend()` (closes the socket cleanly instead of letting iOS kill a half-open WebSocket and causing a reconnect storm on resume), `clock` paused.
- **`ScenePhase.active`** → debounced **1 s** (`Task.sleep` cancelled by a quick re-background): `realtime.resume()`, `refreshAll()` if `lastHydratedAt` > 30 s ago, always `squads.refreshUnread()` (`get_unread_squad_ids`), `push.clearDelivered(for: openSquadId)`, `UNUserNotificationCenter.setBadgeCount(0)`, `feed.tick()`.

### 5.5 Squad unread rule (deterministic)

```
hasUnread(squad) = lastMessage != nil
                && lastMessage.senderId != me
                && (readCursor[squad] == nil || lastMessage.createdAt > readCursor[squad])
                && squad.id != openSquadId
```
Seeded by `get_unread_squad_ids(me)` on hydrate/foreground (server truth wins: any id the server returns is unread regardless of local cursors), then maintained locally from `messages` INSERTs and `markRead` (which sets the local cursor to `now` before the upsert lands). The notifications-driven `markUnread` (§5.3) is the belt-and-braces path for a squad created seconds ago that isn't subscribed yet. Bottom-nav red dot = `!unread.isEmpty`. "NEW MESSAGES" section = rows whose `hasUnread`.

### 5.6 Waitlist promotion (two server signals + one client belt-and-braces)

When someone leaves a capped check, the DB promotes the next waitlisted person: an **UPDATE** on their `check_responses` row (`waitlist → down`), an UPDATE on `squad_members.role`, **a system message** ("X was promoted from the waitlist", `20260309000002_fix_promote_race_and_dedup.sql:66-69`) **and a `squad_invite` notification** with body "A spot opened up — you're in!" (`:72-75`). The date-confirm flow's promotion (`20260302000001_date_confirm_flow.sql:93-99`) posts "X was added from the waitlist" plus a `date_confirm` notification "A spot opened up — are you still down?". An earlier draft of this section claimed there was no notification and no system message; both exist. So the promoted user gets, in order of arrival:

1. `checksAll` → `.update` on my `check_responses` row → `FeedStore.apply` sees `userId == me` → `squads.refreshMembership(checkId:)` → `SquadRow.myRole` / `ChatStore.myRole` flip to `.member`, the composer appears (`ComposerSlot` "promoted while the chat is open", `DESIGN.md` §4.10) or the feed entry plays the WAITLISTED → DOWN ✓ landing (`DESIGN.md` §4.3 "Promotion"), each firing `.success` from the view. **No toast from this path.**
2. `squad(id)` → the system message INSERT → `chat.apply` (+ `reloadSideTables`, it's `isSystem`) → the row "X was promoted from the waitlist" renders in the chat (unless mystery-locked, §9.3).
3. `notifications(me)` → `squad_invite` / `date_confirm` → `NotificationSideEffects` with `(previousRole: .waitlist, myRole: .member)` → **the one and only toast** "you're in — a spot opened up ✶" (or "you're in — still down? ✶") with `.openSquad` (§5.3).

Path 1 is the belt-and-braces: it makes the role flip *instantly* even if the notification is delayed or the squad channel isn't subscribed (31st squad), and it is what the web lacks (web needs a full reload). Path 3 owns the copy. If the promoted user is offline at that moment, the next `refreshAll()` + the unread notification row catch it. `ChatStoreTests` asserts path 1 flips the role with **zero** toasts; `NotificationSideEffectsTests` asserts path 3 produces exactly one.

---

## 6. Auth / session

- `supabase-swift` Auth persists the session through the `AuthLocalStorage` protocol. **Its built-in `KeychainLocalStorage(service:accessGroup:)` already stores items with `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlock`** (v2.55.2 `Sources/Auth/Internal/Keychain.swift:86`; on `main` the same at `:133,136`, skipped only for the legacy file-based macOS keychain). An earlier draft justified a custom storage by claiming the library exposed no accessibility knob and that a background refresh needed it — both wrong: the attribute is set, and the app has **no background execution path at all** (no silent-push handler, no BGTask; the `remote-notification` mode in `Info.plist` is dormant, §1.1), so the session is only ever read in the foreground after first unlock anyway. **Decision: use `KeychainLocalStorage(service: "xyz.downto.app", accessGroup: nil)` as written in §3.1.** `Data/SessionStorage.swift` is kept in the tree for exactly one honest reason: the library uses `…AfterFirstUnlock` (backup-restorable) and product may prefer `…AfterFirstUnlockThisDeviceOnly` (a session should not follow an iCloud/iTunes backup onto a new phone). If that preference is confirmed, `SessionStorage` is the same 40 lines over `SecItemAdd/CopyMatching/Update/Delete` with `kSecClass = kSecClassGenericPassword`, `kSecAttrService = "xyz.downto.app"`, `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, `nonisolated final class`, `Sendable` (no state), and `SessionStorageTests` asserts the attribute via `kSecReturnAttributes`. If it is not confirmed by the first TestFlight build, delete the file and the test. Token refresh is automatic; we never touch refresh tokens.
- `authStateChanges` is always available on `AuthClient`; there is no `emitsSessionEvents` configuration flag (the earlier snippet had one — removed in §3.1).

```swift
@Observable final class SessionStore {
    typealias State = SessionState                  // Domain/SessionState.swift: { booting, signedOut, signedIn(UserID) } — lives in Domain so resolveGate can take it (§1.0)
    private(set) var state: State = .booting
    private(set) var pendingEmail: String?
    func start() async                              // for await (event, session) in supabase.auth.authStateChanges { switch event { case .initialSession, .signedIn, .tokenRefreshed: state = .signedIn(...); case .signedOut: state = .signedOut; ... } }
    func sendCode(email: String) async throws       // EmailValidity.isValidShape guard; supabase.auth.signInWithOTP(email:, shouldCreateUser: true)
    func verify(code: String) async throws          // supabase.auth.verifyOTP(email:, token:, type: .email); 8 digits
    func signOut() async
}
```

`Domain/EmailValidity.swift` ports `emailValidity.ts` (`isValidEmailShape` with `^[^\s@]+@[^\s@]+\.[a-z]{2,}$` case-insensitive; `suggestFix` with the same 21-entry typo map) — surfaced as "did you mean {fix}?" tap-to-apply, non-blocking.

### 6.1 Onboarding gate (`Domain/Gate.swift`, pure)

```swift
enum Gate: Equatable, Sendable {
    case booting, auth, profileSetup, enableNotifications, friendGate, firstCheck, main
}
/// Domain-side slice of Profile (Domain never imports Data/Models — §1.0). ProfileStore exposes `me?.gateProfile`.
struct GateProfile: Equatable, Sendable { var onboarded: Bool; var displayName: String; var referredByCheckId: CheckID? }
struct GateInput: Equatable, Sendable {
    var session: SessionState            // Domain/SessionState.swift
    var me: GateProfile?                 // nil while loading, or after the sweep case
    var meLoaded: Bool
    var feedLoaded: Bool                 // feed.phase is .loaded or .failed (a failed feed must not trap the user in .booting)
    var feedHasChecks: Bool              // feed.hasChecks — real or synthetic (§4.2)
    var preGateDone: Bool                // §7.1 sequence (redeem token → respond-shared) finished; false until then
    var seenNotifPrompt: Bool            // dt.seenNotifPrompt
    var hasSharedCheck: Bool             // dt.pendingCheckId != nil || dt.activeSharedCheckId != nil || me.referredByCheckId != nil
    var justOnboardedThisSession: Bool
    var skippedFirstCheck: Bool          // dt.skippedFirstCheck
}
func resolveGate(_ i: GateInput) -> Gate {
    switch i.session {
    case .booting: return .booting
    case .signedOut: return .auth
    case .signedIn:
        guard i.meLoaded else { return .booting }
        guard let me = i.me else { return .auth }                                    // abandoned-onboarding sweep → treated as signed out
        if !me.onboarded && me.displayName.isEmpty { return .profileSetup }
        if !me.onboarded && !i.seenNotifPrompt && !i.hasSharedCheck { return .enableNotifications }   // shared-check arrivals skip the push ask (web parity)
        if !me.onboarded { return (i.preGateDone && i.feedLoaded) ? .friendGate : .booting }          // friend gate waits for redeem/respond-shared + feed
        // First-check screen only for a brand-new user with an EMPTY feed and no shared check — web handleFriendGateDone.
        if i.justOnboardedThisSession && !i.skippedFirstCheck && !i.hasSharedCheck && !i.feedHasChecks { return .firstCheck }
        return .main
    }
}
```

**Who sets what, in the non-empty-feed case** (this is where the M1 definition-of-done user lands — invite link → sign up → friend's check already visible → straight to the feed):
- `FriendGateView` Continue → `profile.setOnboarded()` → `justOnboardedThisSession = true`. `RootView` re-resolves; if `feedHasChecks || hasSharedCheck` the gate is `.main` and `RootView` sets `dt.showAddGlow = true` **only when `!hasSharedCheck`** (web: shared-check users get neither FirstCheck nor the glow). `dt.skippedFirstCheck` is *not* set in this branch — it means "the user saw FirstCheck and skipped it", nothing else.
- `FirstCheckView` Skip → `dt.skippedFirstCheck = true` + `dt.showAddGlow = true`. Post → `feed.createCheck` then `dt.skippedFirstCheck = true` (so the gate falls through) and no glow.
- The "+" glows (§14.7) while `dt.showAddGlow`; the first successful `createCheck` clears it.
- `justOnboardedThisSession` is in-memory only; a relaunch after Continue lands on `.main` (web parity — FirstCheck is a one-shot).

`GateTests` covers the full matrix: sweep case; shared-check branch (`hasSharedCheck` skips `.enableNotifications`, blocks `.firstCheck`); **returning user with a pending link** (`onboarded: true, hasSharedCheck: true, preGateDone: false` → `.main`: the gate never waits on the pre-gate for an onboarded user, §7.1 guard); `preGateDone == false` holds `.booting` only when `!onboarded`; `feedLoaded` true via `.failed`; `feedHasChecks` true → `.main` not `.firstCheck`; `feedHasChecks` false + no shared → `.firstCheck`; `skippedFirstCheck` → `.main`. The behaviour that *backs* the shared-check branch (synthetic card, respond-shared timing, author pinning) is specified in §7.1 and tested in `SharedCheckFlowTests` (§11.1), not in `GateTests`.

- **Abandoned-onboarding sweep**: `profiles.me()` returns nil for a valid session (the daily cron deleted the un-onboarded account) → `SessionStore` calls `supabase.auth.signOut()` (clears Keychain) and `state = .signedOut`; toast "your account timed out — sign up again".
- **Timezone**: `ProfileStore.syncTimezoneIfNeeded()` on boot, on `.active`, and on `NSSystemTimeZoneDidChange`.
- Gate transitions animate with `.transition(.opacity.combined(with: .scale(scale: 0.98)))` under `.animation(.smooth(duration: 0.35))` so onboarding feels like one continuous surface.

### 6.2 Sign-out order

1. `push.unregister()` → `DELETE /api/push/subscribe` (best effort, 3 s timeout) — needs the token, so first.
2. `realtime.stopAll()`.
3. `supabase.auth.signOut()`.
4. `cache.wipe()`; `Defaults.clearAll(except: [.feedSort])`.
5. `env.teardownOnLogout()` (every store `reset()`).
6. `UNUserNotificationCenter.removeAllDeliveredNotifications()`; `setBadgeCount(0)`.

**Delete account**: type-username confirm → `api.deleteAccount()` → same teardown.

---

## 7. Navigation

```swift
enum Tab: Hashable, Sendable { case feed, squads, you }
/// Pushed on the Feed tab's NavigationStack. Check detail is a zoom push (`.navigationTransition(.zoom)` from the entry, DESIGN §5.4),
/// never a sheet; the deleted-check page is a push on the same stack (DESIGN §7.5). Both hide the Folio.
enum FeedDestination: Hashable, Sendable { case checkDetail(CheckID), deletedCheck(CheckID, isMine: Bool) }   // the synthetic shared-link card (§7.1) uses .checkDetail too
enum Sheet: Identifiable, Hashable, Sendable {
    case editCheck(CheckID), checkActions(CheckID)
    case notifications, friends(tab: FriendsTab), userProfile(UserID)
    case squadSettings(SquadID), squadMembers(SquadID), dateProposal(SquadID), report(ReportTarget, UUID)
    case editProfile, syncCalendar                          // syncCalendar M2
    case eventLobby(EventID), editEvent(EventID)            // M2
    var id: String { … }
}
enum Cover: Identifiable, Hashable, Sendable { case imageViewer(URL) }   // .fullScreenCover with .navigationTransition(.zoom) from the image (DESIGN §7.8)
enum FriendsTab: Hashable, Sendable { case friends, add }
enum Route: Hashable, Sendable, Codable {
    case feed(checkId: CheckID?), squads(squadId: SquadID?), friends(FriendsTab), profile(username: String), check(CheckID), friendToken(UUID)
    case create                                          // home-screen quick action "new check" (DESIGN §7.18) → CreateOverlay
}

@Observable final class Router {
    var tab: Tab = .feed
    var sheet: Sheet?                                   // the ROOT sheet (one at a time at this level)
    var stacked: Sheet?                                 // a second-level sheet presented FROM INSIDE the root sheet's content (§7.0)
    var cover: Cover?
    var feedPath: [FeedDestination] = []                // NavigationStack path of the Feed tab; count ≤ 1
    var squadPath: [SquadID] = []                       // NavigationStack path of the Squads tab; count ≤ 1
    var isCreateOpen = false; var createPrefill: CreatePrefill?   // CreateOverlay lives in MainShell's root ZStack, not in a sheet (DESIGN §7.6)
    var hidesFolio: Bool { !feedPath.isEmpty || !squadPath.isEmpty || isCreateOpen || cover != nil }   // Folio slides down (DESIGN §4.11)
    var highlightedCheckId: CheckID?                    // feed scroll + 3 s highlight
    var openSquadId: SquadID? { squadPath.last }
    private(set) var pending: Route?                    // cold-launch replay
    private var queuedSheet: Sheet?                     // drained in the root sheet's onDismiss
    func present(_ s: Sheet)                            // §7.0 rules
    func dismissAll(then: @MainActor () -> Void)        // stacked → sheet → cover, waits for onDismiss, then runs `then`
    func go(_ route: Route)                             // ALWAYS dismissAll first (push tap / deep link while a sheet is up), then tab/path/highlight
    func enqueue(_ route: Route)                        // stores to dt.pendingRoute too
    func drainPending()                                 // called by RootView when Gate == .main && feed.phase is .loaded OR .failed (§4.9)
    func drainPendingIntents(env: AppEnvironment) async // §7.4: dt.pendingCheckId / pendingFriendToken / pendingAddUsername for an ONBOARDED user; right after drainPending(), once per session
}
```

### 7.0 Sheet stacking rules

SwiftUI ignores a new `.sheet(item:)` value assigned while the previous one is still animating out, and cannot present two sheets from the same host. The web stacks four flows: CheckDetail → Edit, UserProfile → Report, Friends → UserProfile, Notifications → DeletedCheck. Natively the check detail is a **push** (`feedPath`, DESIGN §5.4) and the deleted-check page is a push on the same stack, so two of those four are not sheet stacks at all. Rules:

1. **Two levels, nested presentation.** `MainShell` hosts `.sheet(item: $router.sheet)`. The *content* of every root sheet hosts `.sheet(item: $router.stacked)`; SwiftUI presents the second sheet from the first, which is legal and gives the stacked-card visual for free. `Cover` (`.fullScreenCover`) is hosted on `MainShell` too and sits above both. Sheets opened from the pushed `CheckDetailView` (`editCheck`, `checkActions`, `userProfile`) are **root** sheets presented over the pushed page.
2. **`present(_:)`** decides the level: if `sheet == nil` → root. If a root is up and the new sheet is one of the allowed children of the current root (`userProfile → report`, `friends → userProfile`, `squadSettings → squadMembers`, `squadSettings → dateProposal`, `editEvent → squadMembers` (M2)) → `stacked`. Anything else → `queuedSheet = s` and the root is dismissed; the root's `onDismiss` presents `queuedSheet`. A third level is never presented; `stacked → X` replaces `stacked` via the same queue mechanism on its own `onDismiss`.
3. **Push from a sheet** (Notifications → DeletedCheck, Notifications → check detail, lobby card → chat): `dismissAll(then: { feedPath = [.deletedCheck(…)] })` — dismiss first, then push, so the zoom/push animates on a clean shell.
4. **`go(_:)`** (push tap, deep link, slip action) always begins with `dismissAll`. Route dispatch runs in `then:` so the tab switch and highlight animate on a clean shell. Nothing routes underneath a sheet.
5. `onDismiss` handlers are the only place `queuedSheet` is drained; `NavigationStack` pushes (chat, detail) are unaffected.

`RouterTests` (Stores/) covers each allowed pair, the queue path, and `go` while both levels are up.

- **Tabs**: custom `Folio` (DESIGN §4.11 — three typeset labels, a 2 pt `Color.dt` underline sliding with `DTSpring.page`, intrinsic height ≥ 52) over a `ZStack` of the three roots, not `TabView`; each root is its own `NavigationStack` kept alive and toggled with opacity + `allowsHitTesting` (DESIGN §5.2). Each root keeps its own scroll position (`ScrollPosition` bindings live in the stores). The Folio is a `.safeAreaInset(edge: .bottom)` on the roots and hides on `router.hidesFolio` (§7.5).
- **Sheets**: every bottom sheet uses the `.dtSheet(detents:)` modifier (DESIGN §4.9 owns every visual: `presentationBackground(Color.surface)` + grain, `presentationCornerRadius(24)`, hidden system indicator + our 40×4 `Color.inkFaint` handle that widens on drag, default detents `[.fraction(0.72), .large]`, `presentationBackgroundInteraction(.disabled)`, `presentationContentInteraction(.scrolls)`, the block stagger, the `paperStock = .surface` environment). **The backdrop is the system dim — no `.ultraThinMaterial`, no blur** ("paper under paper is dimmed, not blurred", DESIGN §0). Native physics replace the web's 60 pt threshold; UIKit already applies "only when scrolled to top". Unsaved changes → `.interactiveDismissDisabled(isDirty)` + a native `.confirmationDialog` ("discard edits?") — there is no custom `DTConfirmDialog`; every confirm in the app is the system dialog (DESIGN §7.8).
- **Squad chat**: `SquadChatView` is pushed inside the Squads root's `NavigationStack(path: $router.squadPath)`, with the **system navigation bar hidden** and our own `ChatHeader` (layout: DESIGN §4.10); the swipe-right-to-close is restored through a UIKit shim, not left to chance — the full decision and the keyboard/safe-area contract for the `Folio` are in §7.5. From Feed / notifications / push, `router.go(.squads(squadId:))` sets `tab = .squads` then `squadPath = [id]` in the next run loop so the tab switch animates first.
- **Check detail**: `CheckDetailView` is pushed on the Feed root's `NavigationStack(path: $router.feedPath)` with `.navigationTransition(.zoom(sourceID: check.id, in: feedNS))`; the entry is the `.matchedTransitionSource` (DESIGN §5.4). Its navigation bar is hidden the same way as the chat's and the same `InteractivePopEnabler` restores the edge pop (the zoom's own drag-to-dismiss also works). `CreateOverlay` is neither a sheet nor a cover: it is a view in `MainShell`'s root `ZStack` toggled by `router.isCreateOpen` so `matchedGeometryEffect` can carry the posted text into the feed (DESIGN §7.6).
- **Deep links** (`.onOpenURL` + `NSUserActivity.browsingWeb`; entitlement `applinks:downto.xyz`; the AASA is a **web-repo deliverable that does not exist yet** — §7.2):

| URL | Behaviour |
|---|---|
| `/check/{id}` | signed out → `dt.pendingCheckId`, auth shows the shared-check banner (§7.3 — mystery-safe); after sign-in the key is consumed by **whichever of the two paths below matches the user's `onboarded` flag** (§4.4.1 / §7.4). Signed in & **not onboarded** → §7.1 onboarding sequence (the only place respond-shared auto-fires). Signed in & **onboarded** (arriving live *or* via `dt.pendingCheckId` drained in §7.4) → `feed.resolveCheckRoute(id)` (§7.4): `.visible` → `.feed(checkId:)` + 3 s highlight flash, then `feedPath = [.checkDetail(id)]` 300 ms after the scroll lands (the zoom, DESIGN §7.17 row 1); `.gone` → `feedPath = [.deletedCheck(id, isMine:)]`; `.outsideNetwork` → `feed.injectSharedCheck(id)` → synthetic card at the top of the feed + `.checkDetail` pushed on it (rendered with the "{author} sent you this" context band, DESIGN §7.17). **No auto-DOWN for onboarded users** — they tap DOWN themselves (web parity: `useOnboarding.tsx:178-200` only injects/glows for `profile.onboarded`; respond-shared lives inside the `!profile.onboarded` branch at `:330-350`). |
| `/friend?token=` | signed out → `dt.pendingFriendToken`; signed in & not onboarded → redeemed in §7.1 step 1; onboarded → `friends.redeem` → toast "you and {name} are friends ✶" → `.userProfile(creatorId)`; `.alreadyFriends` → toast "already friends ✶"; `.invalid` → toast with the reason ("that link expired") |
| `/?add={username}` | signed out or not onboarded → `dt.pendingAddUsername` (drained in §7.4); onboarded → `.friends(.add)` then `.userProfile` after lookup |
| `/?pendingCheck={id}` | same as `/check/{id}` |
| `/?tab=&squadId=&checkId=&openFriends=` | legacy sw.js form → same `Route`s: `tab=squads[&squadId]` → `.squads(squadId:)`; `tab=feed[&checkId]` → `.feed(checkId:)`; `tab=profile&openFriends=1` → `.friends(.friends)` |
| `/?tab=calendar` | legacy sw.js form for `event_reminder` (`public/sw.js:85`). There is no calendar tab natively → `.feed(checkId: nil)` (same as the native `mapPushToRoute` for `.eventReminder`). Listed so a builder does not add a `.calendar` case. |
| `downto://…` (custom scheme, fallback) | same path/query grammar as above; used by the web `/check/[id]` page's "open in app" button when universal links are unavailable (e.g. link pasted into Notes) |

### 7.1 Shared-check path (the thing RLS will never give you)

`interest_checks` SELECT is `author OR is_friend_or_fof OR is_friend_of_coauthor` (`20260424000003_block_and_report.sql:100-109`). **Responding does not grant visibility.** A user who arrives via `/check/{id}` from outside the author's network can DOWN through `/api/checks/respond-shared` (service role), but `feed.refreshCheck(id)` will keep returning nothing until they become friends with the author. The web solves this with a *synthetic card* built from `get_shared_check` and re-injected after every reload (`useOnboarding.tsx` `buildSharedCheck` / "re-inject shared check"). Native does the same, as first-class store state:

**State.** `FeedRaw.sharedCheck: SharedCheck?` (§3.9), persisted in the `LocalCache` snapshot; `dt.activeSharedCheckId` (the id to re-inject) persisted in defaults; `profiles.referred_by_check_id` (written by respond-shared) as the recovery source when defaults are gone (reinstall). `hasSharedCheck` for the gate = any of the three.

**Projection.** `rebuild()` emits a `FeedCheck` for `raw.sharedCheck` **only if `raw.checks[sharedCheck.id] == nil`** (once the real row is visible, the synthetic one yields and `dt.activeSharedCheckId` is cleared). The synthetic card: `author = .person(PersonRef(id: authorId, displayName: authorName, username: "", avatarLetter: authorAvatar, isMe: false))` — or `.masked` when `mystery == true` / `nil` (§7.3); `via = "shared link"`; `guests = .countOnly(responseCount)`; `downCount = responseCount`; `myResponse` from `raw.myResponseRow` (present after respond-shared because `check_responses` RLS lets me read my own row) — else nil; `mySquad` from `raw.mySquadMemberships[id]` (squads/squad_members RLS uses `is_squad_member`, so my membership IS visible); `isSynthetic = true`; `comments = []`; `expiry = computeExpiry(expiresAt, createdAt, now)`; sorted into the pinned tier if timed, otherwise **first** in the chrono tier regardless of sort (it is the reason the user is here). `CheckEntry` on a synthetic card hides the ⋯ menu and the comments composer; `CheckDetailView` shows text/when/where/author + "N people down" and no lists, under the "{author} sent you this" context band (DESIGN §7.17).

**DOWN on the synthetic card** (`respondToSharedCard`): optimistic `myResponse = .down`, `api.respondShared(checkId:)`, then `await feed.injectSharedCheck(id)` (fresh `response_count`) + `squads.refreshMembership(checkId:)` (the trigger auto-joins the squad — the squad IS visible via `is_squad_member`, so the chat works even though the card is synthetic). Un-DOWN deletes my own `check_responses` row (RLS allows deleting own row) then re-injects. Errors restore exactly as §4.5.

**Onboarding sequence** for a brand-new user with `dt.pendingCheckId` and/or `dt.pendingFriendToken` (runs once per session in `AppEnvironment.runPreGate()`, after `profileSetup` completes — i.e. as soon as `meLoaded && !me.displayName.isEmpty` — and *before* `bootAfterLogin`'s hydrate; `GateInput.preGateDone` flips when it finishes; full ordering in §4.4.1). **Guard first: `guard !me.onboarded else { preGateDone = true; return }`.** An already-onboarded user who tapped a `/check/{id}` link while signed out also has `dt.pendingCheckId` set and a non-empty `displayName` the moment they sign in; without this guard a builder following the steps literally would insert a `check_responses` row, auto-join a squad and overwrite `profiles.referred_by_check_id` for someone who only tapped a link. Their `dt.pending*` keys are left untouched here and consumed by §7.4 once they reach `.main`. Order for the not-onboarded case matters:

1. **Redeem friend token** if `dt.pendingFriendToken` → `rpc.redeemFriendLink` (best effort; result toasted later). Doing this before the friend gate means the inviter *already appears as a friend* — which also satisfies the gate's Continue rule (step 5). **Deliberate deviation, not parity**: the web fires respond-shared first (`useOnboarding.tsx:344`) and redeems the token afterwards (`:378`); the two calls are independent server-side (different tables, no trigger reads the other), and native orders the friendship first purely so the gate's pinned suggestion and Continue rule are settled before the feed hydrates. `SharedCheckFlowTests` pins the native order.
2. **Respond-shared** if `dt.pendingCheckId` **and `!me.onboarded`** (the guard above already ensures this; restated because it is the line a builder will copy) → `api.respondShared(checkId:)` (fire-and-forget with one retry; the web fires it here so `referred_by_check_id` exists before the friend gate). Then `dt.activeSharedCheckId = pendingCheckId`, `dt.pendingCheckId = nil`.
3. **Hydrate** (`bootAfterLogin`) — the feed now contains the friend's checks (if step 1 friended someone in-network) and the synthetic card (step 2 / `dt.activeSharedCheckId`).
4. **Friend gate** — pinned suggestion = author of `dt.activeSharedCheckId ?? me.referredByCheckId` via `rpc.sharedCheckAuthor` (skip if `== me`); then `friends.suggestions` (FoF) and search. The inviter from step 1 is in `friends.friends` already.
5. **Continue is disabled until `friends.friends.count > 0 || friends.outgoing.count > 0 || friends.incoming.count > 0`** (web `hasAddedFriend`, FriendsModal.tsx:53). Copy under the disabled button: "add at least one person — that's the whole point ✶". Continue → `profile.setOnboarded()`.
6. `resolveGate` → `.main` (never `.firstCheck` here, because `hasSharedCheck`). No "+" glow for shared-check arrivals.

**Re-injection on every hydrate** is what makes the card survive pull-to-refresh, foreground reloads and relaunches (§4.4). It stops when the real row becomes visible (friendship accepted), when `get_shared_check` returns no row (archived/unshared → clear `dt.activeSharedCheckId`, toast "press f — that check is gone" if the card was on screen), or on logout.

`SharedCheckFlowTests` (Stores/): synthetic card appears when RLS returns no row; yields to the real row; survives `refresh()`; DOWN routes to the API stub not PostgREST; `hasSharedCheck` recovered from `referredByCheckId` with empty defaults; gate sequence order asserted with an ordered stub log (`redeem` before `respondShared` before `hydrate`); **returning-user-with-link**: `me.onboarded == true` + `dt.pendingCheckId` set → `runPreGate` logs nothing (no `respondShared`, no `redeem`), `dt.pendingCheckId` is still set after the gate resolves `.main`, and `drainPendingIntents` then calls `resolveCheckRoute` exactly once and clears the key — with the stub returning `.outsideNetwork`, `raw.sharedCheck` is set and **no `check_responses` insert and no `respondShared` call** occurred; the same for `dt.pendingFriendToken` (→ one `friends.redeem`) and `dt.pendingAddUsername` (→ `.friends(.add)` sheet). `GateTests` adds the matching pure case: `onboarded: true, hasSharedCheck: true` → `.main` regardless of `preGateDone`.

### 7.2 Universal links — cross-repo deliverable (blocks every deep-link row above)

Verified 2026-09-23: nothing in `public/`, `src/app/` or `next.config.*` serves `/.well-known/apple-app-site-association`. Without it iOS never associates `downto.xyz` with the app, every link opens Safari, and the M1 definition-of-done flow (invite link → app) cannot happen. Required in the **web repo**, shipped before TestFlight:

- Route `src/app/.well-known/apple-app-site-association/route.ts` (a Next route handler so we control the header; a static file in `public/.well-known/` also works if Vercel serves it as `application/json` — verify with `curl -I`). Response: `Content-Type: application/json`, no redirect, HTTP 200, no auth/middleware in front of it (add the path to the proxy/middleware matcher exclusions).
- Body — use the `components` form; a bare `"/"` path would hijack **every** `downto.xyz` root link into the app, including the web app itself:

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAMID>.xyz.downto.app"],
      "components": [
        { "/": "/check/*",  "comment": "shared check" },
        { "/": "/friend",   "?": { "token": "?*" }, "comment": "invite link" },
        { "/": "/",         "?": { "add": "?*" },          "comment": "?add=username" },
        { "/": "/",         "?": { "pendingCheck": "?*" }, "comment": "?pendingCheck=id" },
        { "/": "/",         "?": { "squadId": "?*" },      "comment": "legacy sw.js route" },
        { "/": "/",         "?": { "checkId": "?*" },      "comment": "legacy sw.js route" }
      ]
    }]
  },
  "webcredentials": { "apps": ["<TEAMID>.xyz.downto.app"] }
}
```
- `<TEAMID>` is the Apple Team ID — the same value as `DEVELOPMENT_TEAM` in `Config/Secrets.xcconfig` (§1.2). It is not secret (it is in every signed binary), so it can be committed to the web repo as a constant; the xcconfig comment says where it is used.
- Entitlements: `com.apple.developer.associated-domains = applinks:downto.xyz` (plus `applinks:staging.downto.xyz` in `Debug-Staging`, which needs the same file served there, and `?mode=developer` on the entitlement for local testing). Apple's CDN caches the AASA; use `applinks:downto.xyz?mode=developer` on dev builds to bypass it.
- The web `/check/[id]` page should also render an "open in down to" button using the `downto://` custom scheme as a fallback for contexts where universal links are suppressed (long-press "open in Safari", in-app browsers).
- Verification step added to §12's fresh-agent checklist: `curl -sI https://downto.xyz/.well-known/apple-app-site-association | grep -i 'content-type: application/json'` and `swcutil`-equivalent: open `https://downto.xyz/check/<id>` from Notes on a device with a TestFlight build → app opens.

### 7.3 Pre-login shared-check banner must not leak a mystery author

`get_shared_check` is `SECURITY DEFINER` with no `GRANT`/`REVOKE` (so callable by `anon`) and returns `author_name` unconditionally. For a mystery check that reveals the author to a logged-out viewer — the web has the same gap; native does not inherit it. `AuthView`'s banner renders `SharedCheck` through the same `Presence` projection: `Mystery.isUnrevealed(mystery: shared.mystery ?? true, authorId: shared.authorId, eventDate: shared.eventDate, viewer: nil, now:, calendar:)` → `.masked(kaomoji: Censor.kaomoji(seed: id), scramble: …)` and `Censor.stripAtMentions(text)`. Since the RPC does not return `mystery` today, `nil` is treated as "unknown → mask" (a non-mystery check briefly shows a kaomoji author on the banner, which is on-brand and harmless). **Web-repo deliverable**: add `ic.mystery` to `get_shared_check`'s RETURNS TABLE (one migration) so the banner is exact; and, separately, have the RPC itself null out `author_name` / `author_avatar` when `mystery AND event_date > CURRENT_DATE` so `/check/[id]` and OG previews stop leaking too. `SharedCheckFlowTests` asserts `String(reflecting: bannerModel)` contains no `authorName` when `mystery` is `true` or `nil` and the date is in the future.

- **Push tap routing** (`Domain/PushRouting.swift`, pure, tested for all 22 types + unknown — `event_comment` is not a DB value today, §3.4):

```swift
func mapPushToRoute(type: String, relatedId: String?) -> Route? {
    let uuid = relatedId.flatMap(UUID.init(uuidString:))
    switch NotificationType(rawValue: type) ?? .unknown {
    case .friendRequest: return .friends(.add)
    case .friendAccepted: return .friends(.friends)
    case .squadMessage, .squadInvite, .squadMention, .squadJoinRequest, .pollCreated, .dateConfirm, .squadDateNudge: return .squads(squadId: uuid.map(SquadID.init))
    case .friendCheck, .checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention: return .feed(checkId: uuid.map(CheckID.init))
    case .eventDown, .friendEvent, .eventDateUpdated, .eventReminder: return .feed(checkId: nil)
    case .checkArchived, .checkRevived, .unknown: return nil
    }
}
```

- **Cold-launch replay**: `AppDelegate.userNotificationCenter(_:didReceive:)` → `router.enqueue(route)` (also persisted to `dt.pendingRoute` with a timestamp in case the process dies between tap and gate). `RootView` calls `drainPending()` the first time `Gate == .main` and `feed.phase` is **`.loaded` or `.failed`** (a failed hydrate must not hold a push tap hostage — §4.9); consumed exactly once (delete before dispatch); a pending route **older than 24 h is dropped** on launch (DESIGN §7.17 — a stale push tap should not teleport a user who opens the app a day later). URLs arriving during `.booting` take the same path. `mapPushToRoute` lives in Domain and returns `Domain/Route.swift`'s `Route`, built from `NotificationType` — both Domain types (§1.0).

### 7.4 Draining pending intents and the one check-route resolver

The §7 table defines behaviour for URLs that arrive **while signed in**. Links tapped while signed out are parked in `dt.pendingCheckId` / `dt.pendingFriendToken` / `dt.pendingAddUsername`, and for a *new* user §7.1 consumes the first two. For an **onboarded** user nothing consumed them in earlier drafts. Now:

```swift
// Router.swift
func drainPendingIntents(env: AppEnvironment) async {           // RootView, right after drainPending(), first time Gate == .main && feed.phase ∈ {.loaded, .failed}; runs once per session
    if let id = Defaults.pendingCheckId    { Defaults.pendingCheckId = nil;    await go(.check(id), env: env) }      // → resolveCheckRoute (below) — onboarded path, NO auto-DOWN
    if let t  = Defaults.pendingFriendToken { Defaults.pendingFriendToken = nil; await env.friends.redeem(token: t) }  // toast "you and {name} are friends ✶" → .userProfile(creatorId); .alreadyFriends / .invalid toasts as in the §7 table
    if let u  = Defaults.pendingAddUsername { Defaults.pendingAddUsername = nil; present(.friends(tab: .add)); if let p = await env.friends.profile(username: u) { present(.userProfile(p.id)) } }
}
```

Keys are cleared **before** the awaited call (delete-before-dispatch, same rule as `dt.pendingRoute`) so a crash mid-drain cannot replay a DOWN or a redeem. Order is check → token → username so a link that carried both (`/check/{id}` shared by a new friend who also sent an invite) ends on the friend's profile sheet over the highlighted check.

**`FeedStore.resolveCheckRoute(_ id: CheckID) async -> CheckRouteOutcome`** is the single resolution step for every way a check id reaches the router — `.feed(checkId:)` and `.check(id)` routes from push taps (§8.2), `NotificationsStore.tap`, deep links, toast actions and the drain above all go through it; no caller calls `ensureLoaded` / `getCheckState` / `injectSharedCheck` directly:

```swift
enum CheckRouteOutcome: Hashable, Sendable { case visible, gone(isMine: Bool), outsideNetwork, unreachable }
func resolveCheckRoute(_ id: CheckID) async -> CheckRouteOutcome {
    if await ensureLoaded(id) { return .visible }                       // in raw, or refreshCheck fetched it (newly visible via FoF / co-author)
    do {
        let s = try await rpc.getCheckState(id)                         // SECURITY DEFINER: sees archived + out-of-network rows
        if !s.active { return .gone(isMine: s.isMine) }
        return await injectSharedCheck(id) ? .outsideNetwork : .gone(isMine: false)   // active but RLS-hidden → synthetic card; get_shared_check nil → treat as gone
    } catch { return .unreachable }                                     // offline: toast "no signal ✶", stay put
}
```

`Router.go(.feed(checkId: id?))` / `.check(id)`: `dismissAll`, `tab = .feed`, `feedPath = []`, then `switch await feed.resolveCheckRoute(id)`: `.visible` / `.outsideNetwork` → `highlightedCheckId = id` (scroll + the 3 s flash, DESIGN §4.1) and `feedPath = [.checkDetail(id)]` 300 ms later when the route came from a deep link or notification tap (push taps only highlight — web parity with `SET_NEWLY_ADDED`); `.gone` → `feedPath = [.deletedCheck(id, isMine:)]`; `.unreachable` → slip "no signal ✶". `RouterTests` asserts each outcome from each of the four entry points.

### 7.5 Squad chat navigation: hidden system bar + restored interactive pop

The brief forbids the stock template and iOS 26's system navigation bar is Liquid Glass, so the chat **hides it** (`.toolbar(.hidden, for: .navigationBar)` on `SquadChatView`) and draws `ChatHeader` — `Color.surface`, 48 pt + top safe area, 1 pt `Color.ruleMid` bottom rule, chevron / name + `AvatarStack` `micro` + countdown / "⋯", every visual per DESIGN §4.10 — as a normal view pinned with `.safeAreaInset(edge: .top)`, with `.scrollEdgeEffectStyle(.hard, for: .top)` on the transcript. (DECISIONS #15: DESIGN's earlier "keep the system bar and restyle it" plan is withdrawn — it needed this same shim anyway and left two Liquid Glass risks open.) `CheckDetailView` hides its bar the same way. Hiding the bar disables `UINavigationController.interactivePopGestureRecognizer` (its delegate refuses when the bar is hidden), so the doc picks **option B: re-enable it through a shim**, keeping the real interactive pop (velocity-matched, cancellable, interruptible — things a hand-rolled `DragGesture` does not get right on the first try):

```swift
// App/InteractivePopEnabler.swift
struct InteractivePopEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ c: Controller, context: Context) {}
    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            guard let nav = navigationController, let pop = nav.interactivePopGestureRecognizer else { return }
            pop.delegate = self; pop.isEnabled = true
        }
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool { (navigationController?.viewControllers.count ?? 0) > 1 }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { false }
    }
}
// SquadChatView: .background(InteractivePopEnabler().frame(width: 0, height: 0))
```

Contract: `gestureRecognizerShouldBegin` returns false at the root so the Squads list is never popped off nothing; the recogniser is the system edge-pan, so it starts only within ~20 pt of the left edge and does not fight the horizontal `ScrollView`s inside message rows (image carousels are M2 anyway). `ChatHeader`'s back chevron calls `router.squadPath.removeLast()` with `.selection`. Fallback if the delegate trick regresses on a future iOS (it has worked unchanged since iOS 7 but is undocumented): keep the same `ChatHeader` and add a `DragGesture(minimumDistance: 20, coordinateSpace: .global)` bound to the leading 24 pt via `.contentShape` — translation.x ≥ 80 or velocity ≥ 600 pt/s on end → pop, with the chat view offset following the finger and the list root pre-rendered underneath at 0.92 scale so it looks like the system transition. The fallback is *written* behind `#if DT_CUSTOM_POP` from day one so the switch is a build flag, not a rewrite. `FakeWorldSmokeTests` already asserts "swipe back → bottom nav visible again" (§11.4); it uses `XCUIElement.swipeRight()` from the left edge so it exercises whichever path is compiled in.

**`Folio` under the chat — safe area and keyboard.** The `Folio` is drawn by `MainShell` as a `.safeAreaInset(edge: .bottom)` over the `ZStack` of roots, so every root's scroll content already ends above it (its measured height reaches the roots through a preference key, DESIGN §4.11). While `router.hidesFolio` is true it animates `.offset(y: measuredHeight + bottomSafeArea)` with `DTSpring.page` and **sets `.safeAreaInset` content to `EmptyView` (height 0)** in the same transaction, so the chat's composer sits on the home-indicator safe area, not a bar-height up; the Folio is also `.allowsHitTesting(false)` while offset. Keyboard: `SquadChatView` uses the default keyboard-avoiding safe area (no `.ignoresSafeArea(.keyboard)`), the composer is the chat's own `.safeAreaInset(edge: .bottom)` and therefore rides up with the keyboard; the Folio is off-screen and never in the keyboard's way; on pop, the keyboard is dismissed first (`resignFirstResponder` via `@FocusState = nil` in the pop handler) so the Folio slides back into a stable layout instead of animating against a keyboard frame. The order of stacked bottom insets inside the chat is specified in §7.6.

### 7.6 ChatScrolling — the hardest screen, specified

`ChatScrollController` (Features/Squads) owns the `ScrollPosition` and implements the following, in priority order. `ChatStore.scroll: ChatScrollState { var isAtBottom = true; var unseenCount = 0; var anchor: MessageID? }` is the state realtime consults.

1. **Bottom-anchored initial layout.** `ScrollView { LazyVStack(spacing: 0) { ForEach(messages) … } }` with **`.defaultScrollAnchor(.bottom)`**, so the first frame after hydrate is at the newest message with no visible jump; rows are `.id(message.id)` and the `ForEach` is keyed by `MessageID` (client ids for optimistic sends are stable through the echo swap, §4.5 — the row identity does not change, only its `sending` state). Rows are transcript lines, not bubbles: `rebuild()` also computes `isGroupStart` per message (same sender, within 2 min of the previous) so `MessageGroupRow` draws the sender header + 16 pt group gap only on the first row of a group and 4 pt otherwise (DESIGN §4.10 "message group"; your groups carry the 2 pt `Color.dt` left rule + `Color.dtFaint` band).
2. **Stay pinned only when already at the bottom.** `.onScrollGeometryChange(for: Bool.self) { g in g.contentOffset.y + g.containerSize.height >= g.contentSize.height - 24 } action: { _, atBottom in chat.scroll.isAtBottom = atBottom }`. On an incoming `.insert` (mine or theirs): if `isAtBottom` → `position.scrollTo(edge: .bottom)` inside `withAnimation(.smooth(duration: 0.25))`; otherwise the row is appended without moving the viewport and `unseenCount += 1`, which drives the "↓" circle (32 pt `Color.ink`, "↓" `Color.paper`, `Elevation.lifted`, above the composer — DESIGN §4.10) that scrolls to bottom on tap. My own send **always** scrolls to bottom (you expect to see what you just sent). No haptic for incoming messages.
3. **Prepend 100 older rows without a jump.** On `isAtTop` (offset ≤ 80) → `let anchor = messages.first!.id; let n = await chat.loadOlder()`; then, in the same transaction that inserts the rows, `position.scrollTo(id: anchor, anchor: .top)` **with `Transaction(animation: nil)`** so the previously-topmost row stays exactly where it was. Two guards: `loadOlder` is a no-op while a page is in flight (double-trigger during the layout pass), and the top trigger is re-armed only after the geometry reports the offset > 80 again. This is the "classic SwiftUI jump" fix; it is pinned by the `FakeWorldSmokeTests` assertion "prepend 100 rows keeps the visible message in place" (§11.4) — the fixture chat has 300 rows so the page fires.
4. **Scroll-to-poll chip.** The active-poll chip (DESIGN §4.10; in M1 it targets the `PollPlaceholderRow`, §15.1) sits in the top inset; tap → `position.scrollTo(id: poll.messageId, anchor: .center)` with `DTSpring.page` + a 600 ms `Color.dtSubtle` flash on that row. Same primitive for `router.highlightedMessageId` (mention taps in M2).
5. **Keyboard.** `.scrollDismissesKeyboard(.interactively)` on the `ScrollView`; when the keyboard *appears* and `isAtBottom` was true, scroll to bottom again after the inset change (`onChange(of: keyboardHeight)` — read via the composer's `GeometryReader` in the safe-area inset, not `UIResponder` notifications) so the last row is never hidden behind the composer.
6. **Bottom inset stack, top to bottom:** the "↓" circle (floating, not an inset) → `DateConfirmBar` (only while `pendingConfirm != nil`; unfurls with `DTSpring.page`, DESIGN §4.10) → `ComposerSlot` (one view switching on `(squad.state, membership.role)` — composer / waitlist strip / grace strip + composer / ended strip with REVIVE / kicked strip — DESIGN §4.10 "chat lifecycle"; the strip swap animates height with `DTSpring.page`, the transcript is never replaced). Both are a single `VStack(spacing: 0)` in **one** `.safeAreaInset(edge: .bottom)` so the scroll content's bottom inset is their combined height and the keyboard pushes the whole stack. `MentionPicker` overlays the composer (`.overlay(alignment: .top)`), not an inset, so it never resizes the scroll view.
7. **Top inset:** `ChatHeader`, then `JoinRequestBanner` (only for the squad creator, only while a `pending` request exists) and the active-poll chip, in one `.safeAreaInset(edge: .top)` `VStack` (DESIGN §4.10 puts the banner and chip at the top), so `scrollTo(edge: .top)` / prepend anchoring account for them automatically.
8. **Realtime and `rebuild()` never reset the position.** `messages` is replaced as a whole array on every rebuild (it is a projection); because rows are identified by `MessageID` and `LazyVStack` diffs by identity, the `ScrollPosition` survives. The mystery midnight reveal (§4.8) re-runs rebuild in place; the roster masking changes the *content* of rows, not their ids.

Budget: the 300-row fixture chat scrolls at 120 Hz on iPhone 17 Pro with no dropped frames in Instruments' SwiftUI template; `AttributedString` bodies are built in `rebuild()`, never in `body`.

---

## 8. Push

```swift
@Observable final class PushStore {
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    private(set) var deviceToken: String?                   // hex
    func refreshAuthorization() async
    func requestPermission() async -> Bool                  // [.alert, .sound, .badge]; then UIApplication.shared.registerForRemoteNotifications()
    func didRegister(token: Data)                           // hex → deviceToken; Defaults.push.token; syncIfNeeded()
    func didFailToRegister(_ error: any Error)              // log; simulator is expected to fail
    func syncIfNeeded() async                               // §8.1
    func unregister() async                                 // DELETE /api/push/subscribe; clears dt.push.registered*
    func clearDelivered(for squadId: SquadID?) async        // getDeliveredNotifications → remove those with userInfo.relatedId == squadId
}
```

### 8.1 Registration hardening

`syncIfNeeded()` runs on login, on every launch while signed in, and on `.active`. It POSTs `push/subscribe {platform:"ios", deviceToken}` when **any** of: `dt.push.registeredForUser != me`, `dt.push.token != deviceToken` (tokens rotate on restore/reinstall), or `now - dt.push.registeredAt > 24h`. On success writes all three keys. Failures are logged and retried next trigger. Registration is also re-triggered from `didRegister` if signed in.

### 8.2 Delegate behaviour

- `willPresent`: decode `{type, relatedId}`. Suppress (`[]`) when: (a) `type` is a squad type and `relatedId == router.openSquadId`; or (b) `type` starts with `check_` / `friend_` **and** `realtime.status == .connected` (the in-app toast/realtime already shows it; when the socket is down, present it). Otherwise `[.banner, .sound, .list]`.
- `didReceive`: `mapPushToRoute` → `router.go` (or `enqueue` if the gate isn't `.main`). **`router.go(.feed(checkId: id))` is not a bare tab switch**: `Router` dispatches every `.feed(checkId:)` — from push, notification-sheet tap, deep link or toast action alike — through `feed.resolveCheckRoute(id)` (§7.4), so a `check_response` push on a check that is archived lands on `DeletedCheckView`, one on a check not yet in `raw` (newly visible via FoF / co-author) is fetched first, and one outside my network gets the synthetic card. A highlight for a card that is not there is impossible by construction.
- Badge: server always sends `badge: 1`; we `setBadgeCount(0)` on every `.active`, on opening the notifications sheet and on opening a squad chat (DESIGN §7.8). Accurate server-side badge is a later fix.
- Clearing delivered: on `ChatStore.markRead()` and on `.active` with a chat open → `clearDelivered(for:)`. Server sets no `thread-id`; filtering `userInfo.relatedId` is the native equivalent.
- Entitlements: `aps-environment` `development` in Debug configs, `production` in Release; the server's `APNS_SANDBOX` must match (`ios/PUSH_SETUP.md`).
- Permission is asked once in the `enableNotifications` gate; the Profile toggle: denied → `UIApplication.openNotificationSettingsURLString`; authorized → subscribe/unsubscribe.

---

## 9. Mystery-mode redaction

**Principle: views never receive a raw `InterestCheck` + `Profile` and decide what to hide. They receive display models whose people are `Presence` values, and a masked `Presence` carries no id and no name.** This is enforced by the type system, not by a naming convention or a test.

### 9.1 Rules (`Domain/Mystery.swift`, exact port of `mystery.ts`)

```swift
enum Mystery {
    static func localToday(_ now: Date, calendar: Calendar) -> LocalDate
    static func isUnrevealed(mystery: Bool, authorId: UserID, eventDate: LocalDate?, viewer: UserID?, now: Date, calendar: Calendar) -> Bool
    //   !mystery → false; viewer == author → false; eventDate == nil → true; else eventDate > localToday(now)
    static func isGuestsHidden(mystery: Bool, eventDate: LocalDate?, now: Date, calendar: Calendar) -> Bool
    //   !mystery → false; eventDate == nil → true; else eventDate > localToday(now)
}
```
Reveal happens **on** the event date (`>` not `>=`), in the viewer's local calendar. `MysteryTests` ports all 14 cases from `mystery.test.ts` (incl. "redacted at 23:59 the day before", "revealed at 00:00 on the day") and runs the boundary in `America/Los_Angeles`, `Europe/London`, `Asia/Tokyo`.

### 9.2 Censor (`Domain/Censor.swift`, exact port of `censor.ts`)

```swift
enum Censor {
    static let wingdingsPool: [String]   // 29 entries, identical order to censor.ts
    static let kaomojiPool: [String]     // 20 entries, identical order (note "( ˙꒳​˙ )" contains U+200B — copy byte-exact)
    /// djb2 over UTF-16 code units, wrapping at 32 bits — matches JS `charCodeAt` + `>>> 0`.
    static func hashSeed(_ s: String) -> UInt32 {
        var h: UInt32 = 5381
        for u in s.utf16 { h = (h &<< 5) &+ h &+ UInt32(u) }
        return h
    }
    static func wingdings(seed: String, length: Int = 6) -> String   // pool[(h + i * 2654435761) % 29] — do the math in UInt64 to avoid overflow, JS uses doubles here (exact up to 2^53)
    static func glyph(seed: String) -> String                        // pool[h % 29]
    static func kaomoji(seed: String) -> String                      // kaomojiPool[h % 20]
    static func kaomojiForUser(threadSeed: String, userId: UserID) -> String   // kaomoji(seed: "\(threadSeed)::\(userId)") with lowercase uuid
    static func kaomojiAssignment(threadSeed: String, userIds: [UserID]) -> [UserID: String]   // unique-walk algorithm, same order semantics
    static func stripAtMentions(_ text: String) -> String            // replace /@\S+/ with "@???"
}
```
Important: JS `(h + i * 2654435761) % 29` is computed in doubles — for `h < 2^32` and `i ≤ 5` the sum is < 2^35, exact. Swift must use `UInt64` arithmetic (not `UInt32` wrapping) to match. `UserID` strings are lowercased UUIDs (as Postgres/JS have them).

**Golden tests** (`CensorGoldenTests`), values computed with `node` from `src/lib/censor.ts` on 2026-09-23 — iOS and web must show identical scrambles:

| seed | hash | wingdings | glyph | kaomoji |
|---|---|---|---|---|
| `a1b2c3d4-0000-4000-8000-000000000001` | 3109329050 | `✰▒✿☆◇✬` | `✰` | `(◠‿◠)` |
| `a1b2c3d4-0000-4000-8000-000000000002` | 3109329051 | `✩✱❉✦◆✭` | `✩` | `(◕ᴗ◕)` |
| `3f2504e0-4f89-11d3-9a0c-0305e82c3301` | 2111062628 | `✧◊✮✵◈✩` | `✧` | `(•_•)` |
| `hello` | 261238937 | `✬✳✤✪▓❀` | `✬` | `( ˙꒳​˙ )` |
| `über::naïve` | 3911048391 | `◆✭✴✣✰▒` | `◆` | `(◕ᴗ◕)` |

Plus: `kaomojiForUser(threadSeed: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", userId: "a1b2c3d4-0000-4000-8000-000000000001")` == `(◕‿◕)`; `kaomojiAssignment(threadSeed: "3f2504e0-…3301", userIds: […0001, …0002, …0003])` == `[…0001: "(◕‿◕)", …0002: "(´◡`)", …0003: "(◔‿◔)"]` (0002's preferred collides and walks forward); `stripAtMentions("hey @kat and @sam_1 down?")` == `"hey @??? and @??? down?"`. The test file records the node one-liner used so the goldens can be regenerated if `censor.ts` changes.

### 9.3 Enforcement points (the only three places raw rows become display)

1. **`FeedStore.rebuild()`** → `FeedCheck`:
   - `unrevealed = Mystery.isUnrevealed(…)`, `guestsHidden = Mystery.isGuestsHidden(…)`.
   - `author = unrevealed ? .masked(kaomoji: Censor.kaomoji(seed: check.id), scramble: Censor.wingdings(seed: check.id)) : .person(ref)`.
   - `text = unrevealed ? Censor.stripAtMentions(check.text) : check.text`.
   - `coAuthors` → masked with `kaomojiForUser(threadSeed: check.id, userId:)` when unrevealed.
   - `guests = guestsHidden ? .hidden : .revealed(downs:, waitlist:)`; `downCount = guestsHidden ? nil : downs.count`.
   - `comments[].sender` → `kaomojiAssignment(threadSeed: check.id, userIds: commenters)` when unrevealed.
   - `mystery = !check.mystery ? .none : unrevealed ? .unrevealed : (eventDate == localToday ? .revealedToday : .none)`.
   - Only `EditCheckSheet` needs the raw check — it is author-only and receives `raw.checks[id]` through `FeedStore.rawCheckForEditing(id) -> InterestCheck?` which returns nil unless `authorId == me`.
2. **`ChatStore.rebuild()`** → `members: [MemberDisplay]`, `messages: [ChatMessageDisplay]`:
   - `isMysteryLocked = Mystery.isGuestsHidden(mystery: check.mystery, eventDate: check.eventDate, now:, calendar:)` for check-backed squads.
   - When locked, **rows are dropped before anything is masked**: `messages` keeps only rows where `!isSystem && messageType == .text && senderId != nil` (text and image rows). System rows ("kat just entered the chat", "sara got kicked…"), `.poll` and `.dateConfirm` rows are removed *entirely* — their bodies bake real display names into a `String`, which `Presence` typing cannot catch. This is exactly the web filter (`SquadChat.tsx:415-418` on hydrate, `:490-495` on realtime insert, and `useSquads` hydrate). The same filter runs in `apply(.insert)` so a realtime system message never flashes in. `.dateConfirm` is therefore *not* rewritten to a placeholder — it is simply absent while locked (web parity); `pendingConfirm = nil`, `polls = [:]`.
   - Then masking: `assignment = Censor.kaomojiAssignment(threadSeed: squad.id, userIds: members.map(\.userId))`; every `presence` is `.masked(kaomoji: assignment[uid], scramble: Censor.wingdings(seed: "\(squad.id)::\(uid)"))`; message senders use the **same assignment** (see the deviation note below); `MemberDisplay.id` is the opaque `MemberKey` (§3.5). `Composer.canAttachImage = false`, `canCreatePoll = false`, `MentionPicker` disabled; `SquadMembersView` non-interactive.
   - `SquadsStore.rebuild()` applies the same drop-then-mask to `SquadRow`: `lastMessage` is the newest message that survives the filter (or nil), its `sender` masked; `SquadRow.members` masked. The bottom-nav/NEW MESSAGES unread rule still counts filtered-out system messages as activity? **No** — unread is computed from the *surviving* last message so a locked squad doesn't show an unread dot for a row the user can't see. (§5.5's `lastMessage` means "last visible message".)
   - **Deliberate deviation from web, owned here:** the web renders the viewer's own rows as "You" and masks only `otherMemberIds` (`useSquads.ts:151-160`), and its chat rows use plain `kaomojiForUser` while the roster uses `kaomojiAssignmentForUsers` (`SquadChat.tsx:425`), so on the web one person can have a different kaomoji in the roster vs the thread when the unique-walk resolves a collision. Native (a) masks *everyone including me* — "nobody sees who's down" reads better as a rule with no exception, and my own groups are still distinguishable by the 2 pt `Color.dt` rule + `Color.dtFaint` band (`isMine`, DESIGN §4.10); and (b) uses the assignment for both roster and bubbles so a person is one kaomoji everywhere. Consequence: **in collision cases native and web will not show identical kaomoji for the same member**; the §9.2 goldens pin the primitives (`kaomojiForUser`, `kaomojiAssignment`), not the per-surface choice. If product later wants "You", flip one flag in `ChatStore.rebuild` (`maskSelf`), not the projection.
3. **`NotificationsStore.rowBody(for:)`**: server-generated titles/bodies are **already mystery-aware** — `20260428000003_mystery_aware_notification_bodies.sql` rewrites `notify_check_response` / comment / tag bodies to "someone …" ("someone is in ✦", `:116`) while the check is unrevealed, and the push worker sends the same `title`/`body`, so **neither notification rows nor push banners leak a masked sender**; an earlier draft called this a web gap and a client mitigation, it is neither. What the client still does, and why it is *not* redundant: the row is rendered at **read time**, and the server text was fixed at **write time**. A notification written the day *before* the event says "someone is in ✦"; the same row opened the day *after* the reveal may keep saying "someone" (stale but safe), and a notification written after the reveal says the real name — both fine. The one case the client must handle is the reverse: a row whose body carries a real name for a check that is *still* hidden cannot occur with today's trigger, but `rowBody(for:)` still routes `.checkResponse` / `.checkComment` / `.commentMention` bodies through `feed.isGuestsHidden(relatedCheckId)` → "someone's down ✶" as a type-level guarantee that survives a future trigger regression (the same reason `Presence` exists). Cost: one dictionary lookup per row.

`MysteryLeakTests` (the reflection target is the *whole* display output, which is why `MemberDisplay.id` had to become opaque — an earlier draft asserted "no `id.description`" against a model whose `id` *was* the user id, i.e. a test that fails by construction):
- Feed: for every check in `Fixtures.world(.busyFriday)` with `mystery == true` and a future date, `project(...)` with a non-author viewer → `String(reflecting: feedCheck)` contains none of: author `displayName`, `username`, `id.description`; any responder's `displayName`/`username`/`id.description`; any co-author's or commenter's name; no `@username` from the raw text.
- Chat: `ChatStore.rebuild()` on the mystery squad's `ChatRaw` (fixture includes "sara just entered the chat", "mo got kicked from the chat", a `.dateConfirm` row and a `.poll` row) → `String(reflecting: (members, messages, pendingConfirm, polls))` contains no member `displayName`/`username`/`id.description`, **and** `messages` contains no `.system`, `.dateConfirm` or `.pollPlaceholder` case, **and** `members.map(\.id.description)` are all `k:`-prefixed.
- Squads list: `SquadsStore.rebuild()` → `String(reflecting: rows)` for the mystery row contains no member names and `lastMessage?.text` is not the system row's text.
- Realtime: `chat.apply(.insert(systemMessage))` while locked leaves `messages` unchanged; after `now` crosses the event date, `rebuild()` re-includes it.
- Banner: §7.3 assertion on the pre-login `SharedCheck` projection.
This is a real test, not documentation.

---

## 10. Date parsing, expiry and countdowns

### 10.1 `Domain/DateParse.swift` — port `src/lib/dateParse.ts` function-for-function

```swift
enum DateParse {
    static func toLocalISODate(_ d: Date, calendar: Calendar) -> LocalDate
    static func parseDateToISO(_ display: String, now: Date, calendar: Calendar) -> LocalDate?
    static func parseNaturalDate(_ text: String, now: Date, calendar: Calendar) -> (label: String, iso: LocalDate)?
    static func parseNaturalTime(_ text: String) -> String?                 // "7pm", "7:30pm", "noon"→"12pm", "midnight"→"12am"
    struct ParsedWhen: Equatable, Sendable { var dates: [LocalDate]; var time: String?; var label: String? }
    static func parseWhen(_ input: String, now: Date, calendar: Calendar) -> ParsedWhen   // splits on " or ", "/", ", "; de-dup, order preserved
    static func parseNaturalLocation(_ text: String) -> String?              // returns nil today; kept for parity
    struct TextSpan: Equatable, Sendable { let range: Range<String.Index>; let kind: Kind; enum Kind: Sendable { case date, time, location } }
    static func findDateSpan(_ text: String) -> TextSpan?
    static func findTimeSpan(_ text: String) -> TextSpan?
    static func findLocationSpan(_ text: String) -> TextSpan?
    static func findDateTimeSpans(_ text: String) -> [TextSpan]
    static func stripDateTimeText(_ text: String) -> String
}
```
Porting rules:
- Inject `now` and `Calendar` (the TS reads `new Date()` inline, which is why its tests use fake timers). Production passes `.now` / `.current`.
- Regexes become Swift `Regex` literals; keep the TS function order and comment headers so the two files diff side by side. Where JS and Swift regex semantics differ (`\b` with Unicode, lookbehind), note the original TS line in a comment.
- The `new Date(withYear)` "whatever JS accepts" fallback in `tryParseSingle` becomes an explicit `Date.ParseStrategy` list, locale `en_US_POSIX`, in this order: `"MMM d yyyy"`, `"MMMM d yyyy"`, `"EEE, MMM d yyyy"`, `"EEE MMM d yyyy"`, `"M/d/yyyy"`, `"M/d/yy"`, `"MMM d"`, `"MMMM d"`, `"M/d"` (last three assume the next occurrence ≥ today). Documented in the file; a test enumerates them.
- Labels via `Date.FormatStyle` `.weekday(.abbreviated).month(.abbreviated).day()` in `en_US` to match `toLocaleDateString("en-US", {weekday:"short", month:"short", day:"numeric"})` → "Fri, May 1".
- Tests: `DateParseTests` ports all **55** cases from `dateParse.test.ts` with `FROZEN_NOW = Mon 2026-04-27 14:00` in the test calendar's time zone (`America/Los_Angeles`), each `@Test` named after the TS case; plus DST-transition day, year-end week wrap, `12am`/`12pm`, and a fuzz test (`parseWhen` never throws on 10k random strings and never returns a date before `now - 1 day`).

### 10.2 `WhenField`

The natural-language when-input of `CreateOverlay`, `EditCheckSheet` and `DateProposalSheet` (for `set-date`). Structure: a baseline-rule text field bound to `parseWhen` (debounced per keystroke) that publishes `WhenParse { date: LocalDate?; time: String?; label: String?; dateFlexible: Bool; timeFlexible: Bool; error: Bool }`. Look (DESIGN §7.6 / §7.5): the typed text is plain `Font.dt.body` `Color.ink` (no inline underlines or per-span colouring); under the rule a parse preview "→ thu 25 sep · 7:00pm" in `Font.dt.meta` `.successInk` or "couldn't read that" `.dangerInk`, plus the "date-ish" / "time-ish" toggles. `findDateTimeSpans` is still used for the preview label, not for styling the input.

### 10.3 `Domain/Expiry.swift`

```swift
enum ExpiryState: Hashable, Sendable { case open, expired, remaining(hours: Int, minutes: Int, percent: Double) }
func computeExpiry(expiresAt: Date?, createdAt: Date, now: Date) -> ExpiryState
//  nil → .open; remaining <= 0 → .expired; else hours = floor(rem/3600), minutes = floor(rem%3600/60), percent = min(100, elapsed/total*100)
extension ExpiryState { var label: String   /* "open" | "expired" | "3h" | "42m" */; var isDanger: Bool /* percent > 75 */ }
```

### 10.4 `Domain/SquadCountdown.swift` — port of `GroupsView.tsx`

```swift
enum SquadCountdown {
    static func eventStart(date: LocalDate?, time: String?, calendar: Calendar) -> Date?
    //   nil date → nil; parse time /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/ → that local time; else 23:59:59.999 local (date-only)
    static func sortKey(eventStart: Date?, lastActivityAt: Date?) -> Date        // eventStart ?? lastActivityAt ?? .distantFuture
    static func isFading(eventStart: Date?, expiresAt: Date?, now: Date) -> Bool // now - start > 24h, or expiresAt - now < 24h
    struct Countdown: Hashable, Sendable { let label: String; let sub: String?; let urgent: Bool }
    static func countdown(eventStart: Date?, dateStatus: DateStatus?, now: Date) -> Countdown?
    //   nil start → nil; diff < 0 && status != .locked → nil; < -24h → PAST; < 0 → ENDED; < 1h → "{max(1,min)}m" sub "from now" urgent
    //   < 24h → "{h}h" "from now" urgent if h < 6; < 7d → "{d}d" sub "tomorrow"/"away"; < 30d → "{w}w" "away"; else "{mo}mo" "away"  (all Math.round)
}
```
Sections: `hasUnread` → NEW MESSAGES; else `isFading` → FADING ✶; else UPCOMING; each sorted by `sortKey` ascending. Headers shown only when ≥ 2 non-empty buckets (parity).

---

## 11. Testing

Swift Testing (`import Testing`) for unit tests; XCTest only for `DowntoUITests` (XCUITest requires it) and the snapshot test.

### 11.1 Unit (pure, no network)

| Suite | Covers |
|---|---|
| `DateParseTests` | 55 ported + edge cases (§10.1) |
| `MysteryTests` | 14 ported + 3 time zones at the midnight boundary |
| `CensorGoldenTests` | the table in §9.2 + assignment + stripAtMentions + `hashSeed` over a non-BMP string (emoji → two UTF-16 units) |
| `MysteryLeakTests` | reflection leak test on fixture world (§9.3) |
| `ExpiryTests` | open/expired/remaining, percent math, `isDanger` at exactly 75 |
| `SquadCountdownTests` | every branch of §10.4, date-only vs timed, `proposed` vs `locked` past |
| `FeedOrderingTests` | pinned urgency order; recent vs upcoming; dateless after dated; hidden excluded; NEW badge; expired dropped |
| `PushRoutingTests` | all 22 types + unknown + malformed relatedId |
| `GateTests` | full `resolveGate` matrix incl. sweep case and shared-check branch |
| `NotificationSideEffectsTests` | every type × (open squad matches / doesn't) × for `.squadInvite` and `.dateConfirm` the four `(previousRole, myRole)` pairs (§5.3); exactly one toast per notification; waitlisted copy ≠ formed copy ≠ promoted copy |
| `EmailValidityTests` | 8 ported |
| `ModelDecodingTests` | one JSON fixture per table and per RPC in `Fixtures/rows/`; 4 timestamp forms; `LocalDate`; `.unknown` fallback for every `TolerantEnum`; `ID<Tag>` round-trip |
| `AppConfigTests` | each missing/malformed key throws its specific error |
| `AppErrorTests` | 23505 → usernameTaken, 42501 → rlsDenied, URLError → network, 401 api |
| `FeedRebuildTests` | raw → items with `Fixtures.world(.busyFriday)`; performance < 1 ms for 200 checks |
| `RealtimeInvariantTests` | on `FeedStore` and `ChatStore` with fixture raw: (1) applying the same `TableChange` twice is a no-op (`raw` equal after 1st and 2nd apply); (2) optimistic `toggleDown` (placeholder `ResponseRowID`) followed by the realtime echo of its own INSERT (server `id`) leaves exactly one response row for me, keyed by the server id; (3) a failed mutation (stub URLProtocol returns 500) restores `raw` `==` the pre-mutation snapshot; (4) **a `.delete(old: nil, keys: ["id": <row uuid>])` — the exact payload shape for a surrogate-PK table without replica identity full — removes exactly that `check_responses` / `check_co_authors` / `check_comments` row (FeedStore) and that `squad_date_confirms` row (ChatStore, `ConfirmRowID`, and `pendingConfirm` becomes nil when it was the prompt's row) and nothing else, and when a response row was mine triggers one `refreshMembership`** (`hidden_checks` / `left_checks` are *not* tested here — they are not in the publication, §5.2); (5) a change referencing an unknown profile triggers exactly one profile fetch; (6) a `.delete` whose `id` is unknown is a no-op and logs, not a refresh storm; (7) **in-flight refresh keeps newer changes** — start `refresh()` against a stub that returns the *pre-change* rows after a delay, apply `.insert(friend's DOWN)` while it is pending, let the select land → the DOWN is still present and `items` shows the lit card (§4.7.1); (8) same with a `.delete` during the select → the row stays deleted after the merge; (9) **boot gap** — a change delivered after `startUserChannels` reports `.subscribed` but before `hydrate()`'s selects return is present in `raw` after hydrate, and a change delivered *before* `.subscribed` is (by construction) not expected — the test asserts the hub does not start any select before every user channel is `.subscribed` (ordered stub log); (10) a `check_responses` insert for a `checkId ∉ raw.checks` triggers exactly one `refreshCheck` and no `apply` |
| `BootSequenceTests` | the three §4.4.1 columns as ordered stub logs: returning user → `loadMe, startUserChannels(subscribed), hydrate…, drainPending, drainPendingIntents` with **no** `runPreGate` side effects; new/no-link → `loadMe, [profileSetup], runPreGate(noop), startUserChannels, hydrate…`; new/link → `loadMe, [profileSetup], redeem, respondShared, startUserChannels, hydrate…, friendGate`. Also: `bootAfterLogin` is never invoked twice per session, and `drainPendingIntents` never runs while `Gate != .main` |
| `UnreadRuleTests` | §5.5 arithmetic incl. server-seeded ids overriding local cursors; `markRead` then echo of my own message stays read; locked mystery squad: system-only tail → no unread |
| `ChatStoreTests` | optimistic send dedupes with echo by client id; image message preview text; mystery lock drops system/poll/dateConfirm rows and hides polls/confirms; `memberKeys` resolves a key back to a user only when unlocked; waitlist → member promotion via `.update` on my response flips `myRole` with **zero** toasts (§5.6 path 1); `loadOlder()` returns the prepended count and is a no-op while in flight; `scroll.unseenCount` increments only when `!isAtBottom` and never for my own sends (§7.6) |
| `SharedCheckFlowTests` | §7.1 synthetic card lifecycle + pre-gate ordering + §7.3 banner masking + **returning-user-with-link** (no auto-DOWN, key consumed once by `drainPendingIntents`) |
| `RouterTests` | §7.0 allowed stack pairs incl. `friends → userProfile → report` (§15.1), queue drain on dismiss, `go` dismisses all levels first; §7.4 `resolveCheckRoute` × 4 outcomes × 4 entry points (push, notification tap, deep link, drain); `drainPendingIntents` ordering check → token → username and delete-before-dispatch |
| `SessionStorageTests` | **only if `SessionStorage` is kept (§6)**: Keychain round-trip + `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` attribute assertion |
| `ModelDecodingTests` (addendum) | every fixture also decoded from `Task.detached` (proves `nonisolated` conformances, §1.0); `FeedRaw`/`SquadsRaw` JSON round-trip with `ID`-keyed dictionaries; `FriendsEventPayload` from a captured `get_friends_events` array; `SharedCheck` with and without `mystery`; `RedeemResult` for all three JSON shapes |

Store tests use `AppEnvironment.fake(.busyFriday)` (§11.3) and a `StubURLProtocol` for `DowntoAPI`; PostgREST itself isn't stubbed — store logic that massages arrays is exercised through `apply()`/`rebuild()`/`project()`, which take plain values.

### 11.2 Snapshot

`ComponentGallerySnapshotTests` (XCTest + swift-snapshot-testing): renders `ComponentGallery` (every DesignSystem component × every state: `DownToggle` idle/pressed/active/waitlisted/pending/closed, `CheckEntry` idle/new/mine/down/waitlisted/expired/mystery/highlighted (DESIGN §4.1 table) in **both `checkText` faces** (DESIGN §2.3), `EventEntry` idle/mine/down/new/past, `AvatarLetter` 5 sizes × you/other/mystery, `AvatarStack`, `SquadRow` with/without unread and fading/ended, `ExpiryRule` at 10/50/80/100 %, `NewFlag`, `MysteryFrame`, `Slip` plain/action/error, `Folio` with and without the unread dot, `Skeleton` and `ErrorColophon`, plus a Reduce Motion row and a `.accessibility1` row) at iPhone 17 Pro size, `precision: 0.98`. Record with `make snapshot-record`. This is the "someone turned the broadsheet back into cards" alarm.

### 11.3 Fixture world and previews

```swift
enum Fixtures {
    enum World { case busyFriday, emptyNewUser, mysteryDay }
    struct Built { var me: Profile; var feed: FeedRaw; var squads: SquadsRaw; var chats: [SquadID: ChatRaw]; var notifications: [AppNotification]; var friends: FriendsRaw; var now: Date }
    static func world(_ w: World, now: Date = Fixtures.friday) -> Built
    static let friday = Date(2026-05-01T18:00 America/Los_Angeles)
}
```
`.busyFriday` (loaded directly into store raw state — **no per-client protocol fakes, no trigger re-implementation**):
- 5 profiles: `kat` (me, avatar K), `sara`, `devon` (FoF via Sara), `mo`, `lena`.
- 6 checks: "movie night?" (open-ended, sara, 2 down incl. me, squad exists), "rooftop tn 9pm" (timer 4h, 75 % elapsed → danger, mo), "karaoke sat" (capped 4, full, I'm waitlisted), "???" mystery by devon (event date = friday + 3, guests hidden, location "somewhere in bushwick"), "climbing sun 10am" (mine, 0 responses), "who's got a car" (lena, expires in 20 min, isNew).
- 2 squads: "movie night" (3 members, unread: last message from sara "omw 🍿"), "karaoke sat" (waitlisted, no unread) with chat raw for both (12 + 4 messages incl. "sara just entered the chat" system rows, one image message).
- 3 notifications: `squad_message` (unread), `check_response` on climbing (unread), `friend_request` from lena (unread, pinned).
- Friends: sara, mo accepted; lena incoming; devon FoF suggestion.

`.mysteryDay` is `.busyFriday` with `now = friday + 3` so the mystery check is `.revealedToday` — the preview for the scramble→settle reveal. `.emptyNewUser` drives empty states and onboarding previews.

`AppEnvironment.fake(_:)` builds live-shaped stores with `raw` pre-filled and `rebuild()` run, `realtime.status = .offline`, `api` on `StubURLProtocol` (every route → 200 `{}`), `supabase` pointed at `http://127.0.0.1:1` (never called; the stores' network methods early-return when `env.isFake`). Every screen and component `#Preview` is `.environment(AppEnvironment.fake(.busyFriday))`. **The previews are the design-review surface for "make it beautiful".**

`FakeWorldBoot.swift` (`#if DEBUG`): if `ProcessInfo.arguments` contains `-DT_FAKE_WORLD` followed by a world name, `DowntoApp` swaps in `AppEnvironment.fake(world)` with `session.state = .signedIn(me)` and `Gate == .main` — used by the no-network UI smoke test.

### 11.4 UI smoke

- `FakeWorldSmokeTests` (runs in CI, no network, ~30 s): launch `-DT_FAKE_WORLD busyFriday` → feed shows 6 entries → "climbing sun 10am" (mine) has no DOWN toggle, its response row reads "no responses yet" → tap DOWN on "who's got a car" → the pill reads "DOWN ✓" and the entry band is `Color.checkDown` → tap the response row on the event entry → slip "lobby's coming to iOS soon ✶" (§15.1) → open Squads → "NEW MESSAGES" section has "movie night" → open chat → the newest message is on screen without scrolling (bottom-anchored, §7.6) → **prepend check**: the fixture chat has 300 rows; note the frame of the topmost visible message row (`XCUIElement.frame`), swipe down to the top so `loadOlder` fires, wait for the row count to grow by 100 → the *same* row (by accessibility identifier `msg-{id}`) has the same `frame.minY` ± 2 pt — "prepend 100 rows keeps the visible message in place" → scroll back to bottom → type "omw" → send → the row appears at the bottom → the composer's poll glyph is present and disabled (§15.1) → swipe right from the left edge → chat pops, the Folio is visible again with its original safe-area height.
- `LiveSmokeTests` (`make ui-test-live`, needs `supabase start` + `npm run dev` + Mailpit): launch `-uiTestLogin kat@test.com`; the app in that mode (`#if DEBUG`) fetches the OTP from `http://127.0.0.1:54324/api/v1/search?query=to:kat@test.com` itself; asserts ≥ 1 card, taps DOWN on the first non-own check, asserts "DOWN ✓", opens Squads, asserts a row exists. This is the "does the real backend still fit" check, run before merging anything touching `Data/`.

---

## 12. Build & CI

```make
# apps/ios/Makefile
SHELL := /bin/bash
.SHELLFLAGS := -o pipefail -c               # xcodebuild's exit status must survive the pipe
SIM ?= platform=iOS Simulator,name=iPhone 17 Pro   # no OS= pin: the runtime on the dev Mac is 26.3.x; pinning 26.2 makes xcodebuild fail to find a destination. Override: make build SIM="platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3"
PROJ = Downto.xcodeproj
DD   = .build
PRETTY = (command -v xcbeautify >/dev/null && xcbeautify || cat)   # xcbeautify is optional and NOT installed by default; never `brew install` from a make target

gen:            ; xcodegen generate --spec project.yml
resolve: gen    ; xcodebuild -resolvePackageDependencies -project $(PROJ) -scheme Downto-Local -derivedDataPath $(DD)
build: gen      ; xcodebuild build -project $(PROJ) -scheme Downto-Local -destination "$(SIM)" -derivedDataPath $(DD) CODE_SIGNING_ALLOWED=NO 2>&1 | $(PRETTY)
test: gen       ; xcodebuild test -project $(PROJ) -scheme Downto-Local -destination "$(SIM)" -derivedDataPath $(DD) CODE_SIGNING_ALLOWED=NO -only-testing:DowntoTests 2>&1 | $(PRETTY)
test-domain:    ; scripts/test-domain.sh          # assembles Downto/Domain + DowntoTests/Domain into a temp SwiftPM package and runs `swift test` on macOS (~10 s)
ui-test: gen    ; xcodebuild test ... -only-testing:DowntoUITests/FakeWorldSmokeTests 2>&1 | $(PRETTY)
ui-test-live:   ; (cd ../.. && supabase start && npm run dev &) ; xcodebuild test ... -only-testing:DowntoUITests/LiveSmokeTests 2>&1 | $(PRETTY)
snapshot-record:; SNAPSHOT_TESTING_RECORD=all $(MAKE) test
run: build      ; xcrun simctl boot "iPhone 17 Pro" || true; xcrun simctl install booted $(DD)/Build/Products/Debug-Local-iphonesimulator/Downto.app; xcrun simctl launch booted xyz.downto.app
screenshot:     ; xcrun simctl io booted screenshot /tmp/downto.png
clean:          ; rm -rf $(DD) $(PROJ)
```

`scripts/test-domain.sh` creates `/tmp/DowntoDomain/Package.swift` (one library target symlinking `Downto/Domain`, one test target symlinking `DowntoTests/Domain`, `swift-tools-version: 6.2`, `swiftSettings: [.defaultIsolation(MainActor.self), .enableExperimentalFeature("StrictConcurrency")]` — the same isolation default as the app, so the package proves that every Domain type/function really is `nonisolated` and that nothing in Domain names a type outside Domain), runs `swift test`, and fails loudly if any file in `Domain/` has an `import` other than `Foundation` (`grep -L`). Because `ID.swift`, `Enums.swift`, `Route.swift`, `SessionState.swift`, `Presence.swift`, `GateProfile` and `NotificationFacts` all live in `Domain/` (§1.0), the package type-checks standalone; `DowntoTests/Domain` may use only `Testing` + `Foundation` + Domain types (no `Fixtures.world` — Domain tests build their inputs inline; `MysteryLeakTests` is a *Stores* test for that reason). This is the fast CI path for the highest-risk logic without a real package split.

`scripts/check-enums.sh` (§3.2) runs in `make test` and diffs every `TolerantEnum`'s cases against the last `CHECK (… IN (…))` for its column in `supabase/migrations/`.

**Fresh-agent green-build check**:
1. `xcodegen` must be on PATH (version in `.tool-versions`); `xcbeautify` is optional — the Makefile falls back to `cat`. Do not install tools from inside a build task.
2. `cd apps/ios && cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig` (empty team is fine for simulator).
3. `make gen build test` → exit 0, prints `** BUILD SUCCEEDED **` and `Test Suite 'DowntoTests' passed`.
4. `make test-domain` → passes in < 30 s.
5. `make ui-test` → 1 green XCUITest.
6. Visual: `make run screenshot` → `/tmp/downto.png` shows the cream feed.
7. Before the first TestFlight build: `curl -sI https://downto.xyz/.well-known/apple-app-site-association | grep -i 'content-type: application/json'` succeeds (§7.2), and `Secrets.xcconfig` has the `DEVELOPMENT_TEAM` that the AASA's `appID` uses.

**CI** (`.github/workflows/ios.yml`, on PRs touching `apps/ios/**`): `macos-26` runner, Xcode 26.2 selected, SPM cache keyed on `Package.resolved`, jobs in order: `test-domain` (fast fail) → `build` → `test` → `ui-test`. `Downto.xcodeproj` is gitignored; only `project.yml` is committed, so no pbxproj conflicts. Nightly: `xcodebuild archive` with `Downto-Prod` + upload to TestFlight (deferred until signing secrets exist). The `ios/` Capacitor project is excluded from this workflow.

---

## 13. Design system tokens — the naming map into `DESIGN.md`

**Every value lives in `DESIGN.md`; none is restated here.** This section says where each token family is defined in code, which `DESIGN.md` section owns it, and which earlier names in this document it replaces (DECISIONS #2–#9). A view that names a hex, a point size or a spring constant inline is a review defect.

**Colour — `DesignSystem/Tokens/Color+DT.swift`** (`DESIGN.md` §1.2–§1.4, §8). Every token is an **Asset Catalog colour set** (`Any` + `Dark` slots from day one; v1 ships light-only via `.preferredColorScheme(.light)`) exposed as `extension Color` (`Color.paper`, `.card`, `.surface`, `.deep`, `.ink`, `.inkMuted`, `.inkExpired`, `.inkDim`, `.inkFaint`, `.rule`, `.ruleLight`, `.ruleMid`, `.dt`, `.dtInk`, `.dtInkOnSurface`, `.onDt`, `.dtFaint`/`.dtSubtle`/`.dtLight`/`.dtMid`, `.pool`/`.poolInk`, `.squad`/`.squadInk`, `.danger`/`.dangerInk`, `.success`/`.successInk`, `.warn`/`.warnInk`, `.info`, `.unreadSquad`, `.newLime`/`.newInk`, the card tints `.checkMine`/`.checkDown`/`.checkNew`/`.checkNewRule`/`.waitlistBg`/`.downIdle`/`.downIdleRule`, `.heroWash`/`.heroWashDown`). The same file holds the **`\.paperStock` environment key** and the stock-resolving `ShapeStyle`s (`.dtInk`, `.inkMuted`, `.squadInk`, `.dangerInk`, `.successInk`, `.warnInk`, `.poolInk`) that pick the surface variant on `surface`/`deep` (`DESIGN.md` §1.2 "the stock rule"), and the Increase Contrast / Reduce Transparency remaps (`DESIGN.md` §8). Retired names from earlier drafts of this document → new: `DT.Color.accent` → `Color.dt`; **`onAccent` (white) → `Color.onDt` (ink `#2A2A1A` — white on magenta is 2.8:1)**; `bg` → `paper`; `text` → `ink`; `muted`/`dim`/`faint` → `inkMuted`/`inkDim`/`inkFaint`; `border`/`borderLight`/`borderMid` → `rule`/`ruleLight`/`ruleMid`; `accentFaint`/`Subtle`/`Light`/`Mid` → `dtFaint`/`dtSubtle`/`dtLight`/`dtMid`; `downIdleBg`/`downIdleBorder` → `downIdle`/`downIdleRule`; `checkMineBg`/`checkDownBg`/`checkNewBg`/`checkNewBorder` → `checkMine`/`checkDown`/`checkNew`/`checkNewRule`; `newBadgeBg` → `newLime`; **`newBadgeText #FF00D4` → `newInk #C400A6`** (AA); `squadUnreadDot` → `unreadSquad`; `eventWash`/`eventWashDown` → `heroWash`/`heroWashDown`. The `*Ink` text variants, `inkExpired` and `waitlistBg` are additions from the contrast audit — "no invented colours" is superseded by "no colour below AA".

**Layout — `DesignSystem/Tokens/Layout.swift`** (`DESIGN.md` §3): `Space.*` (4 pt grid: `xxs 2 … huge 48`; page gutter **20**, chat gutter 16, entry gap **0** — entries are separated by 1 pt `Color.rule` hairlines), `Radius.*` (`none 0 · xs 6 · s 10 · m 12 · l 16 · sheet 24 · pill 999`; **feed entries are radius 0** — the earlier `Radius.card 16` / `cardNew 4` and `Space.gutter 12` / `cardPad 14` / `cardGap 8` are gone), `Elevation.*` (`flat` / `laid` / `lifted`; no ambient shadows on the page).

**Typography — `DesignSystem/Tokens/Typography.swift`** (`DESIGN.md` §2; DECISIONS #5, #6). `DTTextStyle` is the `DESIGN.md` §2.1 table as an enum (`masthead`, `wordmark`, `display`, `title`, `checkText`, `headline`, `numeral`, `displayCount`, `body`, `bodySmall`, `meta`, `label`, `button`, `buttonLarge`, `badge`, `system`, `kaomoji`) and `Font.dt.<style>` resolves one. The earlier `.dtHeading(18)` / `.dtBody()` / `.dtLabel()` / `.dtButton()` modifiers and `DTFont.inter/mono` are retired.

- **Files**: `InterVariable.ttf` (variable, `wght` + `opsz`) and static `IBMPlexMono-{Regular,Medium,SemiBold,Bold,Italic}.ttf` (§1.1 `UIAppFonts`). The earlier claim that a variable font cannot be weight-driven from SwiftUI is true only of `.weight()`; `UIFontDescriptor` variation attributes do drive the axes, which is what we use.
- **Pipeline** (the only way a `Font` is made): `UIFontDescriptor` — Inter: `[.name: "InterVariable", kCTFontVariationAttribute: [wght: …, opsz: …]]` (+ `kNumberSpacingType` / `kMonospacedNumbersSelector` where the style is tabular); Plex: the static cut by PostScript name — → `UIFont(descriptor:size:)` → **`UIFontMetrics(forTextStyle: style.relativeTo).scaledFont(for:compatibleWith:)`** → `Font(_:)`. That `scaledFont` call is the *single* Dynamic Type scaling step: never `Font.custom(_:size:relativeTo:)` (it cannot carry variation attributes and would scale twice), never `@ScaledMetric` on a size, **no clamp** on the scale factor (the earlier `min(scale, 1.3)` is withdrawn; `DESIGN.md` §8's Dynamic Type adaptations are the answer at accessibility sizes). `Font.dt.*` are computed, and the `.dtFont(_:)` view modifier reads `\.dynamicTypeSize` → `UITraitCollection(preferredContentSizeCategory:)` so a size change re-resolves in the same render. Bold Text (`\.legibilityWeight == .bold`): `wght + 100` / one Plex cut up.
- **PostScript names** (what `UIFontDescriptor(name:)` / `UIFont(name:)` match — not the file names): `InterVariable`; `IBMPlexMono` (Regular), `IBMPlexMono-Medm`, `IBMPlexMono-SmBld`, `IBMPlexMono-Bold`, `IBMPlexMono-Italic`. `TypographyTests` asserts `UIFont(name:size:) != nil` for all six and that the Inter descriptor resolved for `Font.dt.display` carries `wght == 600` / `opsz == 28`, so a renamed file or a dropped axis fails CI rather than silently falling back to Helvetica. It also renders `Font.dt.body` at `.xxxLarge` and `.accessibility5` and asserts the resolved point size equals `UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 14, compatibleWith:)` — one scaling step.
- **`checkText` face**: `DTTextStyle.checkText.face: CheckTextFace = .inter` (Inter 19/24/500) with `.mono` (Plex Mono 15/22/400) one line away; `ComponentGallery` renders both and the product owner compares them on device (`DESIGN.md` §2.3).
- The kaomoji cascade (`DESIGN.md` §2.2) and `Text.dtTracking` / `.dtTracked` live in the same file.

**Motion — `DesignSystem/Motion.swift`** (`DESIGN.md` §5, §8): `enum DTSpring { page, settle, snap, ink, stamp, reveal }` (the app cannot call it `Spring` — SwiftUI owns that type; `DESIGN.md` writes `Spring.x` for brevity and means `DTSpring.x`) and `Motion.resolve(_:)`, which maps every spring with damping < 0.86 to `DTSpring.settle` and disables offsets/scale/masks under Reduce Motion so call sites never branch. `DTAnimation.snappy/.pop/.settle` are retired; the fixed curves are written `.smooth(duration:)` / `.snappy(duration:)` / `.linear(duration:)` — the labelled forms.

**Haptics — `DesignSystem/Haptics.swift`** (`DESIGN.md` §6): the `.sensoryFeedback` map of §6.1 is applied at call sites in its exact spelling — `.impact(flexibility:intensity:)` / `.impact(weight:intensity:)` / `.success` / `.warning` / `.error` / `.selection`; **`.impact(.medium)` does not compile** (`SensoryFeedback` has no positional impact form). The file holds `actor HapticEngine` (`CHHapticEngine`, isolated; handlers hop back with `Task { await self?… }`) and `HapticPattern.squadFormed` / `.mysteryReveal` (patterns A and B), plus the Profile "Haptics" toggle gate. `DTHaptic.down/.select/.success/.error` are retired.

**Components — `DesignSystem/Components/`**, each with a `#Preview` in `ComponentGallery`; anatomy, states and motion are `DESIGN.md`'s, the Swift signatures are:
- `DownToggle(state: DownToggleState, onTap:)` — `idle / pressed / active / activePressed / waitlisted(position:) / pending(target:) / closed` (`DESIGN.md` §4.3; the event-only secondary pills `JOIN SQUAD → / WAITLIST → / REQUESTED` are a separate `SquadCTA` view, M2).
- `AvatarLetter(presence: Presence, size: .micro/.inline/.small/.medium/.display, ring: Color?)` — sizes 20/24/28/40/72 (`DESIGN.md` §4.4; the earlier `.inline(20)/.small(24)/.medium(28)/.large(40)` set is gone). `presence` is the masking boundary (§9): `.person(isMe: true)` → `Color.dt` fill + `Color.onDt` letter; other → `Color.ruleLight` + `Color.ink`; `.masked` → kaomoji at 0.36× diameter (min 9) or "?" at `micro`/`inline`.
- `AvatarStack(_ presences: [Presence], ring: Color, max: Int = 3)` — overlap −6 (≤ 28) / −8 (40), "+N" `Font.dt.badge`, tap fan-out (`DESIGN.md` §4.4).
- `ExpiryRule(state: ExpiryState, isTopOfSection: Bool)` — full-bleed 2 pt → 3 pt past 75 %, shimmer only on the top timed entry (`DESIGN.md` §4.2). Replaces `ExpiryBar`.
- `NewFlag` (`DESIGN.md` §4.6; replaces `NewBadge`), `MysteryFrame(progress:)` (the "?" frame, `DESIGN.md` §4.1; replaces `MysteryBorder`), `Pill` (vibe / mention / setting chips, `DESIGN.md` §4.7), `SectionLabel`, `MetaLine(parts:)` joined with " · " in `Color.inkFaint` separators.
- `Slip(text:action:style:)` + `SlipHost` (`DESIGN.md` §4.8; replaces `Toast` — the queue is still `Stores/ToastCenter.swift`, `toasts.show(_:key:style:)`).
- `Grain` (`DESIGN.md` §1.4: `grain-256`, 0.03 multiply, mounted once on the root `ZStack` and once per sheet inside `.dtSheet`; replaces `GrainOverlay` / `.dtGrain()`).
- `Folio` (`DESIGN.md` §4.11; replaces `BottomNav`), `Masthead` (`DESIGN.md` §4.12; replaces `FeedHeader`), `Pull` (`DESIGN.md` §4.14; replaces `DTRefreshable`).
- `LinkifiedText(text:mentions:)` → `AttributedString`: URLs and `@username` in `.dtInk` weight 500, no underline on the feed; 1 pt `Color.ruleMid` underline on links in chat (`DESIGN.md` §4.1, §4.10); masked mode shows "@???" untinted.
- `EmptyState(headline:line:cta:)` — the "✶" colophon page with `WobbleRenderer` headlines (`DESIGN.md` §4.13; no kaomoji parameter — kaomoji are for mystery presences only), `ErrorColophon(cause:retry:)`, `Skeleton(.feed/.squads/.notifications/.chat/.sheetRows)` (`DESIGN.md` §7.15).
- `DTButton(variant: .primary/.outline/.inverted/.text, size: .button/.buttonLarge)` — the four CTA idioms `DESIGN.md` uses: `primary` = `Color.dt` fill / `Color.onDt` text, pill (SEND CODE, POST, STILL DOWN); `outline` = 1 pt `Color.ink` stroke / `Color.ink` text (CAN'T MAKE IT, GO TO SQUAD →); `inverted` = `Color.ink` fill / `Color.paper` text (SEND REPORT); `text` = `.dtInk` text only in a 44 pt target (OPEN →, ACCEPT, EDIT). Press: scale 0.97 in 60 ms ease-out, release `DTSpring.ink`. The earlier `.highlight` variant and `.small/.medium/.large` sizes are gone.
- `Sheets/DTSheet.swift` — the `.dtSheet(detents:)` modifier including the drag handle (`DESIGN.md` §4.9). There is no `DTConfirmDialog` and no `DragHandle` component.
- `ScrambleRenderer`, `WobbleRenderer` (`TextRenderer`s, `DESIGN.md` §5.9).

---

## 14. Beauty budget (M1, non-negotiable) — index into `DESIGN.md`

`DESIGN.md` is the beauty budget; every motion, haptic and depth value is specified there and reviewed on `ComponentGallery`. This section is the index, plus the *structural* notes that belong here (what the store exposes, what the compiler needs, what iOS 26 does). Where an earlier draft of this section specified a motion that `DESIGN.md` contradicts, `DESIGN.md` wins (DECISIONS #10–#14, #17–#20, #22); those items are marked ✂.

1. **DOWN toggle** → `DESIGN.md` §4.3 (the stamp: radial fill from the touch point, `DTSpring.stamp` overshoot, the band dye 60 ms after the apex, the rule drawing down; un-down; the waitlist landing; the promotion reverse) and §6.1 (touch-down `.impact(flexibility: .soft, intensity: 0.5)`, apex `.impact(flexibility: .rigid, intensity: 0.9)`, `.success` on server ack). ✂ the `.spring(duration: 0.35, bounce: 0.35)` morph, `.blurReplace` ✓, the 0.3 s crossfade and the `.impact(.medium)` (which does not compile). Structure: haptics fire in the view from state (`myResponse`, `inflight[id] == nil`), never in the store (§4.5); the touch point comes from a `DragGesture(minimumDistance: 0)` as `.simultaneousGesture` under the `Button` (`DESIGN.md` §10); the row's press state and the toggle's are isolated per the gesture precedence in `DESIGN.md` §4.1.
2. **Realtime entry lighting** → `DESIGN.md` §5.1: a friend's DOWN rolls the count with `.contentTransition(.numericText())` and flashes `Color.dtSubtle → tint` over 600 ms; the avatar inserts with `DTSpring.stamp`. Structure: driven by `apply(TableChange)` → `rebuild()` (§4.7); no separate "pulse" state.
3. **Entry insertion / removal / reorder** → `DESIGN.md` §5.1 (`.opacity + offset(y: −8)` insertion, 160 ms opacity removal, `DTSpring.settle` reflow, the first-load stagger only on the skeleton → data transition, the sort-change dip, the "N new ↑" hold while scrolled). ✂ `.blurReplace + .move(edge: .top)`. Structure: `FeedStore.heldInserts` + `isScrolledDeep` (from the feed's `onScrollGeometryChange`) implement the hold; `FeedStore.firstLoadStaggerPending` is true exactly once per session.
4. **NEW flag** → `DESIGN.md` §4.6 (`NewFlag` bleeding off the screen edge, `Color.newLime`/`Color.newInk`, slide-in on first appearance) and §4.1 seen-tracking (`onScrollVisibilityChange(threshold: 0.6)` + 1.5 s → `seenIds`; the flag retires on the *next* load with the `Color.checkNew → Color.card` settle). ✂ `Radius.cardNew` — entries have no corners. Structure: `dt.seenIds` persisted next to `dt.lastSeenFeedAt`.
5. **Expiry rule** → `DESIGN.md` §4.2 (`ExpiryRule`: 2 pt → 3 pt past 75 %, `Color.dt → Color.danger` crossfade, 4.0 s shimmer on the top timed entry only, `.numericText(countsDown: true)` on "Xh left"). Structure: the 30 s tick is `ExpiryClock` (§4.8); the seconds under 5 min are a view-local 1 s `TimelineView`.
6. **Sheets** → `DESIGN.md` §4.9 (`.dtSheet`: `Color.surface` + grain, 24 pt corners, the widening handle, `[.fraction(0.72), .large]`, block stagger, system dim backdrop). ✂ the `ultraThinMaterial` backdrop and `.fraction(0.78)`. Structure: §7.0 stacking rules; `presentationContentInteraction(.scrolls)`; the iOS 26 edge-to-edge check on the `DESIGN.md` §10 list.
7. **Folio** → `DESIGN.md` §4.11 (three typeset labels, the 2 pt `Color.dt` underline sliding with `DTSpring.page` via matched geometry *on the underline*, `.selection`, the `Color.unreadSquad` dot popping with `DTSpring.stamp`, intrinsic height, `.isTabBar`) and §4.12 for the "+" glow/ripple (8 → 18 pt over 2.0 s + ripple). ✂ the magenta sliding highlight block and the 12 pt / 1.6 s glow. Structure: `router.hidesFolio` (§7), the `safeAreaInset` collapse (§7.5), the preference-key height.
8. **Chat** → `DESIGN.md` §4.10 (a transcript: message groups, your groups marked by a 2 pt `Color.dt` rule + `Color.dtFaint` band, system lines between ✶ ✶ arriving with `DTSpring.page`, images with reserved aspect, the composer, every lifecycle strip, the "↓" circle). ✂ "outgoing bubbles pop in from 0.85 scale" — there are no bubbles; a sent message is an optimistic row at 0.6 opacity until acked. The `.sensoryFeedback(.success, trigger:)` on "X just entered the chat" rows is ✂ too (`DESIGN.md` §6.1: no haptic on incoming messages). What survives here: system rows are dropped before projection in a mystery-locked chat (§9.3), and §7.6's scroll contract.
9. **Mystery reveal** → `DESIGN.md` §5.7 (fuse → flip → `ScrambleRenderer` unscramble → guests rise with the `displayCount` count-up, ≈ 2 s, `DTSpring.reveal`, `HapticPattern.mysteryReveal`; the author's reduced reveal). ✂ the 6-phase `PhaseAnimator` + `.blurReplace`. Structure: the trigger is `FeedStore.revealedNow` (§4.8) or a first render with `.revealedToday`, once per check per device (`dt.revealedSeen`); `Censor.wingdings(seed:)` still supplies the symbol set the renderer cycles through.
10. **Countdowns** → `DESIGN.md` §4.10 (chat header) and §7.7 (squad rows): `.numericText(countsDown: true)`, `Color.dangerInk` under 1 h / 24 h, `Font.dt.numeral` at 20 under 1 h in the header. ✂ the breathing opacity 0.8 → 1 (`DESIGN.md` §8: text opacity is never below 1.0). Structure: `SquadCountdown` (§10.4) is the only source of the label.
11. **Grain** → `DESIGN.md` §1.4: `Grain` at **0.03** multiply, mounted once on the root `ZStack` (above the Folio and the Create overlay) and once per sheet inside `.dtSheet`; removed under Reduce Transparency and Increase Contrast. ✂ 4 % per surface via `.dtGrain()`.
12. **Pull-to-refresh** → `DESIGN.md` §4.14 (`Pull`: the "PULL / RELEASE / REFRESHING" label and the 2 pt `Color.dt` rule growing from the centre, 72 pt threshold, the 56 pt `safeAreaInset` hold with `DTSpring.snap`, minimum 500 ms, `.impact(weight: .light)` when armed and `.impact(flexibility: .soft)` when new items land, the OFFLINE variant). ✂ the three spinning "✶" glyphs and the 80 pt threshold. Structural notes that stand: `.refreshable` cannot be restyled, so it is **custom, in M1** and used nowhere; the `ScrollView` **must** carry `.scrollBounceBehavior(.always)` (a short feed on a tall phone does not bounce under `.automatic`, so the gesture would never fire for a new user with two entries); overscroll is read with `.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, new in … }`; release is detected via `onScrollPhaseChange` `.interacting → .decelerating/.idle` while pull ≥ 72; the hold is a top inset, nothing more (there is no "disable `scrollTargetBehavior`"). Fallback if it misbehaves on a device before ship: `.refreshable` with `.tint(Color.dt)` — but the snapshot test pins the custom one.
13. **Onboarding** → `DESIGN.md` §7.1–§7.3 (baseline-rule fields, the OTP slots popping 1.3 → 1 in 60 ms, the shake, the live `CheckEntry` preview in `mine` state with the avatar flipping on the initial). Gate transitions between onboarding screens cross-dissolve with `DTSpring.settle` (the session-expiry swap in `DESIGN.md` §7.1 uses the same). Structure: the preview is the real `CheckEntry` bound to a `FeedCheck` built from the draft profile.
14. **Deleted check** → `DESIGN.md` §7.5 / §4.13: `DeletedCheckView` picks a random quip from the ported `QUIPS` list ("this check is sleeping with the fishes.", …) rendered through `WobbleRenderer`, and a dismissal label from `DISMISSALS` ("press f", "rip", "pour one out", …) as the whole `Font.dt.buttonLarge` button — same arrays as the web file, ported verbatim; "REVIVE IT →" for the owner.
15. **Empty states** → `DESIGN.md` §4.13: the "✶" colophon (spinning once on first appearance), a headline from the per-surface pool through `WobbleRenderer`, one line, one text link. ✂ date-seeded kaomoji — kaomoji are reserved for mystery presences.
16. **iOS 26 system surfaces — accepted as-is, no fighting Liquid Glass.** The following are system-rendered and cannot take the cream tokens; the `ComponentGallery` review treats them as **out of scope for the brand pass** and a reviewer may not file "looks like stock iOS" against them: the long-press `.contextMenu(menuItems:preview:)` (the preview is ours, the menu is glass) and every `.confirmationDialog` (we set `.tint(Color.dt)` and nothing else — every confirm in the app is the system dialog, `DESIGN.md` §7.8), the keyboard (we set `.keyboardType` / `.submitLabel` only), `ShareLink`'s share sheet, `PhotosPicker`, `PasteButton` (restyled only through `.buttonBorderShape(.capsule)` + `.tint`, `DESIGN.md` §7.6), the `.graphical` `DatePicker` in the poll composer (M2), the system alert used for "delete account" type-to-confirm, and the OTP autofill bar. Everything else the user sees — sheets (`.dtSheet`), the tab bar (`Folio`), the chat header (`ChatHeader`, §7.5), the navigation bars (hidden), toasts (`Slip`), the "⋯" (which opens `CheckActionsSheet`, not a `Menu`) — must use the tokens. Rule of thumb: if it has a Liquid Glass background and we did not draw it, it is accepted; if we drew it, it is cream. The iOS 26 scroll-edge effect is suppressed under the `Masthead`, the `Folio` and the chat insets with `.scrollEdgeEffectStyle(.hard, for:)` (`DESIGN.md` §4.11–§4.12).
17. **SQUAD FORMED and "you're in"** → `DESIGN.md` §5.6 + §6.2 pattern A. Structure: `FeedStore.squadOutcome[checkId]` (§4.5, §4.10) is the trigger; the stamp layer is a root `ZStack` layer in `MainShell` so it can play over any tab; the notification-path slip (§5.3) is deduped by key.

Haptics are centralised in `Haptics.swift` (§13) and go through `.sensoryFeedback` where a trigger value exists, prepared `UIImpactFeedbackGenerator`s only inside gestures, and `HapticEngine` for the two composed patterns (`DESIGN.md` §6).

**Accessibility rule (so the beauty budget survives review)** → `DESIGN.md` §8 is the specification (contrast audit, the `inkDim`/`inkFaint` rule, no opacity on text, Increase Contrast and Reduce Transparency remaps, Dynamic Type adaptations, hit targets, Reduce Motion, VoiceOver). Structural notes: `Motion.resolve(_:)` (§13) makes Reduce Motion a token-layer concern so call sites never branch; every looping animation (expiry shimmer, "+" glow, "?" frame wave, skeleton shimmer) reads `\.accessibilityReduceMotion` through it and draws its final frame; `ScrambleRenderer` / `WobbleRenderer` draw their final state; countdowns expose `.accessibilityValue` updated on tick (VoiceOver must not re-announce every `.numericText` frame); a masked `Presence` reads as "mystery host" / "hidden member", never the kaomoji characters; `AvatarStack` is one element ("{n} people: {names…}" / "{n} people, hidden until the day"); the `ExpiryRule` is `accessibilityHidden` (the "Xh left" label carries the value); the `NewFlag` is a trait on the entry. ✂ the earlier "`dim` on `bg` is 3.2:1, acceptable for 10 pt labels" — it is 3.45:1 and `inkDim` may carry only decorative or redundant text; section labels and every label the user reads are `inkMuted` (`DESIGN.md` §8). `ComponentGallery` has a Reduce Motion row and an `.accessibility1` row so the snapshot test captures both.

---

## 15. Milestone 1 scope — "foundation + core loop"

**In**

| Area | Included |
|---|---|
| Design system | Everything `DESIGN.md` specifies for the M1 surfaces below (§13 map, §14 index). `ComponentGallery` + snapshot test. |
| Auth / onboarding | AuthView (email → 8-digit OTP, gmail nudge, Resend / Different email, Terms/Privacy open web, shared-check and `?add=` banners), ProfileSetup (display name ≤ 30, username `^[a-z0-9_]{3,20}$`, 23505 → "that one's taken", live `CheckEntry` preview), EnableNotifications, FriendGate (search, add, pinned shared-check author, Continue → `onboarded`), FirstCheck = `CreateOverlay` in "first" mode (or skip → glowing "+"). Timezone sync. Sign-out with push unregister. Delete account. Sweep case. |
| Feed | `Masthead`, pinned timed tier + chrono tier, recent/upcoming sort, `NewFlag` + seen-tracking, Hidden (N) section, empty state, `Pull`, scroll-to + 3 s highlight, ExpiryClock + day-change reveal, the "N new ↑" hold. **Read-only `EventEntry`** from `get_friends_events` (hero + wash, byline, title/date/venue/vibes, DOWN toggle via `saved_events.is_down`, "X + N others down" row excluding the poster; states idle / new / mine / down / imminent / past / highlighted) so the feed shape matches web for real beta users; tapping the response row is a no-op with a "lobby's coming to iOS soon ✶" slip. |
| Interest checks | `CheckEntry` full parity (`ExpiryRule`, "LETTERBOXD →" text link, byline with "via", `LinkifiedText`, when · where `MetaLine`, "⋯" + long-press context menu for non-owners, "X + N others down" / "no responses yet", `DownToggle` states, OPEN SQUAD → link, co-author strip, inline comments when ≥ 1, `MysteryFrame`, every state in `DESIGN.md` §4.1), `CheckDetailView` (zoom push: full text, by-line with co-authors, DOWN + WAITLIST grids, comments transcript with composer, full-width DOWN bar, Edit for author/co-author), `CreateOverlay` **IDEA tab only** (display-size editor, setting chips with inline expanders, `WhenField`, where, timer 1h/4h/12h/24h/∞, squad size 3/4/5/6/8/∞, @mention co-authors, Mystery toggle requiring date + location, the POST text flight, draft restore), `EditCheckSheet` (`DESIGN.md` §7.5: text/when/where/co-authors, read-only TIMER / SQUAD / MYSTERY rows, Share via `ShareLink` after `markShared`, Delete → archive + "check removed — undo?" slip → revive), `CheckActionsSheet` (hide / report), `DeletedCheckView`, `ReportSheet` for `.check` + `.profile`. |
| DOWN | Optimistic toggle with restore; the stamp choreography, SQUAD FORMED / "you're in" strip / waitlist landing (`DESIGN.md` §4.3, §5.6); the only slip on the optimistic path is the waitlist one; realtime entry lighting; membership refresh after trigger. |
| Squads | `SquadsView` (NEW MESSAGES / UPCOMING / FADING ✶, countdown, preview, time, waitlisted badge, unread dot, fading/ended row treatment, "no squads yet."), per-squad realtime previews, `SquadChatView` (`ChatHeader` with avatars + countdown, transcript rows: text/system/image, older-message paging, fullscreen `ImageViewer`, `ComposerSlot` with @mention autocomplete + image attach + client resize + signed URLs + every lifecycle strip (waitlist / grace / < 1h EXTEND / ended REVIVE / kicked / promoted), per-squad draft persistence, read cursor, join-request banner Accept/Decline, leave confirm, long-press **Copy** on messages), `DateConfirmBar` (STILL DOWN / CAN'T MAKE IT), `DateProposalSheet` (ASK EVERYONE / LOCK IT → `set-date`), `SquadSettingsSheet` (members preview, See members, size stepper → `update-size`, Extend +7 days, the DATE row — **propose / change / clear via `set-date` / `clear`** — one API call, core to the loop), `SquadMembersView` (list only). `.poll` messages render `PollPlaceholderRow` (`DESIGN.md` §7.0). |
| Notifications | Bell sheet with unread count (99+ cap), mark-all-read except friend requests (pinned), per-type glyph/tint (all 23, `DESIGN.md` §7.9), tap routing through `resolveCheckRoute` (§7.4) incl. gone → DeletedCheck, `FriendRequestBanner`, realtime slips with role-aware copy for `squad_invite` — "squad formed! → open" / "squad's full — you're on the waitlist ✶" / "you're in — a spot opened up ✶" (§5.3) — each with Open, deduped against the optimistic DOWN path. |
| Push | Registration + 24 h/rotation re-POST, unregister on logout, foreground suppression rules, tap routing, cold-launch replay, delivered clearing, badge reset. |
| Friends | `FriendsSheet` (Friends tab filtered list; Add tab: search, invite link `ShareLink` "Add me on down to", incoming, outgoing "Requested", FoF suggestions), `UserProfileSheet` (avatar/name/@/IG/availability; Add / Accept / Remove / Cancel; Block / Report — block refreshes feed + squads), deep links `/check/{id}`, `/friend?token=`, `?add=`, the synthetic shared-check card (§7.1), and the `downto://` fallback scheme. |
| Onboarding via link | Pre-gate sequence (redeem → respond-shared → hydrate → friend gate with pinned author → Continue requires ≥ 1 add), mystery-safe pre-login banner. |
| Load/connection states | Everything in §4.9 with `DESIGN.md` §7.15's look: `Skeleton`s, the "updated Nm ago" running head, `ErrorColophon` with RETRY, the offline band, "· reconnecting", `NotifNudgeBanner`, failed-send rows. |
| Profile | Avatar/name/@username, `EditProfileSheet` (username change confirm + 14-day cooldown error), the availability slider (open ✨ / awkward 👀 / not available 🌙), IG handle, Haptics toggle, the three-state Notifications row, archived checks + restore, blocked users + unblock, About with build id (long-press copies), Log out, Delete account, Reset Onboarding when `is_test`. Sync-to-calendar and Theme rows hidden (§15.1). |
| Domain + tests | Everything in §10 and §11 including goldens, invariants, snapshot, fake-world smoke. |

### 15.1 What M1 shows where a deferred feature has a visible affordance on the web

INVENTORY §1 lists UI whose backing feature is M2+, and `DESIGN.md` §7 specifies the finished design of every one of them. Each row says whether the affordance is **hidden** (not rendered — a reviewer comparing to web or to `DESIGN.md` must not file it) or **stubbed** (rendered, does something honest), in `DESIGN.md`'s idiom so both documents describe the same M1 screen (`DESIGN.md` §7.0 is the same table from the design side; DECISIONS #27). `FakeWorldSmokeTests` asserts the stubbed rows' slip/placeholder copy; `ComponentGallery` includes each stub.

| Web / `DESIGN.md` affordance | M1 treatment | Copy / behaviour |
|---|---|---|
| `EventEntry` response row → `EventLobbySheet` (`DESIGN.md` §7.11) | **stubbed** | tap → slip "lobby's coming to iOS soon ✶"; the "Alice + 3 others down" row and its avatar fan-out are still rendered |
| `EventEntry` secondary squad pills JOIN SQUAD → / WAITLIST → / REQUESTED (`DESIGN.md` §4.3), SAVE / ✓ SAVED and the `saved` state (§4.5), the poster's visibility chip | **hidden** | not rendered — all three depend on the lobby / saved-events management (M2); the DOWN toggle itself is M1 |
| `EventEntry` inline comments (`event_comments`, 20260417000001) | **hidden** | no comment rows, no composer; incoming event-comment realtime rows are dropped (§4.10). `event_comment` / `comment_mention`-on-event notifications still route to `.feed(checkId: nil)` and their rows read the server body |
| `CreateOverlay` PASTE LINK tab (`DESIGN.md` §7.6: `PasteButton`, scrape skeleton/failure band, manual MOVIE / EVENT fallback) | **hidden** | the tab index renders "IDEA" alone, no second tab, no underline slide |
| Profile "Sync to Calendar" row (`ProfileView.tsx:614`, `DESIGN.md` §7.16) | **hidden** | row not rendered; `Sheet.syncCalendar` stays in the enum, unreachable. Rationale: a row that opens a "coming soon" slip on a settings screen reads as broken |
| Profile theme switcher (guava / dragonfruit, `DESIGN.md` §7.10 EDITION row) | **hidden** | not rendered; the Asset Catalog and `DTTextStyle` keep the second token slot |
| Chat composer poll glyph (`DESIGN.md` §4.10) → `PollComposer` (§7.13) | **stubbed** | the poll glyph is rendered at `Color.inkFaint` in its 44 pt target, not tappable, `accessibilityHint("polls are on web for now")`; the image glyph works. No `PollComposer` |
| Active-poll chip in the chat header (`SquadChat.tsx:1083`, `DESIGN.md` §4.10) | **stubbed** | rendered when an `active` poll exists so the thread reads the same as web; tap scrolls to the `PollPlaceholderRow` (§7.6 item 4) |
| Poll cards, grid polls, PROPOSE THIS → (`DESIGN.md` §4.10) | **stubbed** | `.poll` messages render `PollPlaceholderRow`: the `DESIGN.md` §4.10 `Color.deep` radius-12 card with the question `Font.dt.headline`, "poll — open on web for now" `Font.dt.system` `Color.inkMuted`, and "COPY LINK" `Font.dt.button` `.dtInk` (copies `webBase/?tab=squads&squadId=`, no `ShareLink`). `.dateConfirm` cards, the sticky bar and `DateProposalSheet` are fully in M1 |
| SquadSettings "EDIT EVENT" → `EditEventSheet` (`DESIGN.md` §7.16) | **hidden** | `SquadSettingsSheet` shows the DATE row (propose / change / clear via `set-date`, M1) for *check* squads; for event squads the row is absent and the header shows the event title read-only. `EditEventSheet` (and the event `ShareLink`) is M2 |
| Member management (move to/from waitlist, kick, ADD FROM PEOPLE DOWN, REQUESTS) in `SquadMembersView` (`DESIGN.md` §7.8) | **hidden** | list only, no context menus, no sections beyond the members |
| UserProfile → Report when Friends is already the root (three levels: Friends → UserProfile → Report) | **stubbed via the queue rule (§7.0)** | `present(.report)` from a `stacked` `.userProfile` is not a third level: `stacked` is dismissed and its `onDismiss` presents `.report` as the new `stacked` over the still-open `.friends` root — the user sees profile slide down, report slide up. Web-equivalent outcome, two levels max. `RouterTests` covers `friends → userProfile → report` |
| Saved-events management, "Tonight ✶" sub-tab, calendar tab | **hidden** | one feed, no sub-tabs (INVENTORY says Tonight is already gone on web); `?tab=calendar` maps to feed (§7) |
| Long-press menu on chat messages and comments: Report… / Block / Delete (`DESIGN.md` §4.10); `ReportSheet` targets `.squadMessage` / `.checkComment` / `.eventComment` (§7.14) | **hidden** in M1, **must** be M2 before App Store (Guideline 1.2) | the long-press menu shows **Copy** (and Copy image) only; `ReportSheet` accepts `.check` and `.profile` |
| Movie header (poster 40×60, title, year · director — `DESIGN.md` §4.1 #3, §7.5) | **stubbed** | "LETTERBOXD →" `Font.dt.button` `.dtInk` text link only; `movieMetadata` decoded and ignored |
| `highlighted` state on `EventEntry` from event pushes (`DESIGN.md` §4.5) | **hidden** | event pushes route to the feed without an id (§7.3 `mapPushToRoute`, INVENTORY §5); the state is specified for M2 event routing |

**Explicitly deferred (M2+)**
- Paste-link event creation (`/api/scrape`, `/api/search-letterboxd`, manual form), `EditEventSheet`, `EventLobbySheet` (who's down / start squad / crew pool / join request) and the event-side squad pills, event comments + their realtime channel, saved-events management / SAVE. (`EventEntry` read-only + `setEventDown` **are** in M1.)
- Poll creation and voting (text / dates / grid heat-map), `propose-from-poll`, legacy availability polls. M1 shows placeholders.
- Member management actions (`set-member-role`, `kick-member`, `add-member`); join-request accept/decline from the chat banner **is** M1 (single row update).
- Sync-to-calendar sheet (webcal copy) and EventKit.
- Dragonfruit theme / switcher (tokens ready, fonts not bundled).
- Sentry.
- Movie/Letterboxd metadata header on cards (text link only in M1).
- Reporting for squad messages / event comments — **must land in M2 before App Store submission** (Guideline 1.2 UGC).
- Offline write queue — not planned.
- iPad, landscape, widgets, Live Activities for FADING ✶ countdowns (M3).

**Cross-repo deliverables (web repo, must land before TestFlight)** — none of the deep-link rows work without the first:
1. AASA route at `/.well-known/apple-app-site-association` with the `components` form and `<TEAMID>.xyz.downto.app` (§7.2), excluded from middleware, served as `application/json`; same on staging.
2. `get_shared_check` returns `mystery` (and ideally nulls the author when mystery + future date) (§7.3).
3. Optional but cheap: `/check/[id]` page gets an "open in down to" button on `downto://check/{id}`.
4. Not blocking, but tracked: `enforce_username_cooldown` interval (24 h in SQL vs "14 days" in copy — §3.8).

**M1 definition of done**: `make test-domain build test ui-test` green in CI; a new user can go invite link → sign up → see a friend's check (straight to the feed, no FirstCheck detour) → tap DOWN → land in the auto-formed squad chat → get a push for the reply → tap it back into the chat, against local Supabase and again against staging with the AASA live; the `ComponentGallery` snapshot is approved by the product owner as "f***ing beautiful", and the `checkText` face (§13) has been chosen on device.

---

## 16. Revision ledger

| Rev | Change |
|---|---|
| 1–3 | Synthesis of the "direct" proposal with grafts from "layered"; privacy manifest, surrogate-key finding, realtime/hydrate ordering, shared-check path, pop-gesture shim, chat scroll contract, boot sequence. |
| **4 — reconciliation** | Reconciled with `DESIGN.md` (revision 4 there); every conflict and its resolution is a numbered entry in `DECISIONS.md`, which wins over both documents. Changes here: precedence statement (header); §1 file tree and §1.1 `UIAppFonts` use `DESIGN.md`'s token/component names and the variable-Inter + static-Plex font set; §2 fonts; §4.5 `toggleDown` (no store haptics, `DTSpring.settle`, waitlist-only slip, `squadOutcome`), §4.7 (`DTSpring.page`, held inserts), §4.8 (stores are the only ticks), §4.9 (load/error/offline treatments point at `DESIGN.md` §7.15), §4.10 (`MembershipOutcome`), §5.3/§5.6 slip copy and dedupe; §7 `Router` gains `FeedDestination`/`feedPath`/`isCreateOpen`/`hidesFolio` and `Route.create`, `Sheet` loses `checkDetail`/`createCheck`, `Cover` loses `deletedCheck` (detail = zoom push, Create = root overlay, deleted check = push); §7.0 stacking pairs; sheets use `.dtSheet` with the system dim (no material), no `DTConfirmDialog`; §7.3 24 h stale-route drop; §7.5 `ChatHeader` visuals and `Folio` hide contract; §7.6 transcript rows, `ComposerSlot`, top-inset banner/chip; §8.2 badge clear on chat open; §10.2 `WhenField` look; §11.2 gallery states incl. both `checkText` faces; §11.4 smoke copy; §12 Makefile (`pipefail`, optional `xcbeautify`, no `OS=` pin, no `brew install`); **§13 rewritten as the naming map** (colour / layout / typography / motion / haptics / components → `DESIGN.md` sections, retired names listed); **§14 rewritten as the index** into `DESIGN.md` with the contradicting motions struck (`ultraThinMaterial` backdrop, sliding highlight block, chat bubbles, `PhaseAnimator` reveal, breathing countdown, 4 % grain, three-✶ refresh, kaomoji empty states, `.impact(.medium)`); §15 rows renamed; §15.1 extended to every `DESIGN.md` §7 surface that is M2 with its M1 stub in `DESIGN.md`'s idiom. |
