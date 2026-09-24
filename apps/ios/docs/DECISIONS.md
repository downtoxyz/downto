# down to — native iOS: DECISIONS (reconciliation of DESIGN.md and ARCHITECTURE.md)

Status: authoritative. `DESIGN.md` (revision 4) and `ARCHITECTURE.md` (revision 4) were written in parallel and disagreed; this file records every conflict found by diffing their treatment of each token, component, screen, API and milestone, and the decision taken. **Where the two documents still disagree, this file wins.** Where this file is silent, the precedence is: `INVENTORY.md` on *what* the app does → `ARCHITECTURE.md` on *how it is built* (module layout, stores, router, data flow, milestone scope) → `DESIGN.md` on *how it looks and feels* (tokens, type, motion, haptics, component anatomy, screen layouts).

Environment the decisions were verified against: iOS 26.0 minimum, Swift 6.2, `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, `-warnings-as-errors`, XcodeGen, supabase-swift pinned at 2.55.2, simulator "iPhone 17 Pro" on iOS 26.3.x, `xcbeautify` not installed.

Format: **Conflict / Decision / Why / Where changed (file §)**.

---

## 1. Precedence and the naming rule

- **Conflict:** each document claimed to be sufficient on its own and used its own vocabulary for the same things.
- **Decision:** `DESIGN.md`'s names win for everything visual — tokens (`Color.*`, `Font.dt.*`, `Space.*`, `Radius.*`, `Elevation.*`), springs (`DTSpring.*`), haptics, and components (`CheckEntry`, `EventEntry`, `ExpiryRule`, `DownToggle`, `AvatarLetter`/`AvatarStack`, `NewFlag`, `MysteryFrame`, `Slip`, `Folio`, `Masthead`, `Pull`, `Grain`, `.dtSheet`). `ARCHITECTURE.md`'s names win for structure — files, stores, the router, screens and sheets (`CheckDetailView`, `CreateOverlay`, `EditCheckSheet`, `SquadSettingsSheet`, `SquadMembersView`, `UserProfileSheet`, `DeletedCheckView`, `DateProposalSheet`, `FriendsSheet`, `ToastCenter`). Where `DESIGN.md` used a web word for a screen, the header of `DESIGN.md` now maps it to the code name.
- **Why:** the task's decision rule; and screens are containers whose names carry no visual meaning, so renaming them buys nothing.
- **Where:** `DESIGN.md` header (Precedence, Naming); `ARCHITECTURE.md` header, §13.

## 2. Colour tokens

- **Conflict:** `ARCHITECTURE.md` §13 declared `enum DT.Color` in Swift with hex literals (`accent`, `onAccent = .white`, `bg`, `text`, `muted`/`dim`/`faint`, `border*`, `accentSubtle`, `checkDownBg`, `newBadgeText #FF00D4`, …) and said "no invented colours"; `DESIGN.md` §1.2–§1.3 declares Asset Catalog colour sets exposed as `extension Color` (`paper`, `ink`, `inkMuted`, `dt`, `onDt = ink`, `dtInk`, `dtInkOnSurface`, `inkExpired`, `*Ink` text variants, `waitlistBg`, `newInk #C400A6`, …) plus the `\.paperStock` environment and stock-resolving `ShapeStyle`s.
- **Decision:** `DESIGN.md`'s set, names and storage. In particular `Color.onDt` is **ink**, not white (white on `#FE44FF` is 2.8:1; ink is 5.2:1), `newInk` is `#C400A6` (AA), and the `*Ink` variants exist because pure `#FE44FF`, `#51CF66`, `#A855F7` and `#FFA94D` all fail as text. "No invented colours" is superseded by "no colour below AA".
- **Why:** the contrast audit in `DESIGN.md` §8 is arithmetic, not taste; Asset Catalog sets give the v1.1 dark slots for free.
- **Where:** `ARCHITECTURE.md` §13 "Colour" (naming map, retired names), §1 tree (`Tokens/Color+DT.swift`, colour sets in `Assets.xcassets`); `DESIGN.md` unchanged.

## 3. Layout tokens — full-bleed entries, not cards

- **Conflict:** `ARCHITECTURE.md` §13 had `Radius.card 16`, `cardNew 4`, `Space.gutter 12`, `cardPad 14`, `cardGap 8`, and §14.4 rounded the NEW card; `DESIGN.md` §3 has a 4 pt `Space.*` grid (gutter 20, gap 0), `Radius.*` (`none · xs 6 · s 10 · m 12 · l 16 · sheet 24 · pill`) with **feed entries at radius 0** separated by hairlines and tint bands, and `Elevation.*` with no ambient shadows.
- **Decision:** `DESIGN.md` §3. The feed is a broadsheet; no entry has corners or a shadow.
- **Why:** it is the thesis of the design (`DESIGN.md` §0); the card tokens were a transcription of the web CSS.
- **Where:** `ARCHITECTURE.md` §13 "Layout", §14.4, §2 (snapshot-test wording), §11.2.

## 4. Typography scale and modifiers

- **Conflict:** `ARCHITECTURE.md` §13 exposed `.dtHeading(18)`, `.dtBody()` (12), `.dtLabel()` (10, `dim`), `.dtButton()` and `DTFont.inter/mono`; `DESIGN.md` §2.1 defines the 17-row `Font.dt.*` scale with sizes, weights, tracking, `relativeTo` and uses.
- **Decision:** `DESIGN.md` §2.1 as `enum DTTextStyle` + `Font.dt.<style>` + `.dtFont(_:)`; the four modifiers are retired. Section labels are `Color.inkMuted`, not `inkDim` (`DESIGN.md` §8).
- **Why:** the scale is the design; a 4-modifier API cannot express it.
- **Where:** `ARCHITECTURE.md` §13 "Typography", §1 tree; `DESIGN.md` §2 (`Font.DT` → `DTTextStyle`).

## 5. Fonts: variable Inter through `UIFontDescriptor`, static Plex Mono

- **Conflict:** `ARCHITECTURE.md` §2/§13 bundled static Inter cuts (Regular/Medium/SemiBold/Bold) and Plex Mono Regular + Bold, built fonts with `Font.custom(_:fixedSize:)` + `@ScaledMetric` clamped at 1.3×, and stated that SwiftUI cannot drive a variable font's `wght` axis. `DESIGN.md` §2 bundled `Inter-Variable.ttf` + five Plex cuts, drove `wght`/`opsz` through `UIFontDescriptor` variation attributes, but also said every style is built with `Font.custom(_:size:relativeTo:)` (which cannot carry variation attributes), and named the Plex Medium face `IBMPlexMono-Medium`.
- **Decision:** bundle **`InterVariable.ttf`** (rsms/inter release zip root, Inter ≥ 4.0) and **`IBMPlexMono-{Regular,Medium,SemiBold,Bold,Italic}.ttf`** (IBM/plex releases). Build every `Font.dt.*` as `UIFontDescriptor` (Inter: `[.name: "InterVariable", kCTFontVariationAttribute: [wght, opsz]]` + tabular feature settings where needed; Plex: the static cut by PostScript name) → `UIFont(descriptor:size:)` → `UIFontMetrics(forTextStyle:).scaledFont(for:compatibleWith:)` → `Font(_:)`. **Never `.weight()`/`.bold()`, never `Font.custom`, never `@ScaledMetric` on a size, no scale clamp.** PostScript names are `InterVariable`, `IBMPlexMono`, `IBMPlexMono-Medm`, `IBMPlexMono-SmBld`, `IBMPlexMono-Bold`, `IBMPlexMono-Italic`; `TypographyTests` pins all six and the resolved `wght`/`opsz`.
- **Why:** `ARCHITECTURE.md` was right that `.weight()` does not touch a custom variable font's axis and wrong that nothing does — `kCTFontVariationAttribute` on a `UIFontDescriptor` is the supported way and works on iOS 26. `DESIGN.md` was right about the mechanism and wrong about `Font.custom(_:size:relativeTo:)` (name + size only). `UIFontMetrics.scaledFont` is the one Dynamic Type step, which keeps `ARCHITECTURE.md`'s "scale once, not twice" rule. IBM abbreviates the Medium/SemiBold PostScript names (`-Medm`, `-SmBld`) and the Regular has no suffix; `UIFontDescriptor(name: "IBMPlexMono-Medium")` would silently fall back. The clamp is dropped because `DESIGN.md` §8 specifies real accessibility-size adaptations instead.
- **Where:** `DESIGN.md` §2 (font files, construction), §2.2 (`-Medm`); `ARCHITECTURE.md` §1 tree (Fonts/), §1.1 `UIAppFonts`, §2, §13 "Typography".

## 6. `checkText` face

- **Conflict:** `DESIGN.md` §2.3 left the check-text face as "decision to prototype" (Inter 19 vs Plex Mono 15–16); `ARCHITECTURE.md` assumed Inter headings only.
- **Decision:** `Font.dt.checkText` defaults to **Inter 19/24, weight 500, −0.03em** (web parity) behind one token, `DTTextStyle.checkText.face: CheckTextFace = .inter`; `.mono` (Plex Mono 15/22, 400, −0.03em) is a one-line change. `ComponentGallery` renders `CheckEntry` in both faces; the product owner compares them on device and flips the default if mono wins. The choice is part of the M1 definition of done.
- **Why:** parity is the safe default; a single token keeps the comparison honest and cheap.
- **Where:** `DESIGN.md` §2.3; `ARCHITECTURE.md` §13 "Typography", §11.2, §15 definition of done.

## 7. Springs and Reduce Motion

- **Conflict:** `ARCHITECTURE.md` §13/§14 used `DTAnimation.snappy/.pop/.settle` and raw `.spring(duration:bounce:)` / `.snappy(duration: 0.4)` at call sites; `DESIGN.md` §5 defines `DTSpring.page/.settle/.snap/.ink/.stamp/.reveal` (response/damping) and `Motion.resolve(_:)` for Reduce Motion.
- **Decision:** `DESIGN.md` §5. `Motion.swift` holds `DTSpring` and `Motion.resolve`; `DTAnimation` is retired. Stores animate list mutations with `DTSpring.page` (insert/remove) and `DTSpring.settle` (reflow/restore); all choreography lives in views. Fixed curves are written in their labelled forms (`.smooth(duration:)`).
- **Why:** naming rule; and `DESIGN.md`'s six springs are the motion system, not three adjectives.
- **Where:** `ARCHITECTURE.md` §1 tree, §4.5, §4.7, §7.6, §13 "Motion", §14.

## 8. Haptics

- **Conflict:** `ARCHITECTURE.md` §14 had `DTHaptic.down() = .impact(.medium)` on tap (both directions), `.select()`, `.success()`, `.error()`; `DESIGN.md` §6 has a per-action `.sensoryFeedback` map (DOWN: touch-down `.impact(flexibility: .soft, intensity: 0.5)`, apex `.impact(flexibility: .rigid, intensity: 0.9)`, `.success` on ack; un-down `.impact(weight: .light)`; …) plus a `HapticEngine` actor with two CoreHaptics patterns.
- **Decision:** `DESIGN.md` §6. `Haptics.swift` holds `HapticEngine` + `HapticPattern.squadFormed/.mysteryReveal`; haptics fire in views from state, never in stores. `DTHaptic` is retired.
- **Why:** `.impact(.medium)` does not compile — `SensoryFeedback` has no positional impact initialiser (`DESIGN.md` §6.1); and the stamp's three-beat haptic is the signature moment.
- **Where:** `ARCHITECTURE.md` §1 tree, §4.5, §5.6, §7.5, §13 "Haptics", §14.1, §14 haptics paragraph.

## 9. Component names and contracts

- **Conflict:** `ARCHITECTURE.md` §1/§13: `CheckCard`, `EventCard`, `ExpiryBar`, `BottomNav`, `Toast`, `DTSheet`, `GrainOverlay`/`.dtGrain()`, `NewBadge`, `MysteryBorder`, `DragHandle`, `DTConfirmDialog`, `FeedHeader`, `DTRefreshable`, `EmptyState(kaomoji:)`, `DTButton(.primary/.outline/.highlight, .small/.medium/.large)`, `AvatarLetter` sizes `.inline(20)/.small(24)/.medium(28)/.large(40)/.display(72)`, `AvatarStack(max: 4)` overlap −7. `DESIGN.md` §4: `CheckEntry`, `EventEntry`, `ExpiryRule`, `Folio`, `Slip`, `.dtSheet`, `Grain`, NEW flag, "?" frame, `Masthead`, `Pull`, "✶" colophon empty states, avatar sizes `micro 20 / inline 24 / small 28 / medium 40 / display 72`, stack max 3 + "+N" overlap −6/−8 with an explicit ring colour.
- **Decision:** `DESIGN.md`'s names and anatomy. Additions where `DESIGN.md` had no name: the "?" frame is **`MysteryFrame`**; NEW flag is **`NewFlag`**; the toast view is `Slip` + `SlipHost` while the queue stays **`ToastCenter`** (structure); `DTButton` survives with variants remapped to the four CTA idioms `DESIGN.md` actually uses (`primary` dt/onDt pill, `outline` ink stroke, `inverted` ink fill/paper text, `text` dtInk); `DragHandle` folds into `DTSheet.swift`; `DTConfirmDialog` is dropped (see #12); `EmptyState` loses its kaomoji parameter (see #22). `AvatarLetter(presence:size:ring:)` keeps `Presence` as the masking boundary.
- **Why:** naming rule; `Presence` is the compile-time mystery guard and is structural.
- **Where:** `ARCHITECTURE.md` §1 tree, §7, §7.1, §11.2, §11.4, §13 "Components", §14, §15; `DESIGN.md` §4.1 (`MysteryFrame`).

## 10. Feed entry states and the NEW treatment

- **Conflict:** `ARCHITECTURE.md` §14.4 specified the NEW card as `Radius.cardNew` + `checkNewBg`/`checkNewBorder`, and §14.3 card entrance as `.blurReplace + .move(edge: .top)`; `DESIGN.md` §4.1/§4.6/§5.1 specify a full-bleed `Color.checkNew` band, the flag bleeding off the screen edge, seen-tracking, and `.opacity + offset(y: −8)` insertion with the reader-protecting "N new ↑" hold.
- **Decision:** `DESIGN.md`. `FeedStore` gains `heldInserts` and `dt.seenIds` to support the hold and seen-tracking.
- **Why:** visual; and "never shove the page while someone is reading" is a design principle with a structural cost the store must pay.
- **Where:** `ARCHITECTURE.md` §4.2 (`heldInserts`), §4.7, §14.3, §14.4.

## 11. DOWN toggle motion, haptics and feedback

- **Conflict:** `ARCHITECTURE.md` §14.1: `.spring(duration: 0.35, bounce: 0.35)` morph, `.blurReplace` ✓, 0.3 s card crossfade, `.impact(.medium)` in the store; §4.5 toasted "You're down! ✦" on every DOWN. `DESIGN.md` §4.3: the radial stamp from the touch point with `DTSpring.stamp`, the band dye 60 ms after the apex, the rule drawing down, three haptics + `.success` on ack, **no toast on a plain DOWN** — the "you're in" strip / SQUAD FORMED / waitlist landing are the feedback; the waitlist slip reads "check is full — you're #N on the waitlist".
- **Decision:** `DESIGN.md` §4.3/§5.6. `toggleDown` no longer fires haptics or the "You're down" toast; it shows the waitlist slip only and records `squadOutcome[checkId] = .formed | .joined` (from `refreshMembership`'s new `MembershipOutcome`) so `CheckEntry` plays the right ceremony; `ToastCenter.show(_:key:style:)` gains `style: .error` so the Slip host fires `.error`.
- **Why:** visual/feel; the choreography is state-driven from the view, and a store that fires haptics cannot honour the Haptics toggle or Reduce Motion.
- **Where:** `ARCHITECTURE.md` §4.2, §4.5, §4.10 (`MembershipOutcome`), §5.3 (dedupe), §14.1, §14.17, §15 "DOWN".

## 12. Sheets: detents, backdrop, confirms

- **Conflict:** `ARCHITECTURE.md` §7/§14.6: `.presentationDetents([.fraction(0.78), .large])`, an `.ultraThinMaterial` backdrop faded over 300 ms (the web's blur), `DTConfirmDialog` for >2 actions. `DESIGN.md` §4.9: `[.fraction(0.72), .large]`, **system dim, no blur** ("paper under paper is dimmed, not blurred"), block stagger, widening handle; every confirm in §7 is a native `.confirmationDialog`.
- **Decision:** `DESIGN.md`. No material backdrop, 0.72, native `.confirmationDialog` everywhere (no confirm in the app has more than two actions plus cancel), `DTConfirmDialog` deleted from the tree. `ARCHITECTURE.md` §7.0's two-level stacking rules stand.
- **Why:** visual; and the DESIGN §14.16 rule "if it has a Liquid Glass background and we did not draw it, it is accepted" already covers dialogs.
- **Where:** `ARCHITECTURE.md` §1 tree, §7 "Sheets", §13, §14.6, §14.16.

## 13. Tab bar (`Folio`)

- **Conflict:** `ARCHITECTURE.md` §7/§14.7: `BottomNav` with a magenta sliding highlight (`matchedGeometryEffect(id: "tab")` under `.snappy`), hidden by `.offset(y: 96)` while `squadPath` is non-empty, "+" glow radius 12 pulsing 1.6 s. `DESIGN.md` §4.11/§4.12: three typeset labels, a 2 pt `Color.dt` **underline** sliding with `DTSpring.page` (matched geometry on the underline), intrinsic height ≥ 52, `.isTabBar`, hidden by `route.hidesFolio` for chat, detail, Create and the image viewer; "+" glow 8 → 18 over 2.0 s + ripple.
- **Decision:** `DESIGN.md` for the look; `ARCHITECTURE.md` for the mechanism — the Folio is a `.safeAreaInset(edge: .bottom)` whose content collapses to zero height in the same transaction as the offset, driven by `router.hidesFolio = !feedPath.isEmpty || !squadPath.isEmpty || isCreateOpen || cover != nil`, offset by its measured height + safe area (not a constant 96).
- **Why:** visual vs structural split; the inset collapse is what keeps the chat composer on the home indicator.
- **Where:** `ARCHITECTURE.md` §7 (`hidesFolio`), §7 "Tabs", §7.5, §14.7; `DESIGN.md` §4.11.

## 14. Chat: transcript, not bubbles

- **Conflict:** `ARCHITECTURE.md` §7.6/§14.8: "bubbles", outgoing bubbles popping in from 0.85 scale with `.spring(duration: 0.3, bounce: 0.3)`, `LazyVStack(spacing: 6)`, a `↓ N new` pill in `accent` mono 10, `.sensoryFeedback(.success)` on "X just entered" rows, `DateConfirmBar` sliding with `.smooth`, join banner in the bottom inset. `DESIGN.md` §4.10: a left-aligned transcript — message groups (4 pt within, 16 pt between), your groups marked by a 2 pt `Color.dt` rule + `Color.dtFaint` band, system lines between ✶ ✶ arriving with `DTSpring.page`, a 32 pt `Color.ink` "↓" circle, no haptic on incoming messages, the join-request banner and active-poll chip in the **top** inset, a `ComposerSlot` with every lifecycle strip.
- **Decision:** `DESIGN.md` §4.10 for everything visible. `ARCHITECTURE.md` §7.6's scroll contract stands (bottom anchor, pinned-only-at-bottom, no-jump prepend, keyboard); `rebuild()` computes `isGroupStart`; the top inset is `ChatHeader` + banner + chip, the bottom inset is `DateConfirmBar` + `ComposerSlot`.
- **Why:** "a squad chat is a transcript" is a thesis line in `DESIGN.md` §0; the scroll mechanics are orthogonal.
- **Where:** `ARCHITECTURE.md` §1 tree (`MessageGroupRow`, `ComposerSlot`), §4.2, §7.6, §9.3 wording, §14.8, §15 "Squads".

## 15. Chat navigation bar: hidden + custom `ChatHeader`

- **Conflict:** `ARCHITECTURE.md` §7.5 hides the system navigation bar, draws `ChatHeader` in a `.safeAreaInset(edge: .top)` and restores the edge-swipe pop with the `InteractivePopEnabler` shim (with a `#if DT_CUSTOM_POP` fallback). `DESIGN.md` §4.10 (rev 3) kept the system bar, restyled it (`toolbarBackground(Color.surface)`, `ToolbarItem(.principal)`), de-glassed every item with `.sharedBackgroundVisibility(.hidden)`, hid the system back button in favour of a custom chevron item — and then also required the same UIKit shim, plus two iOS 26 prototype-checklist risks (flat `toolbarBackground` fill; capsule suppression).
- **Decision:** `ARCHITECTURE.md` §7.5's structure with `DESIGN.md` §4.10's layout: bar hidden, `ChatHeader` 48 pt + safe area on `Color.surface` with a 1 pt `Color.ruleMid` rule, chevron / name 17 + `AvatarStack` `micro` + countdown / "⋯", `.scrollEdgeEffectStyle(.hard, for: .top)`, `InteractivePopEnabler` mandatory. `CheckDetailView` hides its bar the same way. `DESIGN.md`'s toolbar-restyle bullets and `.toolbarRole(.editor)` experiment are withdrawn.
- **Why:** both paths compile on iOS 26 (`sharedBackgroundVisibility(_:)` and `toolbarBackgroundVisibility` are real iOS 26/18 APIs), but both need the shim, so keeping the bar bought nothing and left open whether `toolbarBackground(Color)` renders flat under Liquid Glass. The hidden bar has no such risk and the look is identical. Structural decisions are `ARCHITECTURE.md`'s.
- **Where:** `DESIGN.md` §4.10 (navigation bar, chat header), §5.5, §10 checklist; `ARCHITECTURE.md` §7.5.

## 16. Presentation of detail, Create, deleted check, image viewer — `Router` shape

- **Conflict:** `ARCHITECTURE.md` §7: `Sheet.checkDetail`, `Sheet.createCheck`, `Cover.deletedCheck`, `Cover.imageViewer`; stacking pairs `checkDetail → editCheck/checkActions/userProfile`. `DESIGN.md` §4.9/§5.4/§7.5/§7.6/§7.8: check detail is a **zoom push** (`.navigationTransition(.zoom)` from the entry), Create is a **root overlay** (so `matchedGeometryEffect` can fly the posted text into the feed), deleted check is a **push**, the image viewer zooms from the image.
- **Decision:** `DESIGN.md` for the mechanism, because the mechanism *is* the visual here. `Router` gains `feedPath: [FeedDestination]` (`.checkDetail(CheckID)`, `.deletedCheck(CheckID, isMine:)`), `isCreateOpen` + `createPrefill`, and `hidesFolio`; `Sheet` loses `checkDetail`/`createCheck` and gains `dateProposal`; `Cover` keeps only `imageViewer` (a `.fullScreenCover` with `.navigationTransition(.zoom)`, which is supported). Sheets opened from the pushed detail are root sheets; "push from a sheet" (Notifications → detail / DeletedCheck) is `dismissAll(then: { feedPath = [...] })`. `Route.create` is added for the home-screen quick action.
- **Why:** a sheet and a zoom push are different experiences; `matchedGeometryEffect` cannot cross a sheet boundary. The two-level sheet rules and delete-before-dispatch replay are untouched.
- **Where:** `ARCHITECTURE.md` §1 tree, §7 (enums, `Router`), §7.0, §7 deep-link table, §7.4, §8.2; `DESIGN.md` §4.11 (`router.hidesFolio`), §7.5.

## 17. Mystery reveal: renderer and trigger

- **Conflict:** `ARCHITECTURE.md` §14.9: a 6-phase `PhaseAnimator` over 0.9 s with `Censor.wingdings` strings and `.blurReplace`, `.sensoryFeedback(.success)`. `DESIGN.md` §5.7: fuse → flip → `ScrambleRenderer` (a `TextRenderer`) unscramble → guests rise with the `displayCount` count-up, ≈ 2 s, `DTSpring.reveal`, CoreHaptics pattern B; and each view scheduling `TimelineView(.explicit([revealInstant]))` at local midnight.
- **Decision:** `DESIGN.md` for the sequence; `ARCHITECTURE.md` §4.8 for the trigger — `FeedStore.dayChanged()` (on `NSCalendarDayChanged` / `NSSystemTimeZoneDidChange`, plus `tick()` on `.active`) publishes `revealedNow`; `ChatStore` rebuilds on the same notification; views watch store state and **do not** schedule their own `TimelineView(.explicit)`. Once-per-device is `dt.revealedSeen`.
- **Why:** visual vs structural; one observer in the store is simpler and already re-runs `rebuild()` (which is what changes the masking).
- **Where:** `DESIGN.md` §4.10, §5.7; `ARCHITECTURE.md` §4.2, §4.8, §14.9.

## 18. Expiry rule and ticks

- **Conflict:** `ARCHITECTURE.md` §13/§14.5: `ExpiryBar` 3 pt, shimmer every 2.4 s via `TimelineView(.animation)`, danger over 75 %. `DESIGN.md` §4.2: `ExpiryRule` 2 pt → 3 pt past 75 %, `dt → danger` crossfade, 4.0 s shimmer **on the top timed entry only**, a shared `.periodic(by: 30)` tick with `by: 1` under 5 min, `accessibilityHidden`.
- **Decision:** `DESIGN.md` for the look; the 30 s tick is `FeedStore.ExpiryClock` (`ARCHITECTURE.md` §4.8), and only the < 5 min entry runs a view-local 1 s `TimelineView`.
- **Why:** visual vs structural; a per-section `TimelineView` would duplicate the store clock.
- **Where:** `DESIGN.md` §4.2; `ARCHITECTURE.md` §4.8, §13, §14.5.

## 19. Pull-to-refresh

- **Conflict:** `ARCHITECTURE.md` §14.12 (`DTRefreshable`): three "✶" glyphs rotating with pull, 80 pt threshold, `.safeAreaPadding(.top, 56)` hold, `.selection` on trigger. `DESIGN.md` §4.14 (`Pull`): "PULL / RELEASE / REFRESHING" label with a 2 pt `Color.dt` rule growing from the centre, 72 pt threshold, a 56 pt `safeAreaInset` spacer hold with `DTSpring.snap`, `.impact(weight: .light)` when armed, `.impact(flexibility: .soft)` when new items land, an OFFLINE variant.
- **Decision:** `DESIGN.md` for the look and numbers. `ARCHITECTURE.md`'s structural notes stand: custom in M1, `.refreshable` used nowhere, **`.scrollBounceBehavior(.always)` is mandatory**, overscroll via `onScrollGeometryChange` with the `action:` old/new form, release via `onScrollPhaseChange`, the hold is a top inset.
- **Why:** visual vs structural.
- **Where:** `ARCHITECTURE.md` §13, §14.12.

## 20. Grain

- **Conflict:** `ARCHITECTURE.md` §13/§14.11: `Image("grain")`, 4 % multiply, `.dtGrain()` on every surface. `DESIGN.md` §1.4: `Image("grain-256")`, **0.03**, mounted once on the root `ZStack` above everything and once per sheet inside `.dtSheet`; removed under Reduce Transparency / Increase Contrast; 0.06 on the app icon only.
- **Decision:** `DESIGN.md`.
- **Where:** `ARCHITECTURE.md` §1 tree (Assets), §13, §14.11.

## 21. Loading, error and offline states; cache; error reporting

- **Conflict:** `ARCHITECTURE.md` §4.9: three skeleton cards at 0.6 opacity, a "catching up ✶" strip, `EmptyState(kaomoji: "(╥﹏╥)")` + `DTButton` "try again", a mono 9 `dim` "reconnecting…" pill under the bell, an "offline" pill in `danger`, failed sends at 0.5 opacity with a "!" glyph. `DESIGN.md` §7.15: four shimmer-rule skeleton entries, "updated 14m ago" in the running head, the `ErrorColophon` ("✶" + headline pool + cause + RETRY), "· reconnecting" appended to the running head, the inverted "✶ press not running — you're offline ✶" band with actions disabled-not-hidden, failed sends with a `Color.danger` rule + "didn't send · RETRY". `DESIGN.md` also said the cache is "`SwiftData` or a JSON store" and that Sentry gets errors; `ARCHITECTURE.md` §2/§4.6 rejects SwiftData (`LocalCache` JSON actor) and defers Sentry to M2.
- **Decision:** `DESIGN.md` §7.15 for every treatment; `ARCHITECTURE.md` §4.9 keeps the state triggers and thresholds (phase enum, 3 s / 5 s, `NWPathMonitor` debounced 1.5 s) and points at them. Cache is `LocalCache`; M1 logs with `os.Logger`, Sentry is M2.
- **Where:** `ARCHITECTURE.md` §4.9, §15 "Load/connection states"; `DESIGN.md` §7.15.

## 22. Empty states

- **Conflict:** `ARCHITECTURE.md` §14.15: kaomoji from `Censor.kaomojiPool` seeded by date. `DESIGN.md` §4.13: a "✶" colophon (spins once), a headline from a per-surface pool via `WobbleRenderer`, one line, one text link.
- **Decision:** `DESIGN.md`; `EmptyState(headline:line:cta:)`. Kaomoji are reserved for mystery presences so they keep their meaning.
- **Where:** `ARCHITECTURE.md` §4.9, §13, §14.15.

## 23. Avatars

- **Conflict:** sizes (`inline 20 / small 24 / medium 28 / large 40 / display 72` vs `micro 20 / inline 24 / small 28 / medium 40 / display 72`), colours (`accent` fill + white letter for me, `borderLight` + `dim` letter for others vs `Color.dt` + `Color.onDt` ink, `Color.ruleLight` + `Color.ink` — `inkDim` on `ruleLight` is 2.01:1), kaomoji scale (0.55× vs 0.36× diameter, min 9, "?" at `micro`/`inline`), stack (max 4, overlap −7 vs max 3 + "+N", −6/−8, explicit ring colour, tap fan-out).
- **Decision:** `DESIGN.md` §4.4 throughout; `AvatarLetter(presence:size:ring:)`, `AvatarStack(_:ring:max:)`.
- **Where:** `ARCHITECTURE.md` §13 "Components".

## 24. Links and mentions

- **Conflict:** `ARCHITECTURE.md` §13 `LinkifiedText`: URLs `accent` underlined, `@username` `accent` semibold. `DESIGN.md` §4.1/§4.10: `@mentions` and links `Color.dtInk` weight 500 with **no underline** on the feed; chat links get a 1 pt `Color.ruleMid` underline.
- **Decision:** `DESIGN.md`; masked mode still shows "@???" untinted (`ARCHITECTURE.md` §9).
- **Where:** `ARCHITECTURE.md` §13 "Components".

## 25. Routes, replay and push routing

- **Conflict:** `DESIGN.md` §7.17 described its own `Route` enum (`.feedHighlight(checkId | eventId)`, `.addUser`, `.notifications`), `@AppStorage("pendingRoute")` with a 24 h stale drop, event pushes highlighting the event entry, `check_archived` opening the Notifications sheet, and the `interactivePopGestureRecognizer` shim as `delegate = nil` in `viewDidAppear`. `ARCHITECTURE.md` §7–§7.4: `Domain/Route.swift`, `dt.pendingRoute`, `resolveCheckRoute`, `drainPendingIntents`, `mapPushToRoute` returning `.feed(checkId: nil)` for event types and `nil` for `check_archived` (INVENTORY §5 parity), `InteractivePopEnabler` with a root guard.
- **Decision:** `ARCHITECTURE.md`'s structure everywhere; `DESIGN.md` §7.17 is now explicitly the "what the user sees" layer over it. Event pushes route to the feed **without** a highlight in M1 (the `highlighted` event state is specified for M2); `check_archived` routes nowhere. `ARCHITECTURE.md` adopts `DESIGN.md`'s 24 h stale-route drop and adds `Route.create` for the quick action.
- **Why:** structural; INVENTORY parity on push destinations.
- **Where:** `DESIGN.md` §7.17 (header note, event row, archived row); `ARCHITECTURE.md` §7 (`Route.create`), §7.3.

## 26. Chat pagination

- **Conflict:** `DESIGN.md` §4.10 loads 50 + 50; `ARCHITECTURE.md` §7.6 prepends 100 with the no-jump anchor and a 300-row fixture.
- **Decision:** 100 (`ARCHITECTURE.md`).
- **Why:** page size is data-layer structure with no visual consequence.
- **Where:** `DESIGN.md` §4.10.

## 27. M1 scope of deferred features

- **Conflict:** `DESIGN.md` §7 specifies the finished `EventLobbySheet`, `PollComposer`, poll cards and grid polls, `EditEventSheet`, Sync-to-calendar, member management, message/comment reporting, the PASTE LINK tab, the movie header, SAVE and the event-side squad pills; `ARCHITECTURE.md` §15/§15.1 defers all of them with hidden/stubbed treatments written in its own idiom (toasts, "`+` attachment menu", "⋯ on a chat bubble").
- **Decision:** `ARCHITECTURE.md` §15 wins on scope; the stubs are restated in `DESIGN.md`'s idiom in both places. Lobby tap → slip "lobby's coming to iOS soon ✶"; `EventEntry` read-only with the secondary pills / SAVE / visibility chip / comments hidden; `CreateOverlay` IDEA-only; the composer's poll glyph rendered `Color.inkFaint`, not tappable, with a VoiceOver hint; `.poll` messages → `PollPlaceholderRow` (`Color.deep` card, question, "poll — open on web for now", COPY LINK); `SquadMembersView` list-only; long-press on messages = Copy only; `ReportSheet` for `.check`/`.profile`; Sync-to-calendar and Theme rows hidden; movie header = "LETTERBOXD →" text link; the `DateProposalSheet` / set-date path **is** M1. Message/comment reporting must land in M2 before App Store submission.
- **Where:** `DESIGN.md` §7.0 (new table); `ARCHITECTURE.md` §15 rows, §15.1 table, "Explicitly deferred".

## 28. Build environment: Makefile, simulator, xcbeautify

- **Conflict:** `ARCHITECTURE.md` §12 pinned `OS=26.2` in the simulator destination, piped every `xcodebuild` through `xcbeautify` unconditionally (losing the exit status), and told a fresh agent to `brew install xcodegen xcbeautify`. The verified environment has iOS 26.3.x runtimes, no `xcbeautify`, and forbids installing tools from a build task.
- **Decision:** `SIM ?= platform=iOS Simulator,name=iPhone 17 Pro` (no `OS=`; override with `OS=26.3` if needed), `.SHELLFLAGS := -o pipefail -c`, `2>&1 | (command -v xcbeautify >/dev/null && xcbeautify || cat)`, `xcbeautify` optional in `.tool-versions`, no `brew install` step.
- **Where:** `ARCHITECTURE.md` §1 tree (`.tool-versions`), §12.

## 29. Push-permission band

- **Conflict:** `DESIGN.md` §7.4: shown once when `.notDetermined`. `ARCHITECTURE.md` §4.9 `NotifNudgeBanner`: shown while not authorized and not dismissed, only after the user has ≥ 1 squad or ≥ 1 check, dismissible with "×", opens Settings when `.denied`.
- **Decision:** `ARCHITECTURE.md`'s condition (behaviour), `DESIGN.md`'s look (a `Color.surface` band, "ENABLE" `.dtInk`, a 44 pt "×").
- **Where:** `DESIGN.md` §7.4; `ARCHITECTURE.md` §4.9.

## 30. `WhenField` look

- **Conflict:** `ARCHITECTURE.md` §10.2 styled the typed text with per-span `AttributedString` runs (date underlined in accent, time in `pool`, location in `dim`) plus chips. `DESIGN.md` §7.6/§7.5: plain `Font.dt.body` input on a baseline rule with a parse preview line "→ thu 25 sep · 7:00pm" in `.successInk` / "couldn't read that" in `.dangerInk` and "date-ish"/"time-ish" toggles.
- **Decision:** `DESIGN.md`'s look; `ARCHITECTURE.md`'s `parseWhen` / `findDateTimeSpans` plumbing and the `WhenParse` value it publishes.
- **Where:** `ARCHITECTURE.md` §10.2.

## 31. iOS 26 system surfaces accepted as-is

- **Conflict:** `ARCHITECTURE.md` §14.16 listed "the ⋯ `Menu`" as a glass system surface and `DTConfirmDialog` as an owned replacement; `DESIGN.md` §4.1/§7.5 open `CheckActionsSheet` from "⋯" and use the system `.contextMenu(preview:)` on long-press, and use native `.confirmationDialog` for every confirm.
- **Decision:** the accepted list is: long-press context menus (our preview, their menu), `.confirmationDialog`, keyboard, share sheet, `PhotosPicker`, `PasteButton`, the `.graphical` `DatePicker` (M2), the delete-account alert, the OTP autofill bar. "⋯" opens `CheckActionsSheet`. Everything we draw is cream.
- **Where:** `ARCHITECTURE.md` §14.16.

## 32. Contrast note on `dim`

- **Conflict:** `ARCHITECTURE.md` §14 said `dim` on `bg` is 3.2:1 and acceptable for 10 pt labels. `DESIGN.md` §8: it is 3.45:1, may carry only decorative or redundant text, and section labels / anything the user reads are `inkMuted`.
- **Decision:** `DESIGN.md` §8 (the audit rule: "if deleting the text would remove information, it is at least `inkMuted`; if the row is at less than full opacity, it is a bug").
- **Where:** `ARCHITECTURE.md` §14 accessibility paragraph, §13 "Typography".
