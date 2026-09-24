# down to — native SwiftUI design spec (FINAL)

Status: locked for build — **revision 4 — reconciliation** (revision 2 added the contrast audit, missing surfaces, loading/offline and API corrections; revision 3 removes every whole-entry opacity dim, addresses iOS 26 glass toolbar items and sheet geometry, and specifies chat lifecycle states, EditCheck, date propose/clear, deep links, event entry states, push cleanup and the remaining API/contrast nits; revision 4 reconciles this document with `ARCHITECTURE.md` — every conflict and its resolution is in `DECISIONS.md`, which wins over both; the ledger in §11 lists every change). Supersedes the three angle proposals (editorial, tactile, native26). Base is the editorial / print angle; the grafts from the other two are folded in where noted with `[graft: tactile]` / `[graft: native26]`.

**Precedence.** `INVENTORY.md` wins on *what* the app does, `ARCHITECTURE.md` on *how it is built* (module layout, stores, router, data flow, milestone scope), this document on *how it looks and feels* (tokens, type, motion, haptics, component anatomy), and `DECISIONS.md` over all three. **Naming.** The token, spring, haptic and component names in this document are the code names (`Color.paper`, `Font.dt.meta`, `DTSpring.stamp`, `CheckEntry`, `Folio`, `Slip`, `Pull`, `Masthead`, `.dtSheet`). Screens and sheets keep `ARCHITECTURE.md`'s file names; where this document uses the web's word the code name is: `DeletedCheckScreen` → `DeletedCheckView`, `UserProfileOverlay` → `UserProfileSheet`, `EditCheck` → `EditCheckSheet`, `SquadSettings` → `SquadSettingsSheet`, `SquadMembers` → `SquadMembersView`, `DateProposal` → `DateProposalSheet`, `FriendsModal` → `FriendsSheet`, check detail → `CheckDetailView` (a zoom push, §5.4), Create → `CreateOverlay` (§7.6), the toast store → `ToastCenter` (its view is `Slip`). **M1 scope** is `ARCHITECTURE.md` §15; §7.0 below says what each screen in §7 shows in M1.

Read first: `apps/ios/docs/INVENTORY.md` (the complete web inventory — screens, data model, API, push, UI patterns). Then `PRODUCT.md`, `specs/*.md`, `src/app/global.css`, `src/lib/themes/guava.ts`, `src/lib/censor.ts`, `src/features/checks/lib/mystery.ts`, `src/shared/components/Grain.tsx`, the funny-system-messages migration and `src/features/checks/components/DeletedCheckScreen.tsx`.

Hard constraints: iOS 26 minimum, SwiftUI only, Swift 6.2 strict concurrency, single portrait iPhone app, Xcode 26.2. Every number below is points (pt) unless stated. Every API cited exists on iOS 26 (`.navigationTransition(.zoom)`, `onScrollGeometryChange`, `onScrollVisibilityChange`, `TextRenderer`, `.contentTransition(.numericText(countsDown:))`, `.sensoryFeedback`, `presentationContentInteraction`, `CoreHaptics`, `UIFontDescriptor` variation axes, `.contextMenu(menuItems:preview:)`).

---

## 0. Thesis

The web app is already paper-coloured. The native app commits to it:

- **The feed is a broadsheet.** Full-bleed hairline rows, not boxed cards. Section labels are printed running heads with a rule. Tint bands and a 3pt magenta edge rule mark state.
- **A check is an entry.** Byline, body, when·where, response row. It lives on one left margin down the whole page.
- **A squad chat is a transcript.** No bubbles. Left-aligned mono, your groups marked by one magenta rule, system lines in italic between ✶ ✶.
- **A sheet is a second sheet of stock laid on top.** Paper under paper is dimmed, not blurred. Depth comes from stacked paper, hairlines, tint bands and grain — never ambient drop shadows on the page.
- **Magenta is a rubber stamp and a highlighter.** It marks *your* ink and *the* action. Never decoration, never a border on things you did not touch.
- **Motion is a page turning** — fast, damped, settles flat — with exactly two moments allowed to bounce: the DOWN stamp and SQUAD FORMED. A third, the avatar fan-out, may bounce only because it is driven by the same spring as the stamp family (`Spring.ink`).
- **Cause, then effect.** `[graft: tactile]` Whatever the finger touched moves first; the thing it affects follows ~60ms later. Press-in is a fast ease (60–70ms); release is always a spring. Fast down, weighty up.
- **Copy is dry, motion carries the joy.** Lowercase, deadpan. The words don't have to be funny if the motion lands them.

Five brand principles the whole document obeys: (1) no shadows on the page, (2) magenta is a verb, (3) mono is the voice, Inter is the headline, (4) only stamps bounce, (5) never shove the page while someone is reading.

---

## 1. Colour tokens

### 1.1 Dark mode decision

**v1 ships light only.** `.preferredColorScheme(.light)` on the root `WindowGroup`, `UIUserInterfaceStyle = Light` in Info.plist.

- The brand *is* cream paper. Every card-state tint (`#ECFFA5`, `#F0FFD8`, `#FFF5CC`, `#FFF3E0`) is a tint *of* paper; none has been tested dark.
- The web has no dark mode; its theme switcher is guava/dragonfruit (paper vs paper).
- Friends-and-family scale, one developer: doubling QA on a three-tab app is the wrong trade.
- Magenta-on-cream is the recognisable screenshot.

The dark palette is specified regardless and lands in the Asset Catalog `Any / Dark` slots from day one so that v1.1 ships it as a **user toggle in Profile ("night edition")**, not system-follow. The paper look is a choice, not a preference.

### 1.2 Palette

Declare each token as an Asset Catalog colour set; expose as `extension Color` and `extension ShapeStyle where Self == Color`. Views never see hex.

| Swift name | Role | Light | Dark (v1.1) |
|---|---|---|---|
| `Color.paper` | page background | `#FCFFE2` | `#141410` |
| `Color.card` | entry background (same as paper; entries rely on hairlines) | `#FCFFE2` | `#141410` |
| `Color.surface` | sheets, panels, composer, chat header | `#E0DCC8` | `#1E1E18` |
| `Color.deep` | modals, confirm dialogs, poll cards, squad-formed strip | `#D8D4C0` | `#262620` |
| `Color.ink` | primary text | `#2A2A1A` | `#F2F2DC` |
| `Color.inkMuted` | secondary text (other people's names, previews, sheet subtitles). **On `surface`/`deep` this resolves to `#55554A`** (5.47 / 5.06) via the stock rule below | `#6B6B5A` (paper) / `#55554A` (surface, deep) | `#B8B8A0` |
| `Color.inkExpired` | body text of **expired and hidden** entries — the receded voice. One step below `inkMuted`, still AA on every paper-family stock: **5.07 paper, 4.80 checkDown, 4.94 checkMine, 4.74 checkNew, 4.73 waitlistBg, 4.79 downIdle**. Never on `surface`/`deep` (3.77 / ✗) — expired entries only ever sit on the feed. It replaces every "whole entry at 0.55 / 0.7" rule the earlier revisions had (§4.1, §7.4, §8): entries are never dimmed by opacity | `#6E6E5C` | `#A6A690` |
| `Color.inkDim` | tertiary — **decorative or redundant only** at ≤ 13pt (§8 lists what qualifies; anything the user must read is `inkMuted`) | `#8A8A70` | `#8A8A70` |
| `Color.inkFaint` | placeholder, disabled, separators, the "·" between metadata — **never a value the user reads** | `#B0B098` | `#5A5A48` |
| `Color.rule` | default hairline | `#D8D4C0` | `#2C2C24` |
| `Color.ruleLight` | subtle separators, chip fill, other-avatar fill | `#C8C4B0` | `#363630` |
| `Color.ruleMid` | emphasised borders, sheet/tab-bar top rule | `#B8B4A0` | `#44443A` |
| `Color.dt` | brand magenta — fills, stamps, 2–3pt rules, and **decorative glyphs only** (the "✶", the "?" in the mystery band). Never text that carries information at any size: `#FE44FF` on cream is 2.74:1, below even the 3:1 large-text floor | `#FE44FF` | `#FE44FF` |
| `Color.dtInk` | magenta as text **on `paper`/`card` and the paper-family tints** (4.93 on paper, 4.66 on checkDown, 4.60 on waitlistBg) and 1pt state hairlines | `#C400C6` | `#FF7AFF` |
| `Color.dtInkOnSurface` | magenta as text **on `surface`, `deep`, `ruleLight` and any tint laid over them** — 5.05 on surface, 4.67 on deep, 6.81 on paper, 4.68 on dtSubtle-over-surface. Resolved automatically by the stock rule below | `#A000A2` | `#FF9AFF` |
| `Color.onDt` | text/glyphs on magenta fills (**ink, not white**) | `#2A2A1A` | `#141410` |
| `Color.dtFaint` | magenta 4% (press states on rows) | `#FE44FF` @ 0.04 | @ 0.06 |
| `Color.dtSubtle` | magenta 8% (flashes, mention chips) | @ 0.08 | @ 0.10 |
| `Color.dtLight` | magenta 15% (poll bars, glyph circles) | @ 0.15 | @ 0.18 |
| `Color.dtMid` | magenta 50% (your poll vote) | @ 0.50 | @ 0.50 |
| `Color.pool` | crew pool / "looking for a squad" | `#00D4FF` | `#00D4FF` |
| `Color.poolInk` | pool as text | `#007A93` | `#5AE3FF` |
| `Color.squad` | squad purple — **fills, rings and the squad_invite glyph circle only** (3.87:1 on cream, not text) | `#A855F7` | `#B47CFF` |
| `Color.squadInk` | squad purple as text: JOIN SQUAD →, REQUEST TO JOIN, "N looking" (5.90 on paper, 5.58 on checkDown; on surface/deep it resolves to `#6A34B8`, 5.45 / 5.04) | `#7C3FD0` / `#6A34B8` | `#C9A6FF` |
| `Color.danger` | destructive fills, urgent expiry fill | `#FF6B6B` | `#FF7B7B` |
| `Color.dangerInk` | danger as small text (5.10 on paper; on surface/deep resolves to `#A82E2E`, 4.92 / 4.55) | `#C63838` / `#A82E2E` | `#FF9C9C` |
| `Color.success` | **fills and the 3pt toast rule only** (7.25:1 on ink; 1.96:1 on cream — never text on paper) | `#51CF66` | `#6BE07E` |
| `Color.successInk` | success as text: "you're in ✓", "looks good", the parsed-date preview, LOCKED — 5.28 on paper, 4.99 on checkDown; on surface/deep resolves to `#1A6B2B` (4.79 / 4.43 — deep is the one stock where successInk is paired with an ink-coloured label, see stock rule) | `#1F7A32` / `#1A6B2B` | `#8EE59E` |
| `Color.warn` | 24h nudge, FADING ✶, waitlist accents, dashed waitlist rules | `#FFA94D` | `#FFB866` |
| `Color.warnInk` | warn as small text: WAITLISTED, "you're #2 on the waitlist", WAITLIST badge — **`#8F5210`**: 5.66 on waitlistBg, 6.07 on paper, 4.51 on surface (the earlier `#B86E1E` was 3.62 on waitlistBg and fails; §8 has been corrected) | `#8F5210` | `#FFC98A` |
| `Color.info` | informational toasts | `#5AC8FA` | `#6AD0FF` |
| `Color.unreadSquad` | squad unread dot | `#FF3B30` | `#FF453A` |
| `Color.newLime` | NEW flag fill | `#C2FF8A` | `#8FD95A` |
| `Color.newInk` | NEW flag text `[graft: native26]` — was `#FF00D4` (3.6:1); bumped so the flag passes AA without an Increase Contrast fallback | `#C400A6` | `#141410` |

`Color.onDt` is ink, not white. White on `#FE44FF` is 2.8:1; ink on `#FE44FF` is 5.2:1. It also reads as a stamp rather than a button, and CLAUDE.md already describes primary as "bg-dt filled, dark text". This is a deliberate departure from the web's `onAccent: #fff`.

**The stock rule — `\.paperStock`.** Coloured small text has two ratios in this app: one on cream, one on the darker stocks (`surface` `#E0DCC8`, `deep` `#D8D4C0`, `ruleLight` `#C8C4B0`), and the second is 25–30% worse. Rather than asking every call site to remember, the token layer resolves it:

- An `EnvironmentKey` `paperStock: PaperStock` (`.paper` default, `.surface`, `.deep`). `.dtSheet` sets `.surface`; the chat header, composer, date-confirm bar and Create overlay set `.surface`; every `Color.deep` card (poll, date-confirm, join-request banner, SQUAD FORMED strip, @mention list, lobby squad cards, webcal block) sets `.deep` on its content.
- The "ink" tokens are exposed as `ShapeStyle`s that read the environment: `.dtInk`, `.squadInk`, `.dangerInk`, `.successInk`, `.warnInk`, `.inkMuted` resolve to their surface variants when `paperStock != .paper`. Views write `Text("OPEN →").foregroundStyle(.dtInk)` and get `#C400C6` on the feed and `#A000A2` on a sheet without knowing. (Implementation: `struct DTInk: ShapeStyle { func resolve(in env: EnvironmentValues) -> Color }`, iOS 17+.)
- Static `Color.dtInk` / `Color.dtInkOnSurface` etc. remain for the rare non-view use (Canvas, UIKit bridges) and for this document, which names the resolved token where it matters.
- **Hard floor on `deep`:** only `ink`, `inkMuted(#55554A)`, `dtInkOnSurface`, `squadInk(#6A34B8)` and `dangerInk(#A82E2E)` may be small text. `warnInk` on deep is **4.17 — it is never text on deep at any size this app uses**. (WCAG "large" is measured in CSS points at 1/72in: 18pt regular ≈ 24 CSS px ≈ 24 iOS pt, 14pt bold ≈ 18.7 iOS pt. No iOS label under 19pt bold / 24pt regular ever qualifies, so the "≥ 14pt bold" exception the earlier revision allowed did not exist. See §8.) On deep, warn is a glyph (`?`, `✶` at ≥ 3:1 as a decorative graphic) or the words are `Color.ink` — the same pattern as `successInk` on deep. `successInk` on deep is 4.43, so on deep cards the ✓ glyph is `successInk` and the words "you're in" are `Color.ink` (§4.10). `poolInk` on deep is `#00607A` (4.77).
- Tinted fills over stock (`dtSubtle`, `dtLight`, `pool@0.2`, …) count as the stock underneath for text purposes; the only text allowed on `dtLight`/`squad@0.2` over surface/deep is `Color.ink` (≥ 8:1) — the notification glyph circles (§7.9) therefore carry glyphs at ≥ 3:1 as *decorative graphics* (`accessibilityHidden`) with the title carrying meaning, never text.

### 1.3 Card-state tints

| Swift name | State | Light | Dark |
|---|---|---|---|
| `Color.checkMine` | you authored / co-authored it | `#F0FFD8` | `#1C2414` |
| `Color.checkDown` | you're down | `#ECFFA5` | `#26301A` |
| `Color.checkNew` | created since last visit | `#FFF5CC` | `#2A2614` |
| `Color.checkNewRule` | hairline under a new entry | `#E8E0B0` | `#3E3A22` |
| `Color.waitlistBg` | you're waitlisted `[graft: tactile]` — distinct warm tint so waitlisted never shares idle | `#FFF3E0` | `#2E2416` |
| `Color.downIdle` | DOWN pill idle fill | `#F5F7EA` | `#1A1C14` |
| `Color.downIdleRule` | DOWN pill idle border | `#CDC999` | `#3C3E2A` |
| `Color.heroWash` | event hero wash | `#FCFFE2` @ 0.30 | `#141410` @ 0.45 |
| `Color.heroWashDown` | event hero wash when down | `#C8E63C` @ 0.30 | `#C8E63C` @ 0.22 |

**Precedence** when several apply: `down` > `waitlisted` > `mine` > `new` > `idle`. A `new` entry you are already down on shows the `down` tint *plus* the NEW flag. `expired` keeps whichever tint applied (so an expired check you were down on still reads as yours) but **never dims the entry** — it recolours the *text* to `Color.inkExpired` and strips the decorative layers (§4.1). `mystery` is additive (the "?" frame) on top of whichever tint applies.

### 1.4 Grain

`Grain` is a full-screen overlay: `Image("grain-256")` — a 256×256 fractal-noise tile (baseFrequency 0.9, 4 octaves, exported as 8-bit grey PNG) — `.resizable(resizingMode: .tile)`, `.opacity(0.03)`, `.blendMode(.multiply)`, `.allowsHitTesting(false)`, `.ignoresSafeArea()`. Mounted once as `.overlay` on the root `ZStack`, above all content including the Folio tab bar and the Create overlay. Native `.sheet` renders in its own window, so each sheet also mounts its own copy at 0.03 inside `.dtSheet`. Dark: `.blendMode(.plusLighter)` at 0.045. Grain never animates and is unaffected by Reduce Motion.

---

## 2. Typography

**Font files (DECISIONS #5).** Bundle **`InterVariable.ttf`** (the variable font with `wght` + `opsz` axes, from the root of the github.com/rsms/inter release zip, Inter ≥ 4.0 — no static Inter cuts, no italic Inter) and the **five static IBM Plex Mono cuts** `IBMPlexMono-{Regular,Medium,SemiBold,Bold,Italic}.ttf` (from github.com/IBM/plex releases, `IBM-Plex-Mono/fonts/complete/ttf/`). Register all six in `UIAppFonts` (`ARCHITECTURE.md` §1.1). Faces are addressed by **PostScript name**, which is not the file name: Inter's variable face is `InterVariable`; Plex Mono's are `IBMPlexMono` (Regular — no suffix), `IBMPlexMono-Medm`, `IBMPlexMono-SmBld`, `IBMPlexMono-Bold`, `IBMPlexMono-Italic` (IBM abbreviates Medium and SemiBold). `TypographyTests` asserts `UIFont(name:size:)` is non-nil for all six names so a wrong name fails CI instead of silently falling back to Helvetica; verify with `fc-scan --format '%{postscriptname}\n' <file>` or Font Book → Identifier on first import.

**Construction — one pipeline, no `.weight()`, no `Font.custom`.** SwiftUI's `.weight()`/`.bold()` cannot drive a variable font's `wght` axis and `Font.custom(_:size:relativeTo:)` cannot carry variation attributes, so every style is built through `UIFontDescriptor`:

```swift
enum DTTextStyle { case masthead, wordmark, display, title, checkText, headline, numeral, displayCount, body, bodySmall, meta, label, button, buttonLarge, badge, system, kaomoji
    var size: CGFloat; var relativeTo: UIFont.TextStyle; var wght: CGFloat; var opsz: CGFloat?; var trackingEm: Double; var face: Face   // the table in 2.1
}
extension Font { enum dt { static var masthead: Font { DTTextStyle.masthead.font() } /* … one per row of 2.1 … */ } }
// DTTextStyle.font(compatibleWith: UITraitCollection? = nil):
//   Inter:  UIFontDescriptor(fontAttributes: [.name: "InterVariable",
//              kCTFontVariationAttribute as UIFontDescriptor.AttributeName: [0x77676874 /*wght*/: wght, 0x6F70737A /*opsz*/: opsz]])
//           + kNumberSpacingType/kMonospacedNumbersSelector feature settings where 2.1 says tabular
//   Plex:   UIFontDescriptor(name: "IBMPlexMono" | "IBMPlexMono-Medm" | "IBMPlexMono-SmBld" | "IBMPlexMono-Bold" | "IBMPlexMono-Italic", size:) — the static cut whose weight the row names
//   then:   Font(UIFontMetrics(forTextStyle: relativeTo).scaledFont(for: UIFont(descriptor: d, size: size), compatibleWith: traits))
```

`UIFontMetrics.scaledFont(for:)` is the single Dynamic Type scaling step (never `Font.custom(_:size:relativeTo:)` on top of it, never `@ScaledMetric` on the size — that would scale twice, `ARCHITECTURE.md` §13). `Font.dt.*` are computed properties, not stored constants, and the `.dtFont(_:)` view modifier reads `\.dynamicTypeSize` and passes the matching `UITraitCollection(preferredContentSizeCategory:)` so a size change re-resolves the font in the same render. There is **no** global clamp on the scale factor: §8's Dynamic Type rules (Folio labels wrap, the grid becomes a list, the OTP numeral drops to 28) are the adaptations. Bold Text (`\.legibilityWeight == .bold`) adds 100 to `wght` for Inter and steps Plex up one cut.

Tracking is given in em (design value) and in pt at the default size (what `.tracking()` takes). Because `.tracking()` does not scale with Dynamic Type, wrap it — but not with `@ScaledMetric`, which is a property wrapper and cannot live in a `Text` extension. `Text.dtTracking(_ em: Double, style: DTTextStyle)` computes `em × UIFontMetrics(forTextStyle: style.relativeTo).scaledValue(for: style.size)` at call time (the metric is pure and cheap), and the `View`-level variant `.dtTracked(_:)` re-evaluates on `\.dynamicTypeSize` changes. Line height is achieved with `.lineSpacing(target − natural)`; Inter's natural line height ≈ 1.21×, Plex Mono ≈ 1.30×.

### 2.1 Scale — `Font.dt.*`

| Name | Face | Size / line | Weight | Tracking | `relativeTo` | Used for |
|---|---|---|---|---|---|---|
| `masthead` | Inter (opsz 32) | 34 / 36 | 700 | −0.04em (−1.36) | `.largeTitle` | Auth headline wordmark, empty-state "✶", onboarding headlines |
| `wordmark` | Inter (opsz 28) | 26 / 28 | 700 | −0.04em (−1.04) | `.title` | "down to" / "squads" / "you" in the Masthead (§4.12) |
| `display` | Inter (opsz 28) | 28 / 32 | 600 | −0.04em (−1.12) | `.title` | Check text in detail, "who's down?", deleted-check quip, empty-state headline, Create editor text |
| `title` | Inter | 22 / 26 | 600 | −0.035em (−0.77) | `.title2` | Event title on hero, sheet titles, chat header name, email field text |
| `checkText` | Inter | 19 / 24 | 500 | −0.03em (−0.57) | `.title3` | Check body on the feed entry — **see 2.3, decision to prototype** |
| `headline` | Inter | 17 / 22 | 600 | −0.03em (−0.51) | `.headline` | Poll question, date-confirm question, row titles, squad names |
| `numeral` | Inter, tabular (`tnum`) | 40 / 44 | 700 | −0.04em (−1.6) | `.largeTitle` | OTP digits, chat countdown < 1h, "+N" big counts, squad-size stepper (at 28) |
| `displayCount` | Inter, tabular | 44 / 48 | 700 | −0.04em (−1.76) | `.largeTitle` | Mystery-reveal count-up "N down" `[graft: native26]` |
| `body` | IBM Plex Mono | 14 / 20 | 400 | −0.02em (−0.28) | `.subheadline` | Chat messages, comments, form inputs, detail body, toast text |
| `bodySmall` | IBM Plex Mono | 13 / 18 | 400 | −0.03em (−0.39) | `.footnote` | Entry when·where line, "Sara + 2 others down", last-message preview, notification titles |
| `meta` | IBM Plex Mono | 11 / 14 | 400 | −0.02em (−0.22) | `.caption` | Timestamps, "via Sara", countdowns, venue, byline names |
| `label` | IBM Plex Mono | 10 / 12 | 500 | **+0.12em (+1.2)**, uppercase | `.caption2` | Section labels ("TIMED", "OPEN", "NEW MESSAGES"), vibe pills, setting chips, tab labels (at 11) |
| `button` | IBM Plex Mono | 12 / 16 | 700 | +0.06em (+0.72), uppercase | `.caption` | DOWN, STILL DOWN, CAN'T MAKE IT, ACCEPT, sheet text CTAs |
| `buttonLarge` | IBM Plex Mono | 14 / 18 | 700 | +0.10em (+1.4), uppercase | `.subheadline` | Full-width CTAs (SEND CODE, POST, SQUAD FORMED stamp) |
| `badge` | IBM Plex Mono | 9 / 10 | 700 | +0.10em (+0.9), uppercase | `.caption2` | NEW flag, WAITLIST badge, "+N" overflow, LOCKED stamp |
| `system` | IBM Plex Mono Italic | 12 / 16 | 400 | 0 | `.caption` | Chat system messages, "say something. or don't." |
| `kaomoji` | **cascade**, see 2.2 | avatar diameter × 0.36 (min 9) inside avatars; **in running text (bylines, chat sender rows, the reveal) it takes the size of the style it replaces** | 500 | 0 | avatars: the avatar's own `@ScaledMetric` diameter (so it scales with the surrounding text via the avatar); running text: the host style's `relativeTo` | Kaomoji in mystery avatars, mystery bylines, chat sender rows |

### 2.2 Kaomoji font cascade `[graft: tactile]`

IBM Plex Mono lacks most of the glyphs in `censor.ts`'s `KAOMOJI_POOL` (`(⌐■_■)`, `(˘ω˘)`, `(◍•ᴗ•◍)`, `( ˙꒳​˙ )`, `(¯ ͜ʖ ¯)` …). Left to its own devices SwiftUI will fall back per-glyph and the kaomoji will render with mixed widths and weights, or as tofu. `Font.dt.kaomoji` is therefore built through `UIFontDescriptor` with an explicit cascade list:

```
let base = UIFontDescriptor(name: "IBMPlexMono-Medm", size: s)   // IBM's PostScript name for the Medium cut (§2 font files)
let cascade: [UIFontDescriptor] = [
    UIFontDescriptor(name: "HiraginoSans-W3", size: s),       // ω ◡ ◕ ■ ˘ — iOS ships W3/W6/W7 only; W4 is macOS and would silently drop out
    UIFontDescriptor(name: "AppleSDGothicNeo-Medium", size: s), // ᴗ ◍ ⌐ ¯ (Latin/IPA extensions Hiragino lacks)
    UIFont.systemFont(ofSize: s).fontDescriptor                 // SF / Apple Symbols / Geneva fallbacks — this is the only valid way to name the system face; ".family: SF Pro" is not a family name
]
let kaomoji = base.addingAttributes([.cascadeList: cascade])
```

Known coverage holes after that cascade: `ʖ` (U+0296, IPA — in Apple SD Gothic Neo and the system fallback), `꒳` (U+A4B3, Yi Radical — **only** the system's Yi fallback covers it; if it renders as tofu on device replace the pool entry with `( ˙ᴗ˙ )`), and `ς` (Greek final sigma — Hiragino has it, so fine). The pool entry `( ˙꒳​˙ )` in `censor.ts` contains a literal **U+200B zero-width space** between `꒳` and `˙`; strip `U+200B`/`U+200C`/`U+FEFF` from every kaomoji when porting the pool (`String.unicodeScalars.filter`) or width measurement and `minimumScaleFactor` misbehave.

The kaomoji is rendered as a single `Text` with `.minimumScaleFactor(0.6)` and `.lineLimit(1)` so a wide one (`(っ˘ω˘ς)`) still fits its avatar. Every kaomoji `Text` gets `.accessibilityLabel("mystery host")` (or `"hidden member"` in chat). **Verify all 20 pool entries on device at 9, 13 and 26pt** — check for tofu, mixed weights and vertical-metric jumps between Plex and Hiragino (Hiragino's ascent is taller; set `.baselineOffset` per glyph run if the row height jumps) — before locking the cascade order.

### 2.3 Rules — and one decision to prototype

- Inter sets only **headings, the check text, numerals, the wordmark and avatar letters**. Everything else is Plex Mono. If unsure, it's mono.
- Uppercase tracked labels use `.textCase(.uppercase)` + `.tracking(...)`, never an uppercased string (VoiceOver reads the real string). Trailing tracking is trimmed by `.padding(.trailing, −tracking)`.
- Tabular figures everywhere a number ticks: Plex Mono is already fixed-pitch; for Inter build the descriptor with `kNumberSpacingType / kMonospacedNumbersSelector`.
- `[graft: native26]` **Every ticking number** — "Xh left", "N down", "+N", unread pill, poll counts, squad-size stepper, chat countdown, OTP resend countdown, "12/30" counters — gets `.contentTransition(.numericText(countsDown:))` with `countsDown` true for anything decreasing. The digits roll instead of snapping, and it removes the jitter Inter numerals otherwise show. Animate with `Spring.settle`.
- Inter's `opsz` axis (tag `0x6F70737A`): ≥ 28pt uses opsz 28–32 (display cut, tighter apertures); < 20pt uses opsz 14. Set via `UIFontDescriptor` variation attribute.
- Heading `letter-spacing: −0.04em` from the web is kept at ≥ 26pt and relaxed to −0.03em below 20pt, where −0.04 clogs Inter's counters.
- Plex Mono at 10pt goes to +tracking (labels) or 0; negative tracking clogs mono counters at that size.
- **`checkText` face — decided as a token, compared on device (DECISIONS #6).** `Font.dt.checkText` **defaults to Inter 19 / 24, weight 500, −0.03em** (web parity: `CheckCard.tsx`, where check text is the one Inter element). native26's "mono is the voice" reading argues for **IBM Plex Mono 15 / 22, weight 400, −0.03em**, reserving Inter for the masthead, display quips, titles and numerals. The two candidates are the two cases of one token — `DTTextStyle.checkText.face: CheckTextFace = .inter` (`.inter` = Inter 19/24/500/−0.03em, `.mono` = Plex Mono 15/22/400/−0.03em) — so switching is a **one-line change** in `Typography.swift`, and the `ComponentGallery` renders the entry in both faces side by side. The product owner compares both on device with real feed data and flips the default if mono wins; nothing else in this document depends on the choice (the skeleton rule height in §7.15 and the POST flight in §7.6 read the token).
- Bold Text (system setting): Inter 500 → 600, Plex 400 → 500, via the token layer.

---

## 3. Spacing, radius, elevation

### 3.1 Spacing — `Space.*` (4pt grid)

`xxs 2 · xs 4 · s 8 · m 12 · l 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`

- Page gutter: **20** (web is 16; a broadsheet wants margin). Chat gutter: 16.
- Entry inner padding: 16 top/bottom, 20 sides. Text sits on one left margin down the whole page.
- Gap between entries: **0**. Entries are separated by a 1pt `Color.rule` hairline, full-bleed. Tint bands are full-bleed.
- Section label: 24 above, 8 below.
- Sheet inner padding: 24 sides, 12 below the handle region.
- Bottom content inset on scroll views: Folio height + safe area + 8.

### 3.2 Radius — `Radius.*`

`none 0 · xs 6 · s 10 · m 12 · l 16 · sheet 24 · pill 999`

- Feed entries: 0 (rows of a page).
- Cards inside sheets/chat (poll card, date-confirm card, notification glyph circle, lobby card): 12.
- Hero image, inputs, chat images, toast: 12.
- Pills, chips, DOWN toggle, send button: pill.
- Sheets: 24 top corners (`presentationCornerRadius(24)`).
- Confirm dialogs / alerts: 16.
- Squad-formed stamp: 8. Movie poster: 6.

All rounded rects are `.continuous`.

### 3.3 Elevation — `Elevation.*`

Paper has no ambient shadow. Three levels:

| Level | Where | Treatment |
|---|---|---|
| `flat` | page, entries, transcript | none; hairlines and tint bands only |
| `laid` | bottom sheets, date-confirm bar, composer, chat header, detail DOWN bar, Folio | 1pt top rule `Color.ruleMid` + paper-edge shadow `y:−1 blur:0 ink@0.06` + soft `y:8 blur:24 ink@0.10` (dark: `black@0.5`). **Exception:** the Folio uses only the 1pt rule — it is the bottom of the page, nothing is under it. |
| `lifted` | toasts, SQUAD FORMED stamp, confirm dialogs, image viewer, context-menu preview, "N new ↑" pill | `y:12 blur:32 ink@0.16` + 1pt rule `Color.ruleMid` |

`ink@0.06` = `Color.ink.opacity(0.06)`. Elevation is otherwise never applied to a moving entry; a pressed entry changes tint and scale, not shadow (§4.1).

---

## 4. Component language

### 4.1 Check entry — `CheckEntry`

Anatomy top → bottom, inside the 20pt gutter, 1pt `Color.rule` below (full-bleed):

1. **Expiry rule** (timed checks only, §4.2). Very top edge, full-bleed.
2. **Byline row** (height 24): avatar `inline` 24 → 8 → author name `Font.dt.meta` weight 500 `Color.dtInk` (yours: `Color.ink` 600, reads "you") → "via Sara" `Font.dt.meta` `Color.inkDim` (redundant: the same friend appears in the response row / detail) → spacer → "3h left" `Font.dt.meta` tabular **`Color.inkMuted`** (the rule is `accessibilityHidden`, so this label is the only carrier of the value; → `Color.dangerInk` when > 75% elapsed; `.numericText(countsDown: true)`) → "⋯" glyph 24×24 in a 44×44 hit target, `Color.inkDim` (non-owners only; decorative — the long-press path duplicates it).
3. **Movie header** (optional): poster 40×60 radius 6, title `Font.dt.headline`, year · director `Font.dt.meta` `Color.inkDim`.
4. **Check text**: `Font.dt.checkText` `Color.ink`, max 6 lines on feed with a 24pt fade-out mask on the last line (full text in detail). @mentions and links `Color.dtInk` weight 500, no underline.
5. **When · where**: `Font.dt.bodySmall` `Color.inkMuted`, joined with " · ". "-ish" suffixes for date-flexible/time-flexible in `Color.inkDim`.
6. **Response row** (height 36): left — `AvatarStack` `small` (max 3 + "+N") → "Sara + 2 others down" `Font.dt.bodySmall` `Color.inkMuted` / "no responses yet" `Color.inkMuted` / mystery "guests revealed on the day" `Color.inkMuted` italic (all three are the row's only content, so none may be `inkDim`/`inkFaint`). Counts use `.numericText`. Right — **DOWN toggle** (§4.3). On your own check: no toggle; "N down" `Font.dt.meta` `Color.inkMuted`.
   **"OPEN SQUAD →" — the permanent route to the chat.** Whenever a squad is linked to the check *and you are a member of it (role `member` or `waitlist`) — author included* — a trailing "OPEN SQUAD →" `Font.dt.meta` `.dtInk` (500) link sits under the toggle, right-aligned, in its own 44-tall target (checks only; events route through the lobby, §4.5). It is the native successor of the web's permanent "💬 Squad →" (specs/interest-check-flow.md). It appears the moment `squadId` is known: for the author, when the first other person is down (the formation strip of §5.6 folds back after 8s, this link does not); for a joiner, after the "you're in" strip folds (§5.6); for a waitlisted member it reads "OPEN SQUAD →" too (the chat is readable, §4.10). It **persists in the expired state** for as long as the squad exists — the check's timer and the squad's +24h grace are different clocks (INVENTORY §2), and a CLOSED check with a live chat is the normal last day of a squad. The link disappears only when the squad is archived (the row reflows with `Spring.settle`; no toast). On the author's own check the link is the *only* trailing control, so it takes the toggle's slot: "N down · OPEN SQUAD →". Unread messages: a 6pt `Color.unreadSquad` dot leads the link (same dot as §4.7, smaller). VoiceOver: "open squad, button" as a custom action on the entry.
7. **Co-author strip** (tagged, pending): 1pt `Color.rule` above, "you were tagged" `Font.dt.label` **`Color.inkMuted`** (it is the only explanation of why the strip exists), ACCEPT `Color.dtInk` / DECLINE `Color.inkMuted` in `Font.dt.button`.
8. **Comments** (only if ≥ 1): 1pt `Color.ruleLight` above, up to 2 comments `Font.dt.bodySmall` with name `Color.dtInk`, then "N more →" `Font.dt.meta`.

**States**

| State | Background | Left edge | Other |
|---|---|---|---|
| idle | `Color.card` | — | |
| new | `Color.checkNew` band, full-bleed; hairline below → `Color.checkNewRule` | — | NEW flag (§4.6) bleeding off the right edge at y = 12 |
| mine | `Color.checkMine` | 3pt `Color.dt` rule flush to the screen edge, entry height | byline "you" `Color.ink` 600 |
| down | `Color.checkDown` | 3pt `Color.dt` rule flush left | toggle active |
| waitlisted | `Color.waitlistBg` `[graft: tactile]` | 3pt **dashed** `Color.dt` rule (dash 4, gap 3) | toggle dashed; "you're #2 on the waitlist" `Font.dt.meta` `Color.warnInk` under the response row |
| expired | current tint kept; **no opacity on the entry** | rule → `Color.ruleLight` (from `Color.dt`), dashed if it was dashed | **Text recolours, ink never fades.** Check text → `Color.inkExpired` (`#6E6E5C`, ≥ 4.73 on every feed stock); when·where → `Color.inkExpired`; author name stays `.dtInk` (4.93 — a name is a name; the receded body is what marks the state); "expired" replaces "Xh left" in `Color.inkMuted` (5.30 — the state word is the loudest text on the row); toggle CLOSED with `Color.inkMuted` word (§4.3). **Decorative layers dim instead:** the byline avatar fill → `Color.ruleLight` and its letter → `Color.inkExpired`; response-row avatars keep their fills but drop to `.opacity(0.6)` (they are decorative — the "Sara + 2 others" text carries the value, and that text is `Color.inkMuted`); the NEW flag is removed; the expiry track empties. Strikethrough 1pt `Color.inkFaint` on the check text **only in the HIDDEN section**, never in the main feed. OPEN SQUAD → persists (see the response-row note above). |
| mystery, unrevealed (viewer ≠ author) | as above | — | "?" frame (below); byline avatar → kaomoji; name → symbol scramble (`censor.ts`) `Font.dt.meta` `Color.inkMuted` 500 (it *is* the byline; the scramble is the design, not the dimness); response row → "guests revealed on the day" `Font.dt.bodySmall` `Color.inkMuted` italic |
| mystery, unrevealed, **author's own** | `Color.checkMine` + 3pt `Color.dt` rule (the `mine` state wins; per `mystery.ts` the author is never redacted to themself) | as `mine` | The "?" frame **does** draw — it tells the author their check is masked to everyone else. Byline: your real avatar (`highlight`) and "you" `Color.ink` 600, followed by a `micro` kaomoji preview of your mask + "to everyone else" `Font.dt.meta` `Color.inkMuted`. Response row still reads "guests revealed on the day" — `isMysteryGuestsHidden` hides the down list from the author too — with "N down" replaced by "N ?" (`Font.dt.meta`, the count is hidden from the author as well, matching the web). No toggle (own check). |
| highlighted (from push) | current tint + flash | | `Color.dtLight → Color.dtSubtle → none` over 3s `Spring.settle` |
| pressed `[graft: tactile]` | current tint + `Color.dtFaint` overlay | | scale 0.99 (anchor centre); applied 40ms after touch-down so scroll starts don't false-trigger; release with `Spring.ink` |

**"?" frame — `MysteryFrame`** (mystery): a 1pt-thick frame drawn from repeated "?" glyphs in `Font.dt.badge` `Color.newInk`, inset 8 from the entry edges, 16pt glyph pitch along all four sides, corner glyphs "¿". Implemented as a `Canvas` that resolves one `Text("?")` and stamps it at points sampled along the inset rectangle path — no rotation, the glyphs stay upright (it's a typeset border). Each glyph alternates opacity 0.55 ↔ 1.0 in a wave (period 2.4s, phase = index × 0.12s). Reduce Motion: static at 0.85.

**Interaction**

- Tap anywhere except the toggle → detail (zoom, §5.4). Press state per the table.
- `[graft: native26]` **Long-press (0.35s)** raises the entry (scale 1.01, `Elevation.lifted` on the preview) and opens a native `.contextMenu(menuItems:preview:)` with the entry itself as `preview`. Items: Hide, Report (non-owners), Share, Copy text; owners get Edit, Share, Copy text, Delete (destructive). The system supplies the blurred backdrop and glass menu; this is a second, more discoverable path to the same actions as the 44pt "⋯".
- The whole entry is one accessibility element (§8).

**Gesture precedence (the likeliest place for the feed to feel broken).** Three recognisers share the row inside a `ScrollView`: the press-state `DragGesture(minimumDistance: 0)`, the `NavigationLink`/tap, and the system `.contextMenu(preview:)` long-press. The order of authority is fixed:

1. **Scroll wins over press.** The press gesture is attached with `.simultaneousGesture` and its 40ms delay is a `Task` started in `onChanged`; any `translation` > 6pt, or the `ScrollView` beginning to move (observed via `onScrollPhaseChange` → `.interacting`), cancels the task and clears the pressed state. A press that never reaches 40ms shows nothing. No scale, no tint on a scroll start.
2. **System long-press wins at 0.35s.** `.contextMenu` uses UIKit's own long-press recogniser with `minimumPressDuration` ≈ 0.35–0.5s; when it fires, the row's press state is cleared *before* the preview lifts (the pressed tint is removed in `onDisappear` of the pressed overlay, and the preview is rendered from an un-pressed copy of the entry so the lifted card is clean). Do not add a competing `LongPressGesture`.
3. **Tap fires on release ≤ 0.35s** with `translation` ≤ 6pt: the `Button`/`NavigationLink` action runs and the press state releases with `Spring.ink` as the zoom starts. The tap is the `NavigationLink` itself; the `DragGesture` never calls the navigation.
4. **The DOWN toggle is excluded**: it sits in a sibling `Button` with `.contentShape` and a `.highPriorityGesture` on its own touch-tracking drag, so a press that starts on the pill never tints the row.

Acceptance test on device: flick-scroll through 30 entries — no row may flash; press-hold a row for 1s — the tint appears at ~40ms, disappears at the moment the preview lifts, and the preview shows an un-tinted entry; tap — the zoom starts within one frame of release.

**Seen-tracking for NEW** `[graft: native26]`: an entry with `isNew` attaches `.onScrollVisibilityChange(threshold: 0.6)`; when it becomes ≥ 60% visible, start a 1.5s task; if still visible at 1.5s, record its id in `seenIds` (persisted with `lastSeenFeedAt`). Flags are **not** removed while the user is on the Feed. On the next feed load, entries whose ids are in `seenIds` render `new` for one frame then animate `Color.checkNew → Color.card` (and the flag slides out to the right, 200ms) with `Spring.settle` over 0.5s, staggered 30ms per entry — the entry visibly settles into the page instead of the flag vanishing on cold start.

### 4.2 Expiry rule — `ExpiryRule`

- Full-bleed track 2pt `Color.ruleLight`. Fill `Color.dt` anchored left, width = `(1 − elapsedFraction) × width`.
- 2pt normally; **3pt when `elapsedFraction > 0.75`** (it thickens as it gets urgent), and the fill crossfades `Color.dt → Color.danger` across that last 25% (`Spring.settle`).
- Shimmer: a 60pt gradient `clear → white@0.35 → clear`, `.blendMode(.plusLighter)`, sweeps the fill every **4.0s** `easeInOut`. Only on the **top entry** of TIMED; others are static. Reduce Motion: none.
- Ticks: the 30-second tick is **`FeedStore.ExpiryClock`** (`ARCHITECTURE.md` §4.8 — the store sets `now` and rebuilds; the rule reads `ExpiryState` from its `FeedCheck`), not a per-view `TimelineView`. Only an entry under 5 min runs a view-local `TimelineView(.periodic(from: .now, by: 1))` for the seconds. Width animates with `Spring.settle`. "Xm left" → counts seconds under 5 min with `.numericText(countsDown: true)`.
- Open-ended: no rule. Expired: track only, `Color.inkFaint`.
- Hits zero on screen: §5.7.
- `accessibilityHidden(true)`; the "Xh left" label carries the value.
- **Non-text contrast, stated honestly:** the `Color.dt` fill on the `ruleLight` track is **1.60:1** and the `danger` fill 1.58 — below the 3:1 non-text floor. The rule is exempt because it is `accessibilityHidden` and the "Xh left" label is the value; it is a progress ornament, not the only carrier. Under **Increase Contrast** (§8) the fill is remapped with every other `Color.dt` fill to `dtInkOnSurface` `#A000A2` → **3.97:1** on `ruleLight` ✓, and the danger fill to `dangerInk` `#C63838` (3.0 on ruleLight, at the floor; the label is already `dangerInk`). Do **not** remap the track to `ruleMid` in that mode: `#A000A2` on `ruleMid` is 3.34 and pure magenta on it 1.35 — a darker track makes the fill *less* visible.

### 4.3 DOWN toggle — `DownToggle`

Pill 36 tall, min width 88, padding 14 horizontal, `Font.dt.button`, hit target 44 × min 100 via `.contentShape`.

| State | Fill | Border | Text | Notes |
|---|---|---|---|---|
| idle | `Color.downIdle` | 1pt `Color.downIdleRule` | "DOWN ?" `Color.dtInk` | |
| pressed (finger down) | `Color.dtSubtle` | 1pt `Color.dt` | `Color.dtInk` | scaleY 0.94, scaleX 1.02 (a slight squash), 60ms ease-out |
| **active** | `Color.dt` | none | "DOWN ✓" `Color.onDt` | |
| active-pressed | `Color.dt` @ 0.85 | none | | same squash |
| waitlisted | `Color.waitlistBg` | 1pt dashed `Color.warnInk` (dash 3, gap 3) | "WAITLISTED" `Color.warnInk` (`#8F5210`, 5.66:1) | tap → opens the squad (read-only) |
| pending (optimistic) | as target state | | text @ 0.7 | no spinner; rollback on error with `.error` + toast |
| disabled (expired) | clear | 1pt `Color.inkFaint` | "CLOSED" **`Color.inkMuted`** (the word is the state; only the *pill border* is faint) | not tappable |
| "JOIN SQUAD →" | clear | 1pt `Color.squad` | `Color.squadInk` (`#7C3FD0`, 5.90:1) | **events only** — see the CTA table below |
| "WAITLIST →" | clear | 1pt `Color.inkFaint` | `Color.inkMuted` | **events only** — squad full |

**Which CTA, when — the toggle is a state machine, not a menu.** The DB triggers (INVENTORY §2) decide most of this: on a *check*, the squad forms on the first non-author down and every later down auto-joins (or waitlists, when capped). So on checks there is never a "down but no squad" state for a non-author, and the old web "Squad →" CTA is retired. The toggle shows exactly one of:

| Surface | Condition | Toggle shows | Tap does |
|---|---|---|---|
| check | not responded, active | DOWN ? | stamp → server → `down` or `waitlist` |
| check | responded `down` (you are in the squad — always true for non-authors; for the author, true once anyone else is down) | DOWN ✓ | un-down (confirm if it leaves a squad) |
| check | responded `down`, **author, nobody else yet** | DOWN ✓ is not shown (own check has no toggle); response row reads "no responses yet" | — |
| check | responded `waitlist` | WAITLISTED | opens the squad read-only |
| check | expired | CLOSED | — |
| event | not down | DOWN ? | stamp → `auto_squad_on_event_down` |
| event | down, member of a linked squad | DOWN ✓ | un-down (confirm; `auto_leave_squad_on_event_undown`) |
| event | down, **not** in a squad, a linked squad exists with room | DOWN ✓ — and a second, secondary pill **JOIN SQUAD →** (`squadInk`) sits *under* the response row, right-aligned | opens the lobby with that squad focused (§7.11); the request itself is sent from the lobby ("REQUEST TO JOIN") |
| event | down, not in a squad, linked squad full | DOWN ✓ + "WAITLIST →" secondary pill | lobby, squad focused |
| event | down, not in a squad, request pending | DOWN ✓ + "REQUESTED" text `Font.dt.button` `Color.inkMuted` (not a pill) | lobby |

Squad entry from the feed is therefore always either the SQUAD FORMED strip (§5.6, formation), the **"you're in →" strip** (§5.6, auto-joined an existing squad), or the secondary pill on events. The primary pill never says SQUAD.

**Promotion — WAITLISTED → DOWN ✓ (the reverse of the waitlist landing).** When someone leaves and `promote_waitlisted_check_response` flips your response to `down`, the entry on screen learns it from the `checks:all` reload or the `squad_invite`/"A spot opened up" notification, whichever lands first, and plays the landing backwards without a finger: the dashed `Color.warnInk` border un-draws (`trim(from: 0, to: t)` 1 → 0, 200ms) while the `Color.dt` fill floods from the *pill's centre* (no touch point exists) over 160ms `linear`; the label swaps to "DOWN ✓" at 80ms with the ✓'s `.symbolEffect(.bounce.up.byLayer)`; the band crossfades `waitlistBg → checkDown` (250ms); the 3pt dashed left rule closes its gaps (dash 4 → entry height, 200ms `easeOut`); "you're #2 on the waitlist" collapses (`Spring.settle`); `.success`. Slip: "a spot opened up — you're in" with an "OPEN →" action (6s). The OPEN SQUAD → link (§4.1) was already there and stays. If the chat is open at the time, §4.10 "Promoted while the chat is open" plays instead and the feed catches up silently. Reduce Motion: one 200ms crossfade + `.success`.

**The stamp — idle → active** `[base: editorial, grafts: tactile + native26]`. Total ≈ 460ms. Everything is state-driven and interruptible; hammering the toggle retargets the springs; network calls are debounced 300ms.

| t | What |
|---|---|
| 0 | Touch down. Squash (0.94 / 1.02) in 60ms ease-out. `.impact(flexibility: .soft, intensity: 0.5)`. Record the touch location from a `DragGesture(minimumDistance: 0)` layered under the button (`@GestureState var touch: CGPoint?`). |
| release (R) | **Fill sweeps radially from the finger.** The `Color.dt` fill is masked by a `Circle()` centred on the recorded touch point, radius animating 0 → pill diagonal over 160ms `linear`. Text swaps to "DOWN ✓" at R+80ms; the ✓ enters with `.symbolEffect(.bounce.up.byLayer, value: isDown)` (it is the one SF Symbol on the entry, a checkmark, 12pt). |
| R+0 → R+220 | Scale overshoot 0.94 → **1.06 → 1.0** with `Spring.stamp`. |
| R+90 (the apex) | `.impact(flexibility: .rigid, intensity: 0.9)`. This is the click. |
| R+150 | **Entry band dyes outward from the pill.** `[graft: native26]` The `Color.checkDown` band is masked by a `Circle()` centred on the pill's centre (in the entry's coordinate space) whose radius animates 0 → entry diagonal with `.snappy(duration: 0.45)`. The stamp visibly bleeds into the paper. Starts 60ms after the apex — cause, then effect. |
| R+400 | The 3pt `Color.dt` left rule draws downward (height 0 → entry height) over 220ms `easeOut`. Second beat. |
| R+150 | Response row: your `small` avatar slides in from the pill's x (offset −40 → 0, `Spring.settle`); "2 others" → "3 others" via `.numericText`. |
| server ack | `.success` when the server confirms `down`. If it returns `waitlist` → the waitlist landing below. |

**Un-down (active → idle):** fill mask collapses toward the pill centre over 140ms `linear`; text swaps back at 70ms; no overshoot (`Spring.settle`); `.impact(weight: .light)`; the band's mask collapses toward the pill over 200ms and the rule retracts upward over 160ms. Un-down must feel cheaper than down. If un-downing leaves a squad, the confirm dialog comes first.

**Waitlist landing** `[graft: tactile]`: the sweep completes as above; at server ack the fill *drains* — the magenta mask collapses to zero over 200ms while the dashed `Color.warnInk` border draws in via `trim(from: 0, to: t)` over 350ms; the band swaps `checkDown → waitlistBg` (crossfade 250ms); `.warning` haptic (the double thud); the label "WAITLISTED" **drops in glyph by glyph via `WobbleRenderer`** (§5.9: each glyph from y −6 + opacity, 20ms stagger, ≈ 200ms for ten glyphs, `Font.dt.button`) — one renderer for every "typed at you" label, so this and §5.9 agree; then the 3pt dashed left rule draws. Slip toast: "check is full — you're #2 on the waitlist". You did the thing; it landed differently.

### 4.4 Avatars — `AvatarLetter`, `AvatarStack`

| Size | Diameter | Letter (Inter 600) | Ring |
|---|---|---|---|
| `micro` | 20 | 10 | 1.5 |
| `inline` | 24 | 12 | 2 |
| `small` | 28 | 13 | 2 |
| `medium` | 40 | 18 | 2 |
| `display` | 72 | 32 | 3 |

- Others: fill `Color.ruleLight`, letter `Color.ink` (`inkDim` fails at 2.01:1). Optical centring: baseline offset −1 at ≤ 28.
- You (`highlight`): fill `Color.dt`, letter `Color.onDt`.
- Mystery: fill `Color.surface`, 1pt dashed `Color.inkDim` ring, kaomoji `Font.dt.kaomoji` `Color.ink`. At `micro`/`inline` the kaomoji is replaced by "?" — 8pt kaomoji is illegible.
- Pool member: 2pt `Color.pool` ring. Waitlisted: 1.5pt dashed `Color.ruleMid` ring.
- **Stack**: overlap −6 at ≤ 28, −8 at 40; each avatar wears a 2pt ring in the colour of the surface it sits on (`card` / `surface` / `checkDown` / `deep`, passed explicitly). Order: you first, friends, then others; first on top. Max 3 + "+N" (fill `Color.ink`, text `Color.paper` `Font.dt.badge`, `.numericText`).
- Insertion: new avatar scales 0.4 → 1.0 with `Spring.stamp`; siblings shift with `Spring.settle`.
- `[graft: tactile]` **Fan-out on tap**: tapping a stack springs the avatars apart to +4 spacing (from −6/−8) with `Spring.ink`, holds ~900ms, then re-collapses with `Spring.settle`. `.selection` haptic on the fan. Pure delight; no function. Where the stack is also a button (event response row → lobby), the fan plays *and* the navigation happens; the fan is cancelled if the view disappears. Reduce Motion: no fan.

### 4.5 Event entry hero — `EventEntry`

Same chassis as §4.1 (byline = "posted by Kat" / "via @venue on IG" with the source chip). Between byline and metadata:

- **Hero**: 16:9 at (width − 40) ≈ 353×199 on a 393pt device, radius 12, `.clipped()`. Layers: image at scale 1.0; above it a vertical wash whose stops are defined **by the title box, not by percentages**: `Color.paper@0` at 40% of the hero height → `Color.paper@0.85` at (title box top − 16) → `Color.paper@0.92` at the bottom edge, where the title box is the 2-line `Font.dt.title` text frame plus its 16pt insets, measured with `GeometryReader`/`onGeometryChange` so a 1-line title gets a shorter wash. **Contrast, computed at the worst case (a pure-black photo):** ink on paper@0.85-over-black is **10.07:1**, on paper@0.92-over-black **11.92:1**; even the wash's 0.6 point (above the title box) gives 5.0. The whole title box therefore sits in the ≥ 0.85 zone and no luminance sampling or "print the title under the hero" fallback is needed — the gradient geometry guarantees AA on any photo. Title `Font.dt.title` `Color.ink` inside the hero at (16, bottom − 16), max 2 lines. Source chip (IG / DICE / LETTERBOXD) top-right at (−12, 12): `Font.dt.badge` `Color.ink` on `Color.paper@0.85` radius 6 (ink on that over black is 10.07 ✓; the chip is opaque enough on any photo). Under Reduce Transparency the wash is opaque `Color.paper` from the title box top down (§8).
- No image (manual event): a 96pt band of `Color.surface` with the title in `Font.dt.display` (`paperStock = .surface`).
- Scroll: a restrained `.scrollTransition(.interactive, axis: .vertical)` on the hero only: `scaleEffect(1 + phase.value × −0.03)`. Reduce Motion: off.
- Below: date · time · venue `Font.dt.bodySmall` `Color.inkMuted`; vibe pills (§4.7) in a `FlowLayout` gap 4; note `Font.dt.body` `Color.ink` up to 3 lines. **Visibility chip**: after the date line, a `Font.dt.label` word — "FRIENDS" (`Color.inkMuted`) or "PUBLIC" (`Color.poolInk`, 4.88 on paper) — in a 1pt `Color.ruleLight` pill 20 tall, shown only to the **poster** (viewers never see a check's audience either; the poster needs to know who they published to). VoiceOver reads it as a trait on the entry.
- Response row: `AvatarStack` + "Alice + 3 others down" (poster excluded per `events-flow.md`; when nobody but the poster is down the row reads "nobody's down yet" `Color.inkMuted` for the poster and is empty for everyone else, per the same spec), the whole left side is a button → `EventLobby`; right: DOWN toggle. Under it "SAVE" / "✓ SAVED" text button `Font.dt.button` `Color.inkMuted` / `Color.dtInk`, `.impact(weight: .light)` / `.impact(flexibility: .soft, intensity: 0.4)`.

**Event entry states** — the check table of §4.1 applies where a row is not listed here; precedence `down` > `mine` > `new` > `saved` > `idle`, `past`/`imminent`/`highlighted` are additive.

| State | Hero / band | Left edge | Other |
|---|---|---|---|
| idle | wash as above, `Color.card` | — | DOWN ? |
| **mine** (you posted it) | `Color.checkMine` band under the hero (the hero itself is unchanged), wash bottom stop → `Color.checkMine@0.92` | 3pt `Color.dt` rule | Byline "you" `Color.ink` 600 + the source chip. **The poster keeps the DOWN toggle** — INVENTORY §1 excludes the poster from the *responders row*, not from responding; posting an event is not the same as going. The visibility chip shows. |
| **down** | wash bottom stop → `Color.checkDown@0.92`, band → `Color.checkDown` (radial dye from the pill, §4.3) | 3pt `Color.dt` rule | DOWN ✓; JOIN SQUAD → / WAITLIST → / REQUESTED secondary pill per §4.3 |
| **new** | `Color.checkNew` band, hairline → `Color.checkNewRule` | — | NEW flag (§4.6) at y = 12 **on the entry's right edge, above the hero** — the hero starts at y = 24 + byline, so the flag sits in the byline row and never collides with the source chip, which is inside the hero at its top-right. |
| **saved, not down** | as idle/new/mine | — | "✓ SAVED" `.dtInk` under the toggle; the entry is also listed in the calendar EXPORT set (§7.16). Nothing else changes: saving is a private bookmark, not a signal. |
| **imminent** (`event_reminder` window: event within 24h; within 2h it tightens) | as current state | — | The date line's date segment is replaced by "tonight · 8pm" / "in 2h · 8pm" `Font.dt.bodySmall` **`Color.dangerInk`** (5.10 paper, 4.82 checkDown — the same urgency voice as the expiry label), `.numericText(countsDown: true)` while < 2h; a 2pt `Color.danger` rule under the hero's bottom edge (decorative, `accessibilityHidden`; the date text carries it). The `event_reminder` push (§7.9) lands on this entry with the highlight flash. |
| **past** (event date < today, viewer-local; `check_is_active` governs checks only, so events have no server expiry — the cron `archive-past-date-checks` does not touch `events`) | wash unchanged; the hero image gets `.saturation(0.4)` (decorative) | rule → `Color.ruleLight` if it was `Color.dt` | Text recolours exactly as an expired check (§4.1): title stays `Color.ink` on the hero (it is on the wash, not the band); date line → `Color.inkExpired` with the date segment replaced by "happened" `Color.inkMuted`; toggle → CLOSED (`Color.inkMuted` word, `Color.inkFaint` border); SAVE hidden; response row stays readable ("Alice + 3 others went" `Color.inkMuted`). **Migration**: past events leave the OPEN section on the next feed load (they are sorted out by the RECENT/UPCOMING comparator, never removed on screen) and are reachable only through the lobby of a linked squad and the calendar sheet — the web keeps them in the list; native does not, because a broadsheet does not reprint yesterday. Never opacity. |
| **highlighted** (from push: `event_down`, `friend_event`, `event_date_updated`, `event_comment`, `event_reminder`) | current tint + flash `Color.dtLight → Color.dtSubtle → none` over 3s, applied to the **band under the hero and the hero's wash bottom stop together** (the wash tints too, so a flash is visible on an entry that is mostly photo) | | scroll-to per §7.4 |
| pressed | per §4.1 | | the hero does not scale on press (only on scroll) |

### 4.6 NEW flag

A printer's flag bleeding off the right edge: height 18, width = 12 + text + 6, fill `Color.newLime`, "NEW" `Font.dt.badge` `Color.newInk` (`#C400A6`, 4.6:1), left corners radius 4, extends 6pt past the screen edge (clipped by the screen, not the entry — the entry does not clip). y = 12 from the entry top, behind the "⋯" so nothing overlaps. First appearance in the session: slides in from +24 with `Spring.page`, 120ms after the list settles. Retirement: §4.1 seen-tracking. `accessibilityLabel("new")`, exposed as a trait on the entry rather than its own element.

### 4.7 Pills, dots, badges

- **Vibe pill**: height 20, padding 8h, **fill `Color.paper`, 1pt `Color.ruleLight` border**, pill, `Font.dt.label` `Color.dtInk` (6.81:1 on paper via the surface variant when the pill sits on a sheet — `dtInk` on the old `ruleLight` fill was 2.88:1). On the feed (paper on paper) the border is what draws the pill. Selected (create form): fill `Color.dt`, text `Color.onDt`, `Spring.ink`, `.selection`.
- **Mention chip** (Create, composer): fill `Color.paper`, 1pt `Color.dtSubtle`-tinted border, text `.dtInk` — not `dtSubtle` fill, which put magenta text on a pink-over-surface at 3.4:1.
- **Notification unread**: 8pt `Color.dt` dot at (+3, −3) from the bell's top-right with a 1.5pt `Color.paper` ring. Count ≥ 1 → pill min 16×16, `Font.dt.badge` `Color.onDt` on `Color.dt`, "99+" cap, `.numericText`.
- **Squad unread**: 8pt `Color.unreadSquad` with 2pt `Color.paper` ring, leading on squad rows and top-right of the SQUADS Folio label (offset +4, −2). Appears scale 0 → 1 `Spring.stamp`; leaves with a 150ms fade.
- **Waitlisted badge** (squad rows): `Font.dt.badge` "WAITLIST" `Color.warnInk` (`#8F5210`, 5.66:1 on waitlistBg) in a 1pt dashed `Color.warnInk` pill on `Color.waitlistBg`.
- **"N new ↑" pill** (§5.1): 32 tall, fill `Color.ink`, `Font.dt.label` `Color.paper`, `Elevation.lifted`, centred under the masthead.

### 4.8 Toast — `Slip`

A correction slip. Bottom-anchored, bottom = Folio top + 12, width = screen − 40, min height 44, padding 12/16, fill `Color.ink`, radius 12, `Elevation.lifted`, text `Font.dt.body` `Color.paper`, optional trailing action `Font.dt.button` `Color.dt` (5.2:1 on ink). Success: 3pt `Color.success` left rule inside; error: `Color.danger` rule.

- Enter: `offset(y: 16) + opacity 0 → 0 / 1`, `Spring.page`. Auto-dismiss 4s (6s with action). Swipe down ≥ 24pt dismisses; drag follows the finger with 0.6 resistance upward; released with velocity via `Spring.snap`.
- One at a time; a second replaces with a 120ms crossfade.
- Undo toasts get a 2pt `Color.dt` countdown rule along the bottom shrinking over 6s.
- Posts `AccessibilityNotification.Announcement`.

### 4.9 Bottom sheets — `.dtSheet(detents:)`

Native `.sheet` for detail-adjacent surfaces: edit check/event, lobby, report, check actions, notifications, squad settings, squad members, poll creator, sync calendar, user profile, delete-account confirm. **Not** sheets: check detail (zoom push, §5.4), squad chat (push, §4.10), Create (root overlay, §7.6), deleted-check (push).

The shell modifier applies:

- `.presentationBackground(Color.surface)` + grain copy; `.presentationCornerRadius(24)`; `.presentationDragIndicator(.hidden)`.
- **Custom handle**: 40×4, `Color.inkFaint`, radius 2, centred 8 from the top, inside a 24pt `touch-none` region. `[graft: tactile]` While a `DragGesture(minimumDistance: 0)` on that region is active the handle widens to **44×4** and darkens to `Color.inkDim` (`Spring.snap`), returning on release. The gesture is `.simultaneousGesture` so the system sheet drag still owns dismissal.
- `.presentationBackgroundInteraction(.disabled)`, `.presentationContentInteraction(.scrolls)` — dragging scrolled content scrolls; dragging at scroll-top dismisses (the web's "only when scrolled to top" rule, for free).
- Detents: default `[.fraction(0.72), .large]`. Quick sheets `[.height(N)]` at intrinsic height. Poll creator, Edit, Sync `[.large]`. Selection bound to `@State` and `.sensoryFeedback(.impact(weight: .light, intensity: 0.5), trigger: detent)`.
- Dismiss threshold: native. Backdrop: the system's dim, accepted; the web's 8px blur is dropped on purpose — paper under paper is dimmed, not blurred.
- Guard: `.interactiveDismissDisabled(isDirty)` + confirm "discard edits?".
- Motion: native present/dismiss; sheet content fades in per block with a 40ms stagger, `Spring.page`, so it doesn't arrive as one slab.
- Header pattern: title `Font.dt.title` left on the 24 gutter, optional trailing text action `Font.dt.label` `.dtInk` — which resolves to `Color.dtInkOnSurface` here because `.dtSheet` sets `paperStock = .surface` (5.05:1; plain `#C400C6` on surface was 3.66). No "×" circle; the handle and swipe are the close. Trailing actions have a 44pt hit target regardless of the 10pt label.
- Every sheet has a **loading and error state** per §7.15: the block stagger only begins once the sheet's data is present; before that the content area shows the shimmer-rule skeleton, and a failed load shows the inline "couldn't load — RETRY" colophon.

### 4.10 Squad chat

**A transcript, not bubbles.** Everything left-aligned on the 16pt gutter. The chat is a `NavigationStack` push. The Folio is **not** a `TabView`, so `.toolbar(.hidden, for: .tabBar)` would be a no-op here — the Folio is hidden by the root state (`route.hidesFolio`, §4.11), which slides it down the moment the push begins. The composer is a `.safeAreaInset(edge: .bottom)` and the header stack (join-request banner, active-poll chip, date-confirm bar) uses `.safeAreaInset(edge: .top)` so the transcript's scroll insets stay correct. Both insets get `.scrollEdgeEffectStyle(.hard, for: .top/.bottom)` — iOS 26 would otherwise paint its soft scroll-edge blur under them, and paper has a hard edge.

**Navigation bar — hidden; the header is ours (DECISIONS #15).** The system bar is hidden (`.toolbar(.hidden, for: .navigationBar)`) and `ChatHeader` is a normal view pinned with `.safeAreaInset(edge: .top)` — the structure is `ARCHITECTURE.md` §7.5, including the mandatory `InteractivePopEnabler` shim that restores `UINavigationController.interactivePopGestureRecognizer` (hiding the bar disables it; the shim is required on *every* path, which is why the earlier "keep the bar and restyle it" plan, its `.sharedBackgroundVisibility(.hidden)` item-by-item de-glassing and the `.toolbarRole(.editor)` experiment are withdrawn: they bought nothing the shim did not already have to buy, and left two iOS 26 Liquid Glass risks on the prototype checklist). Never a custom swipe-to-close gesture. What the header looks like is unchanged:

- `ChatHeader`: `Color.surface` (`paperStock = .surface`), content height **48** + top safe area, `Elevation.laid` approximated by its 1pt `Color.ruleMid` bottom rule alone. `.scrollEdgeEffectStyle(.hard, for: .top)` on the transcript so iOS 26 paints no soft edge under it.
- Leading: chevron `chevron.left` 17pt semibold `Color.ink` in a 44 target, no title text; tap → `router.squadPath.removeLast()` with `.selection`.
- Centre: a `VStack(spacing: 2)` — name `Font.dt.title` at **17** `Color.ink` truncated; under it `AvatarStack` `micro` + countdown `Font.dt.meta` tabular `.numericText(countsDown: true)` **`Color.inkMuted`** (`Color.dangerInk` < 1h, set in `Font.dt.numeral` at 20; "ENDED"/"PAST" **`Color.inkMuted`** — a state word is never faint).
- Trailing: "⋯" 24 glyph in a 44 target → `SquadSettingsSheet`.
- The design's earlier "56pt header" and the "system bar height" variant are both retired; 48 is the number.

- **Message group** (consecutive messages, one sender, within 2 min): header row = avatar `inline` + sender `Font.dt.label` (`.dtInk` others — on the paper transcript that is `#C400C6`; `Color.ink` you; kaomoji + scrambled name pre-reveal) + timestamp `Font.dt.meta` **`Color.inkMuted`** (the timestamp is the only time carrier; faint is reserved for the "·" between them); then each message `Font.dt.body` `Color.ink`, 4pt apart; 16pt between groups.
- **Long-press on a message or comment** (App Store 1.2 — every piece of UGC is reportable): the same `.contextMenu(menuItems:preview:)` pattern as §4.1, preview = the message group row lifted with `Elevation.lifted` on `Color.paper`. Items, in order: **Copy** (text messages; `Copy image` saves to Photos for images, with the add-only Photos permission), **Report…** (others' messages → §7.14 `ReportSheet` with `target: .squadMessage(id)` / `.checkComment(id)` / `.eventComment(id)`), **Block {name}** (destructive, others' messages; confirms via `.confirmationDialog`, then the block RPC removes the friendship and the chat reloads without their messages), and for your own messages **Delete** (destructive) — *only if* a `delete_message` path exists server-side; if not, the item is omitted rather than faked, and the doc's data-model ledger (§11) records it as a backend follow-up. System messages, polls and date-confirm cards have no menu. Haptic: system. VoiceOver: the same items as custom actions on the message element.
- **Your groups**: identical layout plus a 2pt `Color.dt` rule on the left edge (x = 8) and a full-bleed `Color.dtFaint` band. You're the ink in your own transcript.
- **Mentions** `Color.dtInk` 500. Links: 1pt underline `Color.ruleMid`.
- **Images**: max 240 wide, aspect from `image_width/height` (no layout jump), radius 12, 1pt `Color.rule`. Tap → viewer (§7.8). `accessibilityLabel("image from {sender}")` (+ ", sending" / ", failed to send"); the viewer's image gets `accessibilityLabel("image from {sender}, {date}")` and `.accessibilityAddTraits(.isImage)`. Sending: `Color.surface` placeholder with a 2pt magenta upload rule along its bottom. **Upload failure**: the placeholder stays at the thumbnail's aspect, the rule turns `Color.danger` and stops, and a `Font.dt.meta` line "didn't send · RETRY · DISCARD" (`Color.dangerInk` / `.dtInk` / `Color.inkMuted`) appears under it; `.error` haptic once; the message is kept locally until discarded. Loading (history): a `Color.surface` block at the stored aspect with the shimmer rule — never a spinner.
- **System messages**: centred, `Font.dt.system` **`Color.inkMuted`** (they are the stage directions — "X just entered the chat", "the guests have been revealed", "not Devon actually following through" — and must be readable at 12pt; inkDim was 3.45:1), flanked by "✶" `.dtInk` with 8pt gaps, 20pt vertical padding. Join lines get the name in `.dtInk` 500 non-italic. Arrival: opacity 0 → 1 + offset(y: 6 → 0) `Spring.page`; the joiner's avatar inserts into the header stack (§4.4).
- **Date-confirm card**: `Color.deep` radius 12 padding 16, content under `paperStock = .deep`: "Sara proposed" `Font.dt.meta` `Color.inkMuted` (resolves `#55554A`, 5.06) / "Fri Oct 3 · 8pm" `Font.dt.headline` `Color.ink` / member rows: a leading glyph column + name. Glyph `✓` `Color.successInk` (`#1A6B2B`; as a glyph it needs 3:1 — 4.43 ✓) with the words "you're in" **`Color.ink`**; `✗` `Color.dangerInk` + "can't make it" `Color.inkMuted`; `·` `Color.inkFaint` + "waiting" `Color.inkMuted`. Locked: 1pt `Color.dt` frame + "LOCKED" `Font.dt.badge` stamp rotated −4° top-right, `Color.onDt` on a `Color.dt` chip (not green text on deep).
- **Poll card**: `Color.deep` radius 12 padding 16, `paperStock = .deep`. Question `Font.dt.headline`. Under it a meta line `Font.dt.meta` `Color.inkMuted`: "sara · 3 voted · multi" or "closed · 5 voted". Option rows 44 tall, 1pt `Color.rule` between; label `Font.dt.body`; vote bar `Color.dtLight` from the left, width = share, behind the label; count `Font.dt.meta` tabular right, `.numericText`; your vote → bar `Color.dtMid` + leading ✓ `Color.ink`. Bars animate width `Spring.settle` on every realtime vote. Tap: row squashes scaleY 0.96 (60ms) then the bar grows; `.selection`. **Multi-select** polls show "pick any" in the meta line and rows toggle independently; single-select moves the ✓. **Footer row** (`Font.dt.button`, 36 tall, hairline above): voter → "CLEAR MY VOTES" `Color.inkMuted` (only when you have votes; `clear-my-votes`); creator → "CLOSE POLL" `.dtInk` (→ `.confirmationDialog` "close the poll? votes stay visible"), and once closed "REOPEN" `Color.inkMuted` (`reopen-poll`). Closed: winner row `Color.dt` full bar + `Color.onDt` text, ties share the fill; every other bar `Color.dtLight`; voting disabled (rows lose their press squash); the meta line reads "closed". On **date polls** the closed card adds "PROPOSE THIS →" `Font.dt.button` `.dtInk` (`#A000A2` on deep, 4.67) on the winning row → `propose-from-poll` → the date-confirm card arrives as a new message and the poll card's CTA becomes "proposed ✓" `Color.ink`. Poll cards, the active-poll chip and the date-confirm card are **all hidden pre-reveal** on mystery squads (see the pre-reveal list below).
- **Grid poll**: cells 44×32 (60-min) / 44×18 (30-min), gap 2, radius 4; empty `Color.surface`; heat `Color.dt` @ `0.15 + 0.85 × (count / members)`; your painted cells add a 1pt `Color.ink` inset border; the cell under the finger scales 1.12. Paint with `DragGesture(minimumDistance: 0)` over a `Canvas`; `.selection` per cell flip throttled ≥ 40ms; `.impact(weight: .light)` on gesture end. Day heads `Font.dt.label` `Color.inkMuted` above each column, hour labels `Font.dt.meta` `Color.inkMuted` down the left. **Voting at Dynamic Type ≥ `.accessibility1`** (the grid cannot be painted at that scale — cells would be 3pt): the grid becomes a list grouped by day — a `Font.dt.label` day head with a trailing "WHOLE WINDOW" text toggle (`.dtInk`; marks every slot of that day in one tap, so a 30-min evening — ten rows — is not ten taps), then one row per slot, 44 tall: a 22pt check circle (§7.11 idiom), the slot "7:00–7:30pm" / "7–8pm" `Font.dt.body` `Color.ink`, and a trailing tabular count "3" `Font.dt.meta` `Color.inkMuted` with a 8×20 heat swatch (same heat colour as the cell). The list is the same `squad_poll_votes` data; nothing is lost but the drag.
  **Closed — ranked blocks.** The grid collapses (`Spring.settle`) into up to five **block rows**, 48 tall, hairlines between, one per contiguous run of the best-scoring slots (merge adjacent slots with the same voter set; rank by count, then by earliest start): rank "1" `Font.dt.meta` tabular `Color.inkMuted` in the gutter → an 8×24 radius-2 heat swatch (the cell's heat colour, decorative) → "thu 7–9pm" `Font.dt.body` `Color.ink` → "4 of 5" `Font.dt.meta` `Color.inkMuted` (`#55554A` on deep) → trailing **"PROPOSE THIS →"** `Font.dt.button` `.dtInk` (`#A000A2` on deep, 4.67) in its own 44-tall target on *every* block row, not just the winner — the group may prefer the second-best time. Tap → `.impact(weight: .medium)` → `squads/propose-from-poll {pollId, date: "YYYY-MM-DD" (the block's day, local ISO), time: "HH:mm" (the block's start)}` → the date-confirm card arrives as a new message (§4.10) and every PROPOSE THIS on the card becomes "proposed ✓" `Color.ink` (the one that was tapped keeps a leading `✓` `Color.successInk` glyph). Ties are listed in start order. If nobody voted: the card reads "closed · nobody answered" and offers "REOPEN" only. The meta line reads "closed · 5 answered". Pre-reveal (mystery) the card is hidden regardless.
- **Active-poll chip**: `safeAreaInset(.top)`, `Color.deep` pill 28 tall, "▲ poll: {question}" `Font.dt.meta` `Color.ink`; tap scrolls with `Spring.page` and flashes the poll `Color.dtSubtle` 600ms.
- **Date-confirm sticky bar**: above the composer, `Elevation.laid`, `Color.surface` (`paperStock = .surface`), padding 16: "are you still down?" `Font.dt.headline` `Color.ink` + date `Font.dt.meta` `Color.inkMuted` (`#55554A`, 5.47); row of "STILL DOWN" (`Color.dt`/`Color.onDt`, 40 tall pill) and "CAN'T MAKE IT" (1pt `Color.ink` outline, text `Color.ink`). After answering: collapses to a 32pt strip — "you're in" `Color.ink` with a `✓` `Color.successInk` glyph and a 3pt `Color.success` left rule (the toast rule pattern, so green never has to be text) / "can't make it" `Color.inkMuted` — for 2s, then slides away `Spring.page`. Locked-by-all: the strip flashes `Color.dtSubtle` once; header countdown retargets with `.numericText`. Waitlisted members never see it.
- **Proposing, locking and clearing a date — outside polls** (specs/date-confirm-flow.md; API `squads/set-date {squadId, date, time, locked}` / `{squadId, clear: true}`). *Any* member can propose, lock or clear; the doc's only propose path is no longer PROPOSE THIS on a poll:
  - **Propose** comes from three places, all landing in one quick sheet, `DateProposal` `[.height(340)]` (`paperStock = .surface`): the `SquadSettings` "PROPOSE A DATE" / "CHANGE" row (§7.8), the grace strip's "SET A DATE →" (above), and the `SquadSettings → EDIT EVENT` date field when its value changes (§7.16 — there the sheet is skipped and the field's own SAVE is the proposal). The sheet: title "when?" `Font.dt.title`; one natural-language baseline-rule field ("fri 8pm") with the `Color.successInk` / `Color.dangerInk` parse preview; a two-chip row "ASK EVERYONE" / "LOCK IT" (`Font.dt.label`, the §7.6 chip idiom, default ASK EVERYONE; LOCK IT sends `locked: true` and skips the vote — for the case where the group already agreed in chat); CTA "PROPOSE →" / "LOCK →" `Font.dt.buttonLarge`. On send: `.impact(weight: .medium)`; the sheet dismisses; the system line "{name} proposed {date} — are you still down?" arrives (proposer auto-confirmed, so the proposer sees the collapsed "you're in" strip, not the question); everyone else's sticky bar unfurls. **Re-proposing** while a date is proposed/locked shows a `.confirmationDialog` first — "propose a new date? everyone's answers reset" — because the server deletes all confirm rows.
  - **Lock (auto)**: when the last member answers and ≥ 1 said yes, `date_status → 'locked'`: the date-confirm card gains its LOCKED stamp (`Spring.stamp`), the sticky strip flashes, the header countdown **retargets to the locked date + 1 day + 24h** with `.numericText` (it usually rolls *up*, so `countsDown: false` for that one transition), `.success`, and the squad list row's countdown follows on the next refresh.
  - **All said "can't make it"**: not locked. The card's rows are all `✗`; under them a `Font.dt.system` `Color.inkMuted` line "nobody can make {date}." with, for the proposer only, "PROPOSE ANOTHER →" / "CLEAR IT" `.dtInk` / `Color.inkMuted` in `Font.dt.button` (44 targets). No haptic — nothing landed.
  - **Clear**: `SquadSettings` "CLEAR DATE" (`Color.dangerInk`, `.confirmationDialog` "clear the date? everyone's answers go too") or the EditEvent CLEAR DATE row (§7.16) → `{clear: true}` → system line "{name} cleared the date"; the date-confirm card's rows collapse to that line (it stays in the transcript as history, 0 rows, "cleared" `Color.inkMuted` in its meta position); the sticky bar, if showing, slides away `Spring.page`; the **header countdown retargets back** to the check's own clock (timer + 24h, or "no expiry" for open-ended — `recalc_squad_expiry_on_check_date_change` runs the same formula) with `.numericText`; `.impact(weight: .medium)`. The LOCKED stamp, if present, peels off (scale → 0.6 + opacity, 200ms).
  - Pre-reveal mystery squads: none of this is reachable (§4.10 hidden list) — the check's date is the reveal date.
- **Composer**: `Elevation.laid`, `Color.surface` (`paperStock = .surface`). Field `Color.paper` fill, 1pt `Color.rule`, radius 22, min 44, max 5 lines, `Font.dt.body`, placeholder "say something" `Color.inkFaint`. Leading image + poll glyphs 24 `Color.inkMuted` in 44 targets (hidden pre-reveal). Trailing send: 32 circle `Color.dt` in a 44 target, "↑" `Color.onDt`; disabled `Color.ruleLight`; appears with `Spring.ink` when text is non-empty. Send: `.impact(weight: .medium)`; optimistic message at opacity 0.6 until acked; list scrolls `.smooth(duration: 0.25)`. **Send failure**: the optimistic message stays at 0.6 with a `Color.danger` 2pt left rule replacing your magenta one and "didn't send · RETRY" `Font.dt.meta` under it; `.error`. Waitlisted: composer → 44pt strip "you're on the waitlist — manifesting a spot" `Font.dt.system` `Color.inkMuted` on `Color.waitlistBg`.
- **Chat lifecycle — every state the composer slot can be in.** The squad has four server states (INVENTORY §2: live → *grace* when the check timer ends (`grace_started_at`, cron posts "Timer's up — set a date to lock it in") → *archived* at `expires_at` (`archived_at`, still readable for 7d) → purged), plus two membership events (kicked, promoted). The composer slot is a single `ComposerSlot` view switching on `(squad.state, membership.role)` with `Spring.page` height animation between states; the transcript above it is **never** replaced or popped — "never shove the page while someone is reading" applies to chats most of all.

  | State | Composer slot (bottom `safeAreaInset`) | Header countdown (principal item) | Elsewhere |
  |---|---|---|---|
  | live, member | the composer | "Xh left" / "Xd left" `Color.inkMuted` (`dangerInk` < 1h) or "no expiry" for open-ended | — |
  | live, waitlist | the waitlist strip above | same | date-confirm bar never shown |
  | **grace** (check timer ended, `expires_at` still ahead — normally the last 24h) | the composer, plus a 32pt `Color.waitlistBg` strip above it (`Font.dt.system` `Color.inkMuted`): "timer's up · chat ends in 23h — set a date to keep it" with a trailing "SET A DATE →" `.dtInk` (opens the DateProposal sheet, §7.8; hidden pre-reveal since mystery checks already have a date). The cron's own system line is in the transcript too; the strip is the actionable copy of it. | "ends in 23h" `Color.dangerInk` when < 24h, `.numericText(countsDown: true)` | the feed entry is CLOSED with OPEN SQUAD → still live (§4.1) |
  | **< 1h to expiry** (cron `warned_at` line "This chat expires in 1 hour" arrives) | as grace, strip copy "chat ends in 58m — EXTEND +7 DAYS →" (`squads/extend`, any member; on success the strip folds and the countdown rolls up with `.numericText`, `.success`) | numeral at 20 `Color.dangerInk` counting minutes | `.impact(flexibility: .soft)` once when the header crosses 1h on screen (§6.1) |
  | **ended** (`archived_at` set, within the 7d purge window; opened from the squad list's ENDED/PAST row or from a stale push) | a 52pt `Color.surface` strip, `Elevation.laid`: "this chat ended." `Font.dt.system` `Color.inkMuted` + trailing **"REVIVE IT →"** `.dtInk` → `reactivate_squad(p_squad_id)` (recomputes expiry from the check: a future event date or an open-ended check gives a live squad again; a check whose timer is simply over gets `NOW() + 24h`, which is a real second wind). On success: the strip drains into the live composer (`Spring.page`), the header countdown retargets, `.success`, system line "{name} revived the chat" (backend follow-up, §10 — until it exists the transcript just resumes). Failure ("Squad not found or not archived" — someone else already revived it, or it was purged): silent reload, or the "gone" colophon below. The transcript is read-only: long-press menus keep Copy and Report, lose Delete; polls and date cards render closed/locked; the header's "⋯" opens `SquadSettings` in read-only form (members visible, stepper and EXTEND disabled with "chat ended" `Color.inkMuted`, LEAVE still allowed). | "ENDED" (`Color.inkMuted`) — or "PAST" when the locked date passed before expiry; the word follows the `GroupsView.tsx` countdown port exactly | the feed entry's OPEN SQUAD → is gone (§4.1) |
  | **purged** (fetch 404 / RLS returns nothing) | none — the whole page is the error colophon (§7.15) "that squad is gone." with "BACK" `.dtInk` (pops) | — | the list row is removed on return |
  | **you were kicked / the squad was archived while the chat was open** — there is no realtime on `squads`/`squad_members` (INVENTORY §2), so this is learned from the `notifications:{userId}` channel, from a send that fails with RLS 42501, or from the foreground reload | the slot swaps *in place* to "you're no longer in this squad." / "this chat ended." (`Font.dt.system` `Color.inkMuted`, 52pt strip, no REVIVE for a kick); a slip "you were removed from {name}" / "that squad just ended" (`Color.danger` rule, 4s); the push is **not** popped — the reader finishes reading, and Back returns to a list where the row has moved to FADING ✶ / ENDED or is gone (`Spring.settle`). A failed send that revealed the kick keeps the text in the field so it can be copied. | "ENDED" | — |
  | **promoted while the chat is open** (waitlist → member: the `squad_invite` "A spot opened up — you're in!" notification, or the system line "{you} was promoted from the waitlist" arriving on `squad:{id}`) | the waitlist strip's `Color.waitlistBg` crossfades to `Color.surface` (250ms) while its text drains left; the live composer rises under it (`Spring.page`) with the send circle popping `Spring.stamp`; `.success`; then — 200ms later, only if `date_status == 'proposed'` and you have no answer yet — the date-confirm sticky bar unfurls above it (specs/date-confirm-flow.md "Promoted from waitlist": you receive a confirm row on promotion). The header avatar stack drops your dashed ring. The feed entry catches up per §4.3 "Promotion". VoiceOver: announcement "a spot opened up — you're in the squad". | unchanged | squad list row loses its WAITLIST badge |

  Leaving (LEAVE SQUAD) pops the chat after the confirm — that one *is* the user's own action, so popping is not shoving.
- **@mention autocomplete**: `Color.deep` list above the composer (`paperStock = .deep`), rows 40, avatar + name `Font.dt.body` **`Color.ink`** (the name is what you are choosing; the @username after it `Font.dt.meta` `Color.inkMuted`), `Spring.page`, `.selection` on pick.
- **Join-request banner**: `safeAreaInset(.top)`, `Color.deep` (`paperStock = .deep`), "Devon wants in" `Font.dt.bodySmall` `Color.ink` + ACCEPT `.dtInk` (`#A000A2`, 4.67) / DECLINE `Color.inkMuted` (`#55554A`, 5.06) in `Font.dt.button`, each in a 44 target. Several requests stack as one banner with "Devon + 2 more want in" and a "SEE →" that opens `SquadMembers` at its REQUESTS section.
- **Chat header**: the custom `ChatHeader` described at the top of this section (`ARCHITECTURE.md` §7.5).
- Incoming while scrolled up: 32 circle `Color.ink` "↓" `Color.paper`, `Elevation.lifted`, above the composer, 44 target; tap scrolls to bottom. No haptic for incoming messages.
- **History and pagination**: the transcript loads the latest page; scrolling to the top loads the next **100** older rows (`ARCHITECTURE.md` §7.6 owns the page size and the no-jump prepend) with a 24pt-tall shimmer rule (§7.15) at the top of the list while the page fetches, holding scroll position with `scrollPosition(id:anchor:)`. First open: the transcript area shows three skeleton groups (avatar circle + 2 rules at 60% / 35% width, `Color.surface`, shimmer) for at most one fetch; the composer is enabled immediately. A cold chat with no messages shows "say something. or don't." `Font.dt.system` `Color.inkMuted` centred.
- **Pre-reveal (mystery squads, `isMysteryGuestsHidden`) — the complete hidden list**: member letters → kaomoji and sender names → scrambled (§5.7 reverses them); the composer's image and poll glyphs; every poll card and the active-poll chip; the date-confirm card and the date-confirm sticky bar (the check already has a date — that *is* the reveal date — so proposing another makes no sense); `SquadMembers` actions (§7.8); the join-request banner still shows but with the requester as kaomoji. In their place, one system line at the top of the transcript: "✶ guests revealed on {date} ✶" `Font.dt.system` `Color.inkMuted`. The header avatar stack shows kaomoji `micro` → "?" per §4.4.
- **The date flips while the chat is open**: reveal is computed in viewer-local time from the check's `event_date`. The midnight tick is the stores' `NSCalendarDayChanged` / `NSSystemTimeZoneDidChange` observer (`ARCHITECTURE.md` §4.8: `FeedStore.dayChanged()` rebuilds and publishes `revealedNow`; `ChatStore` rebuilds on the same notification) — **not** a per-view `TimelineView(.explicit)`. When it fires, `isMysteryUnrevealed` recomputes and §5.7 plays in place: in chat the kaomoji flip and name unscramble run for every visible group, the hidden cards and composer glyphs fade in with `Spring.page` 200ms *after* the flip, and the "the guests have been revealed" system line arrives last. If the app was backgrounded across midnight, the reveal plays on the next foreground render (the per-check "seen redacted" flag guarantees once per device).

### 4.11 Tab bar — `Folio`

Custom, not the iOS 26 glass `TabView` (glass floating over cream reads as a template, and the labels want to be typeset). Height 52 + bottom safe area, fill `Color.paper`, 1pt top rule `Color.ruleMid`, no soft shadow.

Three text labels, equal thirds, `Font.dt.label` at **11pt**, uppercase, tracking +1.4: **FEED · SQUADS · YOU**. No icons, no emoji. Active `Color.ink`; inactive `Color.inkMuted`. A 2pt `Color.dt` underline, width = label + 8, 6pt below the baseline, slides between tabs with `Spring.page` (matched geometry on the underline). Squad unread dot per §4.7. Tap: `.selection`. Re-tap the active tab: scroll to top `Spring.page`; second re-tap on FEED triggers a refresh. Hidden (slides down its height + safe area, `Spring.page`) while chat, the check detail (§5.4), the Create overlay, or the image viewer is on screen — driven by `router.hidesFolio` (`ARCHITECTURE.md` §7: `!squadPath.isEmpty || !feedPath.isEmpty || isCreateOpen || cover != nil`), **not** by any `.toolbar(.hidden, for: .tabBar)` modifier (there is no `TabView` for that to act on). While hidden its `safeAreaInset` content collapses to zero height in the same transaction (§7.5 there) so the chat composer sits on the home indicator.

- **Height is intrinsic, not fixed.** 52 is the *minimum*: the bar is `max(52, labelHeight + 22)` so that at accessibility sizes, where the labels wrap to two lines, the bar grows and the underline stays 6pt under the last baseline. The scroll views' bottom inset (§3.1) reads the Folio's measured height through a preference key rather than a constant.
- **Placement and the iOS 26 scroll-edge effect.** The Folio is a `.safeAreaInset(edge: .bottom)` on the tab content (so scroll views inset correctly and `ScrollView` knows where the content ends), with `.scrollEdgeEffectStyle(.hard, for: .bottom)` on the scroll views so iOS 26 does not paint its soft glass edge under it; the 1pt `Color.ruleMid` rule is the edge. The same applies to the Masthead (§4.12) at the top. Neither is a plain `ZStack` overlay.
- **Accessibility**: `.accessibilityAddTraits(.isTabBar)` on the container; each tab is a `Button` with `.accessibilityAddTraits(.isSelected)` when active (and `.accessibilityRemoveTraits(.isSelected)` otherwise), label "Feed, tab 1 of 3" via `accessibilityLabel` + `accessibilityValue`; the unread dot becomes ", 2 unread" in the SQUADS value. Each third is at least 44 tall for its whole width.

### 4.12 Masthead

Height 56, `Color.paper`, no rule (the first section label provides the break). It is a `.safeAreaInset(edge: .top)` on the tab's scroll view with `.scrollEdgeEffectStyle(.hard, for: .top)` on the scroll view, so iOS 26's scroll-edge blur never appears under it and the content scrolls flat under flat paper.

- Left: the tab's wordmark in `Font.dt.wordmark` (26) `Color.ink` — "down to", "squads", "you". On Feed, a running head under it in `Font.dt.meta` `Color.inkMuted`: "tue sep 23 · 3 friends out tonight" (count of friends with `availability = open`; omit the clause if 0). The date is redundant (the device shows it) and stays `inkDim`; the friends-out count is information and sets in `inkMuted`. At `≥ .accessibility1` the running head leaves the masthead and becomes the **first row of the feed** (a 32pt `Color.surface` band, same text at `Font.dt.bodySmall`), so the count is never lost — it simply moves off the masthead.
- Right cluster, 12 gap, **every item a 44×44 hit target** regardless of glyph size:
  - Sort toggle (Feed only): "RECENT" / "UPCOMING" `Font.dt.label`, active `Color.ink` + 1pt underline, inactive `Color.inkMuted` (the inactive option is a choice the user reads; faint failed at 2.2:1), crossfade 150ms, `.selection`. The list reorders per §5.1. The two words share one 44-tall control (`accessibilityLabel("sort")`, `accessibilityValue("recent")`, adjustable trait).
  - Bell: 24 glyph (SF `bell`) `Color.ink`, hit 44, dot/count per §4.7 → Notifications sheet.
  - **"+"**: 36 circle `Color.dt` centred in a 44×44 `.contentShape`, "+" Inter 600 22 `Color.onDt`, `accessibilityLabel("new check")`. Press: scale 0.92 `Spring.ink`, `.impact(weight: .medium)`. `[graft: tactile/native26]` For the lifetime of the Create overlay the "+" **rotates 45° into "×"** (`Spring.page`) and acts as its close button; it rotates back on dismiss.
  - **Glow** (`glowAdd`: the user skipped the first check and has no authored checks): `.shadow(color: Color.dt.opacity(0.55), radius: r)` with `r` pulsing 8 → 18 → 8 over 2.0s `easeInOut` `repeatForever`, plus a ripple `Circle().stroke(Color.dt.opacity(0.35), lineWidth: 1.5)` scaling 1.0 → 1.6 and fading 0.35 → 0 every 2.0s, offset 1s. Reduce Motion: static glow radius 14, no ripple. Stops the first time a Create is completed.

### 4.13 Empty states

A colophon page, centred in the content area, 32 side padding:

- A single "✶" `Font.dt.masthead` `Color.dt` above the headline, 24 gap; rotates 0 → 360° once over 1.2s `easeOut` on first appearance (Reduce Motion: none).
- Headline `Font.dt.display` `Color.ink`, lowercase, max 2 lines, from a pool — feed: "nothing's on.", "quiet week.", "the group chat is empty and so is this."; squads: "no squads yet.", "nobody's locked in."; notifications: "all caught up.", "nothing. peaceful."; hidden: "nothing hidden. suspicious." `[graft: native26]` The headline is rendered with `WobbleRenderer` (§5.9): each glyph drops in from y −6 with a 20ms stagger.
- One line `Font.dt.body` `Color.inkMuted` ("post a check and see who bites").
- One text link `Font.dt.button` `Color.dtInk` ("POST A CHECK →").
- Pull-to-refresh works on empty states.

### 4.14 Pull-to-refresh — `Pull`

Custom (`.refreshable`'s spinner cannot be hidden and doesn't belong on paper). Track overscroll with

```swift
.onScrollGeometryChange(for: CGFloat.self) { geo in
    geo.contentOffset.y + geo.contentInsets.top      // transform
} action: { _, pull in
    model.pull = -min(0, pull)                       // old, new
}
```

(the modifier takes `of:`-style transform + `action:` with old/new — the shorthand written in earlier drafts does not compile).

- 0 → 72pt pull: "PULL" `Font.dt.label` `Color.inkDim` fades in from 24pt of pull; under it a 2pt `Color.dt` rule grows from the centre outward, width = `min(1, pull/72) × (screen − 40)`.
- At 72: label → "RELEASE", `.impact(weight: .light)` once (armed flag resets when pull < 48).
- Release ≥ 72: the content is held at a 56pt offset by a `.safeAreaInset(edge: .top)` spacer animating 0 → 56 with `Spring.snap` (this is the reliable way to "hold" a SwiftUI `ScrollView`; do not fight `contentOffset`); label → "REFRESHING"; the rule shimmers (as §4.2) until data returns; minimum 500ms; then the spacer animates to 0 with `Spring.page` and new items insert per §5.1. `.impact(flexibility: .soft)` on completion if ≥ 1 new item.
- Release < 72: settles, no haptic. Reduce Motion: no shimmer, label only.

---

## 5. Motion system

All springs are `Animation.spring(response:dampingFraction:)`. Every animated property is driven by state, never fire-and-forget, so a second gesture retargets mid-flight.

**Naming.** SwiftUI already owns `Spring` (the iOS 17 physics struct), so the app's enum is **`DTSpring`** (`enum DTSpring { static let page: Animation … }`); this document writes `Spring.page` etc. for brevity and every occurrence means `DTSpring.page`. Likewise fixed curves are written `.smooth(duration: 0.25)` / `.snappy(duration: 0.45)` — the labelled form; `.smooth(0.25)` does not compile.

| Name | response | damping | Feel | Used for |
|---|---|---|---|---|
| `Spring.page` | 0.42 | 0.86 | a page turning and lying flat | sheet content stagger, Folio underline, toasts, NEW flag, list insertion, section expand, tab content, squad-formed strip |
| `Spring.settle` | 0.55 | 1.00 | no bounce | expiry width, poll bars, tint/opacity changes, reflow, numeric rolls, un-down |
| `Spring.snap` | 0.35 | 0.80 | firm | pull hold, toast release, chip selection, handle widen |
| `Spring.ink` | 0.26 | 0.72 | quick, slight give | press-down/up, avatar tap and fan-out, pill toggles, "+" press |
| `Spring.stamp` | 0.22 | 0.55 | thunk with overshoot | **DOWN stamp**, **SQUAD FORMED**, unread dot appear, avatar insertion, availability selector overshoot |
| `Spring.reveal` | 0.70 | 0.90 | slow, ceremonial | mystery reveal only |

Fixed-duration curves are used only for masks/wipes (`linear` 140–180ms), press-in (60–70ms `easeOut`) and opacity/colour crossfades (`easeInOut` 120–250ms). Stagger is 40ms per item, max 6 staggered, the rest arrive together.

`Motion.resolve(_:)` maps every spring to `Spring.settle` (and disables offsets/scale/masks) when `accessibilityReduceMotion` is on. See §8.

### 5.1 List insertion, removal, reorder (feed, squads, notifications)

- `LazyVStack` keyed by id inside `withAnimation(Spring.page)`. Insertion: `.transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: −8)), removal: .opacity))`; removal 160ms; rows below reflow with `Spring.settle`.
- `[graft: native26]` **First feed load (cold or after auth)**: the first six entries stagger in 40ms apart, `offset(y: 12 → 0)` + opacity, `Spring.page`; entries 7+ appear together. Not repeated on subsequent loads or tab switches.
- **Realtime while reading**: if the user is scrolled > 200pt down, hold inserts and show the "N new ↑" pill (§4.7) under the masthead; tap → scroll to top `Spring.page` and apply. At top: apply immediately. Never shove the page.
- Realtime insert of someone else's check flashes `Color.dtSubtle → tint` over 600ms.
- Removal (hide / delete): entry collapses height with `Spring.settle`; "check removed — undo?" slip.
- `[graft: tactile]` **Sort change (RECENT ↔ UPCOMING)**: entries dip to opacity 0.6 over 120ms while reordering in place, matched by id with `Spring.settle`, then return to 1.0 — the reader sees rows move, not a reload.

### 5.2 Tab switch

No horizontal slide. Outgoing content opacity 1 → 0 in 100ms; incoming opacity 0 → 1 + `offset(y: 6 → 0)` `Spring.page`; the Folio underline slides concurrently. Scroll position preserved per tab (each tab is its own `NavigationStack` kept alive in a `ZStack`, toggled with opacity + `allowsHitTesting`).

### 5.3 Sheet present / dismiss

Native. Internal content stagger 40ms per block, `Spring.page`. On dismiss back to a feed entry the entry flashes `Color.dtFaint` for 150ms so the eye finds it.

### 5.4 Entry → detail (the one camera move)

`NavigationLink` with `.navigationTransition(.zoom(sourceID: check.id, in: feedNS))`; the entry is `.matchedTransitionSource(id: check.id, in: feedNS)`. The detail page has a `Color.paper` background so it reads as the same page zooming; its extra sections (DOWN, WAITLIST, COMMENTS) fade in after the zoom lands with `Spring.page`, 60ms stagger. Back: the zoom's own interactive dismiss (drag anywhere) or the edge pop. Events use the hero as the zoom source. The detail hides the Folio. Reduce Motion: the system's reduced-motion crossfade, automatically.

### 5.5 Squad chat push

Standard `NavigationStack` push from the right, interactive pop preserved through `ARCHITECTURE.md` §7.5's `InteractivePopEnabler` (the system bar is hidden, §4.10). Folio hidden by root state. First open of a freshly-formed squad: the header name does a one-time `Spring.stamp` scale 0.9 → 1.

### 5.6 SQUAD FORMED

Trigger: your own DOWN returns a new `squadId`; or a `squad_invite` / first-other-down notification arrives in the foreground for a check you are on. Total ≈ 2.0s. Tap anywhere skips to the end state.

| t | What |
|---|---|
| 0 | CoreHaptics pattern starts (§6.2). If the entry is on screen it gets a 120ms `Color.dt@0.35` band flash at 0ms. |
| 0 → 460 | **The stamp**: "SQUAD FORMED" `Font.dt.buttonLarge` `Color.onDt` on a `Color.dt` rounded rect (radius 8, padding 12/20), rotated **−6°**, with a 1pt `Color.ink` inset frame 3pt in. Scale 1.6 → 1.0 + opacity 0 → 1 with `Spring.stamp`, timed so the overshoot apex lands at **460ms** — the THUD transient. Centred on the entry (or centred on screen if the entry is off-screen). `Elevation.lifted`. |
| 460 → 800 | `[graft: native26]` A `Color.deep` strip **unfurls out of the entry's bottom edge**: height 0 → 56 with `Spring.page`, `.clipped()`. Content on the 20 gutter (`paperStock = .deep`): `AvatarStack` `small` of the members → "kat, devon + you" `Font.dt.bodySmall` `Color.ink` → spacer → "OPEN →" `Font.dt.button` `.dtInk` (`#A000A2` on deep, 4.67:1). The whole strip is a button → chat, 56 tall so it is its own hit target. If the entry is off-screen, the strip is skipped and the slip toast carries the action. |
| 1700 | The stamp shrinks (scale → 0.6, opacity → 0, 220ms `easeIn`) toward the SQUADS Folio label, where the red dot pops (`Spring.stamp`). |
| 1700 | Slip: "squad formed! → open" with `Color.dt` action (6s). |
| +8s | The strip folds back (height → 0, `Spring.settle`) unless tapped. |

If you are in the SQUADS tab or a chat when it fires: no stamp; the new row inserts at the top of NEW MESSAGES with its avatar stack popping, the haptic pattern still plays. VoiceOver: `AccessibilityNotification.Announcement("squad formed")`. Reduce Motion: no stamp/strip; toast + haptics only.

**The common case — you joined an existing squad ("you're in").** Formation happens once per check; far more often your DOWN lands you in a squad that already exists (`auto_join_squad_on_down_response` returns `joined`). That is not a ceremony, it is a door opening — so no stamp, no Pattern A, and the stamp choreography of §4.3 is the whole event. What is added, at server ack (the moment `.success` fires):

| t | What |
|---|---|
| ack | The same `Color.deep` strip unfurls from the entry's bottom edge (height 0 → 48, `Spring.page`) — 8pt shorter than the formation strip, no stamp above it. Content: `AvatarStack` `small` of the members → "you're in · kat, devon + 2" `Font.dt.bodySmall` `Color.ink` (a `✓` `Color.successInk` glyph leads it) → spacer → "OPEN →" `Font.dt.button` `.dtInk`. Whole strip is a button → chat. |
| ack | The SQUADS Folio label's red dot pops (`Spring.stamp`) — the chat has a system line waiting ("kat just entered the chat" is *about you*). No slip toast; the strip is the message. |
| +6s | The strip folds back (`Spring.settle`) unless tapped. Thereafter the entry's response row carries a permanent trailing "OPEN SQUAD →" `Font.dt.meta` `.dtInk` link under the toggle (checks only; events use the lobby), so the chat is always one tap from the feed. |

If the ack returns `waitlisted`, the waitlist landing (§4.3) plays instead and the strip reads "you're #2 on the waitlist · OPEN →" on `Color.waitlistBg`. If the entry is off-screen (you downed from the detail page), the detail's DOWN bar itself becomes the strip: it collapses from 52 to 48 and takes the strip's content, then a slip "you're in → open" (6s). Reduce Motion: the strip appears with a crossfade. VoiceOver: announcement "you're in the squad".

Tapping OPEN → on either strip pushes the chat (§5.5); the first open of a squad you *joined* (vs formed) skips the header-name `Spring.stamp` — that one is for the founders.

### 5.7 Mystery reveal

Trigger: the first time the app renders a check (feed or detail) whose `isMysteryUnrevealed` has flipped to false since it was last seen redacted (per-check flag in local store — fires once per check per device); also in chat on the day. The flip is evaluated in **viewer-local time** from `event_date` (port `isMysteryUnrevealed` from `mystery.ts` exactly). Because it can flip *while the check is on screen*, the trigger is store state: `FeedStore.dayChanged()` (`ARCHITECTURE.md` §4.8, on `NSCalendarDayChanged` / `NSSystemTimeZoneDidChange`, plus an immediate `tick()` on `scenePhase == .active`) rebuilds and sets `revealedNow: Set<CheckID>`; every redacted `CheckEntry`, the detail page and the chat (§4.10) watch it and run this sequence in place when their id appears (staggered 200ms if several reveal at once, most-visible first); nothing waits for a reload, and no view schedules its own `TimelineView(.explicit)`. Total ≈ 2.0s, `Spring.reveal` unless noted.

1. **Fuse** (0 → 850ms): the "?" frame glyphs flip to "✦" then fade, clockwise from top-left, 18ms apart (~48 glyphs). Haptic: continuous rumble per §6.2.
2. **Flip** (700 → 1100ms): the kaomoji avatar `rotation3DEffect` Y 0 → 90° (120ms `easeIn`), swaps to the letter, 90 → 0° `Spring.reveal`.
3. **Unscramble** (900 → 1500ms) `[graft: native26]`: the scrambled name is rendered with `ScrambleRenderer` (§5.9): each glyph cycles through ~6 random symbols from `censor.ts`'s symbol set at 25ms before settling on the real character, left to right, 25ms/char stagger; weight 500 → 600 as it settles. It reads as decryption, which is what the symbol scramble was.
4. **Guests** (1300 → 1900ms): avatars rise in `Spring.stamp` with 50ms stagger (transients per avatar, §6.2); the count is set in `Font.dt.displayCount` and **counts up 0 → N** with `.contentTransition(.numericText(countsDown: false))`, then "N down — revealed" `Font.dt.label` `.dtInk`. For the **author**, steps 2–3 are skipped (their own byline was never redacted) and the reveal is steps 1 and 4 only: the frame burns and the guests rise — the author's moment is seeing who came. 
5. The frame is gone; the band goes to `mine`/`down` as appropriate. In chat: member kaomoji flip to letters with the same Y-spin, sender names unscramble, and a system line "the guests have been revealed" arrives.
Reduce Motion: a single 300ms crossfade + `.success`.

### 5.8 Expiry hits zero on screen

The rule collapses (width → 0, `Spring.settle`), "expired" fades in replacing "Xh left" (`.numericText`), the text recolours to the expired tokens of §4.1 (`Color.ink → Color.inkExpired` on the body and when·where, the byline avatar fill → `Color.ruleLight`, response avatars → 0.6, NEW flag out) as one 600ms `easeInOut` colour crossfade — **the entry's opacity never changes**; the toggle → CLOSED. `.impact(flexibility: .soft)` once. After 2s the entry migrates out of TIMED (reflow, `Spring.settle`) so the user sees what happened. OPEN SQUAD →, if present, stays exactly where it was (§4.1).

### 5.9 Text renderers (`TextRenderer`) `[graft: native26]`

- `ScrambleRenderer` — mystery name reveal (§5.7). State: `progress: Double` (animatable). For glyph *i* of *n*, settled when `progress ≥ (i + 1) / n`; before that it draws a random symbol re-picked every 25ms (seeded by `(i, floor(elapsed/25ms))` so it is deterministic per frame). Draws via `layout.flattenedRuns` and `context.draw(slice)` on the substituted `Text`.
- `WobbleRenderer` — drop-in for the deleted-check quip, empty-state headlines and the "WAITLISTED" label. Each glyph from `offset(y: −6)` + opacity 0 → 0, 1, 20ms stagger, `Spring.page`.
- Both check `accessibilityReduceMotion` and draw the final state immediately when it is on.

### 5.10 Scroll-driven

Feed entries: none beyond §4.5's hero scale — anything more turns a broadsheet into a carousel. Section labels pin with `pinnedViews: .sectionHeaders`; the masthead does not collapse.

---

## 6. Haptics

### 6.1 Map

Use `.sensoryFeedback(_:trigger:)` where the trigger is a state change; a prepared `UIImpactFeedbackGenerator` only for in-gesture cases (grid paint, pull threshold); CoreHaptics for the two composed patterns. Never haptic on realtime-driven changes the user didn't cause, except the two ★ moments (and the three "it landed for you" acks — promotion, revive, join accepted — which are consequences of the user's own earlier DOWN/REQUEST). Haptics stay on under Reduce Motion — they are the substitute for motion. A "Haptics" toggle in Profile (default on) gates everything.

**API spelling.** `SensoryFeedback` has no positional impact form. The two impact families are `.impact(flexibility: .soft | .rigid | .solid, intensity: Double = 1)` and `.impact(weight: .light | .medium | .heavy, intensity: Double = 1)`; the others used here are `.success`, `.warning`, `.error`, `.selection`, `.levelChange` (unused). Every occurrence in this document is written in that form; a review that finds `.impact(.soft, 0.5)` in code has found a compile error, not a style choice. The in-gesture generators are `UIImpactFeedbackGenerator(style: .soft | .rigid | .light | …)` with `impactOccurred(intensity:)`.

| Action | Feedback |
|---|---|
| Entry press (touch-down + 40ms) | `.impact(flexibility: .soft, intensity: 0.35)` |
| DOWN touch-down | `.impact(flexibility: .soft, intensity: 0.5)` |
| DOWN apex (R+90ms) | `.impact(flexibility: .rigid, intensity: 0.9)` |
| DOWN confirmed by server | `.success` |
| Un-down | `.impact(weight: .light)` |
| Converted to waitlist | `.warning` |
| Server rollback / error toast | `.error` |
| Tab switch, sort toggle, chip select, segment, vibe pill | `.selection` |
| Sheet detent reached | `.impact(weight: .light, intensity: 0.5)` |
| Pull armed / completed with new items | `.impact(weight: .light)` / `.impact(flexibility: .soft)` |
| Send message / comment | `.impact(weight: .medium)` |
| Poll vote toggled | `.selection` |
| Grid cell painted / gesture end | `.selection` (≥ 40ms apart) / `.impact(weight: .light)` |
| Close poll / lock date / STILL DOWN / friend accepted | `.success` |
| CAN'T MAKE IT / leave squad / hide / leave pool | `.impact(weight: .medium)` |
| Delete check / kick / block confirmed | `.warning` → `.impact(weight: .heavy)` on completion |
| Undo tapped | `.impact(flexibility: .soft)` |
| Save / unsave event | `.impact(weight: .light)` / `.impact(flexibility: .soft, intensity: 0.4)` |
| OTP digit | `.selection`; 8th digit `.impact(weight: .medium)`; accepted `.success`; rejected `.error` + shake (3 × 6pt, 320ms) |
| "+" press | `.impact(weight: .medium)` |
| Avatar stack fan-out | `.selection` |
| Availability selector | `.selection` at the overshoot apex |
| Copy build ID / copy webcal | `.impact(flexibility: .rigid)` |
| Long-press context menu | system |
| Countdown crosses 1h / expiry hits zero on screen | `.impact(flexibility: .soft)` once |
| ★ Squad formed | CoreHaptics pattern A |
| ★ Mystery reveal | CoreHaptics pattern B |
| New message in the open chat | none |
| Push for another squad in foreground | system banner only |

### 6.2 Composed patterns — `HapticEngine` actor `[graft: tactile]`

```swift
actor HapticEngine {
    static let shared = HapticEngine()
    private var engine: CHHapticEngine?
    func prepare() async throws      // creates engine, sets resetHandler → restart, stoppedHandler → mark needsRestart
    func restartIfNeeded() async     // called from the app's scenePhase == .active observer
    func play(_ pattern: HapticPattern) async  // builds CHHapticPattern, makePlayer, start(atTime: 0)
}
```

`CHHapticEngine` is not `Sendable`; keep it isolated to the actor and pass only value-type pattern descriptions in. The app root observes `scenePhase` and calls `restartIfNeeded()` on `.active` (the engine stops on background). Fall back to `.sensoryFeedback` equivalents when `CHHapticEngine.capabilitiesForHardware().supportsHaptics` is false.

**Strict-concurrency notes (Swift 6.2).** `resetHandler` and `stoppedHandler` are invoked by CoreHaptics on an arbitrary thread, outside the actor. They must not touch actor state directly; each closure hops back in:

```swift
engine.resetHandler = { [weak self] in
    Task { await self?.handleReset() }          // actor-isolated method
}
engine.stoppedHandler = { [weak self] reason in
    Task { await self?.handleStop(reason) }     // CHHapticEngine.StoppedReason is a value type
}
```

The closures capture only `self` (weak) and value types, so they are `@Sendable`-clean. **Module isolation:** the app target enables SE-0466 default `MainActor` isolation (`-default-isolation MainActor`, the Xcode 26 "Approachable Concurrency" setting). Every type is therefore `@MainActor` unless marked, which is what a UI app wants; `HapticEngine` is an explicit `actor`, and the few pure helpers that must run off-main (image resize, the ICS builder, the date parser's test harness) are marked `nonisolated`. `CHHapticEngine` creation happens inside the actor, so it never crosses an isolation boundary.

**Every other off-main callback, stated once.** Under default `MainActor` isolation any closure a system framework invokes on its own queue is *not* on the main actor, and Swift 6.2 will not let it touch `@MainActor` state directly. The app has exactly these, and each hops with `Task { @MainActor in … }` (or calls a `@MainActor` method through `await`), capturing only `Sendable` values:
- `NWPathMonitor.pathUpdateHandler` (§7.15 offline band) — the monitor runs on its own `DispatchQueue`; the handler forwards `path.status` (a value) to `Reachability.shared.update(_:)` (`@MainActor`).
- Supabase Realtime channel callbacks (`onPostgresChange`, `onBroadcast`, status changes) — delivered on the client's queue; each handler decodes the payload into a value struct and hops. Prefer the SDK's `AsyncStream` forms (`for await change in channel.postgresChange(...)`) inside a `Task` started from a `@MainActor` view model, which lands the loop body on the main actor without a manual hop.
- `UNUserNotificationCenterDelegate` (`willPresent`, `didReceive`) and `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` — mark the delegate class `@MainActor` (UIKit calls these on main) rather than hopping.
- `CHHapticEngine` handlers as above; `ImageRenderer` / image resize / ICS build are `nonisolated` pure functions called with `await`.
- `TimelineView` schedules and `onScrollGeometryChange` are already main-actor.
Anything not on this list that turns out to be off-main is a review defect, not a design decision.

**Pattern A — SQUAD FORMED** ("tap-tap-hmmm-THUD"), synced to §5.6:

| Time | Event | Intensity / Sharpness |
|---|---|---|
| 0ms | transient | 0.5 / 0.3 |
| 90ms | transient | 0.7 / 0.5 |
| 180–420ms | continuous | intensity 0.35 → 0 (parameter curve), sharpness 0.2 |
| 460ms | transient | 1.0 / 0.8 — the stamp lands |

**Pattern B — MYSTERY REVEAL**, synced to §5.7:

| Time | Event | Intensity / Sharpness |
|---|---|---|
| 0–850ms | continuous | 0.25 / 0.6, intensity ramping 0.15 → 0.35 (the fuse burning) |
| 900ms | transient | 0.9 / 0.4 (the flip) |
| 1300ms + 70ms × k, k = 0…min(N−1, 5) | transient | 0.4 / 0.9 (each guest rising) |
| 1900ms | transient | 0.8 / 0.5 (count lands) |

---

## 7. Screen-by-screen

### 7.0 What M1 ships of this section (`ARCHITECTURE.md` §15 wins on scope)

Everything in §7 is the *finished* design. Milestone 1 ("foundation + core loop") builds the subset in `ARCHITECTURE.md` §15; where a web affordance is deferred, §15.1 there says whether it is **hidden** (not rendered) or **stubbed** (rendered, does something honest). This table is the same list in this document's vocabulary, so a builder of either doc renders the same M1 screen. A reviewer comparing M1 to §7 must not file the M2 rows.

| §7 surface | M1 | What M1 renders instead |
|---|---|---|
| §7.1–§7.3 Auth, OTP, profile setup, notifications gate, friend gate, first check | **M1** | as specified (the first-check screen is `CreateOverlay` in "first" mode) |
| §7.4 Feed, §4.1 `CheckEntry`, §4.2, §4.3 (checks), §4.6, §4.7, §4.12 `Masthead`, §4.13, §4.14 `Pull`, §7.15 press states | **M1** | as specified. Movie header (§4.1 #3): **stubbed** — the poster/title/director block is M2; M1 renders only "LETTERBOXD →" `Font.dt.button` `.dtInk` under the check text when `letterboxd_url` is set (`movieMetadata` decoded and ignored) |
| §4.5 `EventEntry` | **M1 read-only**: idle / new / mine / down / imminent / past / highlighted states, hero + wash, byline, DOWN ? / DOWN ✓ via `saved_events.is_down`, "Alice + 3 others down" row | **stubbed**: tapping the response row → slip "lobby's coming to iOS soon ✶" (no `EventLobbySheet`). **Hidden**: the JOIN SQUAD → / WAITLIST → / REQUESTED secondary pills (§4.3 event rows), SAVE / ✓ SAVED, the poster's visibility chip, inline event comments (rows and composer; incoming `event_comments` realtime rows are dropped). The `saved` state therefore has no M1 entry point |
| §7.5 `CheckDetailView` + `EditCheckSheet` + `CheckActionsSheet` + `DeletedCheckView` + comments | **M1** | as specified (comments reportable via long-press: **Copy only** in M1 — see §7.14 row) |
| §7.6 `CreateOverlay` | **M1: IDEA tab only** | the PASTE LINK tab, its `PasteButton`, the scrape skeleton/failure band and the manual MOVIE / EVENT fallback are M2 — the typeset tab index renders "IDEA" alone (no second tab, no underline slide). The POST text flight, chips, mystery frame and draft restore are M1 |
| §7.7 Squad list, §7.8 chat, §4.10 transcript, images, date-confirm bar, `DateProposalSheet`, propose / lock / clear, join-request banner, chat lifecycle states, `SquadSettingsSheet` (stepper → `update-size`, EXTEND, DATE row, LEAVE), `SquadMembersView` list | **M1** | as specified, except: **polls** — the composer's poll glyph is rendered at `Color.inkFaint` in its 44 target, not tappable, `accessibilityHint("polls are on web for now")`; an existing `.poll` message renders `PollPlaceholderRow` — the §4.10 `Color.deep` radius-12 card with the question `Font.dt.headline` and one line "poll — open on web for now" `Font.dt.system` `Color.inkMuted` + "COPY LINK" `Font.dt.button` `.dtInk` (copies `webBase/?tab=squads&squadId=`); the active-poll chip still renders and scrolls to that row; PROPOSE THIS → on polls is M2. **Member management** (move to/from waitlist, kick, ADD FROM PEOPLE DOWN, REQUESTS section) is hidden — `SquadMembersView` is a list. **EDIT EVENT** row hidden for event squads (title read-only in the header); for check squads the DATE row is the edit path. No `PollComposer` (§7.13 is M2) |
| §4.10 long-press on a message | **M1: Copy** (and Copy image) | Report… / Block / Delete items absent; message and comment reporting is M2 and **must land before App Store submission** (Guideline 1.2) |
| §7.9 Notifications sheet | **M1** | as specified (all 23 glyph/tint rows) |
| §7.10 Profile | **M1** | as specified, except the **Sync to calendar** row is hidden (§7.16's sheet is M2 — a settings row that opens "coming soon" reads as broken) and the Theme/EDITION row is hidden as already stated. The Haptics toggle is M1 |
| §7.11 `EventLobbySheet` | **M2** | see the `EventEntry` row |
| §7.12 `FriendsSheet`, `UserProfileSheet` | **M1** | as specified |
| §7.13 `PollComposer` | **M2** | see the squads row |
| §7.14 `ReportSheet` | **M1 for `.check` and `.profile`** | the `.squadMessage` / `.checkComment` / `.eventComment` targets are M2 (with the long-press items above) |
| §7.16 `EditEventSheet`, Sync-to-calendar sheet | **M2** | share flows for **checks** and **friend invites** (the `ShareLink` previews) are M1; the event share is M2 with `EditEventSheet` |
| §7.17 deep links, shared-check entry, push routing | **M1** | as specified; the AASA file is a web-repo deliverable (`ARCHITECTURE.md` §7.2) |
| §7.18 launch surface, icon, quick actions | **M1** | as specified |
| Dragonfruit / night edition | **M2 / v1.1** | §1.1, §7.10 |

### 7.1 Auth / OTP

- Full page `Color.paper`, top third empty. Wordmark "down to" `Font.dt.masthead` on the 20 gutter at the optical centre-left; under it "see who's down." `Font.dt.body` `Color.inkMuted`.
- Context banner (shared check / `?add=`): a `Color.checkNew` band above the form, `Font.dt.bodySmall`: "Sara wants to know if you're down" with the check text in `Font.dt.headline` `Color.ink` 500 (no italic Inter is bundled).
- Email: no box. A single 1pt `Color.ruleMid` baseline rule; text `Font.dt.title` `Color.ink`; placeholder "your@email" `Color.inkFaint`; `.keyboardType(.emailAddress)`, `.textContentType(.emailAddress)`, `.autocorrectionDisabled()`. On focus the rule becomes 2pt `Color.dt` (`Spring.settle`). "did you mean gmail.com?" under the rule `Font.dt.meta` `Color.dtInk`, tappable, slides in `Spring.page`.
- CTA "SEND CODE →" `Font.dt.buttonLarge` full-width 52 pill `Color.dt`/`Color.onDt`, pinned above the keyboard with `.safeAreaInset(edge: .bottom)`. While sending: label → "SENDING", disabled, and the baseline rule shimmers (§7.15).
- **Pre-send validation** (port `emailValidity.ts`): an invalid or obviously mistyped address turns the baseline rule `Color.danger` (2pt) with "that doesn't look like an email" `Font.dt.meta` `Color.dangerInk` under it, `.error` once; the CTA stays enabled so the user can insist (the web behaves the same). Disposable-domain and typo suggestions ("did you mean gmail.com?") are the `.dtInk` line already described.
- **Send failure**: network → slip "couldn't send the code — check your connection" (`Color.danger` rule) and the CTA returns to "SEND CODE →"; **rate-limited** (Supabase 429 / `over_email_send_rate_limit`) → the OTP screen is *not* shown; instead the CTA becomes a `Font.dt.meta` countdown "try again in 0:58" `.numericText(countsDown: true)` `Color.inkMuted` under a disabled pill, then re-enables; **unknown email provider error** → the slip with the server's message and a "DIFFERENT EMAIL" action.
- **OTP failures**: wrong code → shake + `.error`, slots clear, "that's not it" `Font.dt.meta` `Color.dangerInk` for 2s; **expired** (after 1h) → "that code expired" + the RESEND button promoted to the primary pill; **too many attempts** → the slots lock (`Color.inkFaint`) with "too many tries — resend a new code"; no network → slip, code retained so the user can retry with the same digits.
- **Session expiry** (refresh token revoked / `signed_out` event while in-app): no modal. The root swaps to Auth with a crossfade (`Spring.settle`) and a `Color.checkNew` context band "you were signed out — sign in again to pick up where you left off"; the pending route (open squad, highlighted check) is retained in memory and replayed after sign-in.
- OTP: the email in `Font.dt.meta` `Color.inkMuted` + "different email" `Color.dtInk`. **8 digit slots** rendered as one `Font.dt.numeral` string with 6pt tracking over an invisible `TextField` (`.textContentType(.oneTimeCode)`, `.keyboardType(.numberPad)`) so Mail autofill works; unfilled slots "·" `Color.inkFaint`; each entered digit pops scale 1.3 → 1 in 60ms. Auto-submit at 8. Wrong: shake + `.error`, slots clear. Resend after 20s as "RESEND" `Font.dt.button`; before that a `Font.dt.meta` countdown `.numericText(countsDown: true)`.
- Footer "terms · privacy" `Font.dt.meta` `Color.inkDim` → `SFSafariViewController`.

### 7.2 Profile setup

- Headline "who are you?" `Font.dt.display`. Fields stacked 32 apart, baseline-rule style: display name (counter "12/30" `Font.dt.meta` right, `.numericText`, `Color.dangerInk` at 30); username with a fixed "@" prefix `Color.inkDim`, lowercase keyboard, validation `^[a-z0-9_]{3,20}$`, live line debounced 400ms ("that one's taken" `Color.dangerInk` on 23505, "looks good" **`Color.successInk`** `#1F7A32` 5.28:1 with a `✓` — never `Color.success`, which is 1.96:1 on paper; while the check is in flight the line reads "checking…" `Color.inkMuted`); instagram optional.
- **Live preview**: a real `CheckEntry` in `mine` state at the bottom, text "who's down for something tonight?", byline updating as you type; the avatar letter flips with `rotation3DEffect` Y when the initial changes.
- CTA "THAT'S ME →" `Font.dt.buttonLarge`.

### 7.3 Notifications gate / friend gate / first check

- Notifications: `Font.dt.display` "we'll tell you when someone's down." + a mock notification row (`Color.deep`, radius 16, system-style) + "ENABLE" primary, "SKIP" `Font.dt.button` `Color.inkMuted`.
- Friend gate: baseline-rule search; rows 56 (avatar `medium`, name `Font.dt.headline`, @username `Font.dt.meta`, trailing "ADD" `Font.dt.button` `Color.dtInk` → "REQUESTED" `Color.inkMuted`; row states match §7.12). Shared-check author pinned in a `Color.checkNew` band with "they sent you here" `Font.dt.label`. "CONTINUE →" always enabled.
- First check: the Create overlay (§7.6) in "first" mode with "skip for now" `Font.dt.meta` `Color.inkMuted` top-right → sets `glowAdd`.

### 7.4 Feed

- `Masthead` then `ScrollView` + `LazyVStack(spacing: 0, pinnedViews: .sectionHeaders)`, bottom inset per §3.1.
- Section labels: `Font.dt.label` **`Color.inkMuted`** (they are the feed's table of contents — TIMED / OPEN / HIDDEN carry meaning, so 5.3:1 not 3.45:1) on the gutter with a 1pt `Color.rule` from the label's right edge to the screen edge; "TIMED ✶ 3" (pinned; most urgent first), "OPEN" (checks + events interleaved by sort), "HIDDEN (2)" as a `DisclosureGroup` styled the same, "›" rotating 90° `Spring.page`; **hidden entries are never dimmed by opacity** — they use the expired recolouring of §4.1 (check text and when·where → `Color.inkExpired`, 1pt `Color.inkFaint` strikethrough on the check text — the one place strikethrough is allowed — byline avatar → `Color.ruleLight` fill, response avatars at 0.6, expiry track emptied, no NEW flag, no toggle) so every word still clears 4.5:1 on its tint, with a trailing "UNHIDE" `Font.dt.button` `.dtInk` in the toggle's slot (44 target). The section itself sits on `Color.card`; tint bands are kept (a hidden check you were down on still reads as yours). Unhide: the entry recolours back (`Spring.settle`) and re-sorts into TIMED/OPEN per §5.1.
- Cold start, errors, offline: §7.15. The first-load stagger of §5.1 runs on the transition *skeleton → data*, never on an empty list.
- `FriendRequestBanner`: `Color.checkNew` band under the masthead, 44 tall, "Devon wants to be friends" `Font.dt.bodySmall` + "ACCEPT" `Color.dtInk` / "LATER" `Color.inkMuted`; collapses `Spring.page`.
- Push-permission band (`NotifNudgeBanner`; shown per `ARCHITECTURE.md` §4.9 — permission not authorized, not dismissed, and only once the user has ≥ 1 squad or ≥ 1 check): `Color.surface`, "turn on notifications so you know when they're down" `Font.dt.bodySmall` `Color.ink` + "ENABLE" `.dtInk` (→ request, or Settings when `.denied`) and a trailing "×" 20 glyph in a 44 target (`dt.notifNudgeDismissed`); collapses `Spring.page`.
- Highlight-from-push: scroll to the entry `Spring.page`, flash per §4.1.
- Foreground: silent reload; "N new ↑" rule.
- First load stagger per §5.1; NEW seen-tracking per §4.1.

### 7.5 Check detail

- Zoomed page (§5.4), `Color.paper`, Folio hidden. Same chassis; check text `Font.dt.display`, full length; when·where `Font.dt.body`; movie block with poster 64×96 and "LETTERBOXD →" `Font.dt.button` `Color.dtInk`; byline lists co-authors ("with Devon, Sara").
- **DOWN** section label then `medium` avatars in a grid of 6 per row, name `Font.dt.meta` under each (2 lines); you first with a 2pt `Color.dt` ring. **WAITLIST** with ordinals "#1", "#2" `Font.dt.badge`. Tap a person → `UserProfileOverlay`. Pre-reveal mystery: "guests revealed on {date}" in a `Color.deep` band with a `Font.dt.display` "?" `Color.dt`; on the day the reveal (§5.7) plays here.
- **COMMENTS**: transcript style (§4.10) at `Font.dt.bodySmall`; composer pinned with `.safeAreaInset(edge: .bottom)`, 44 tall, 280-char counter appears at 240. Empty: "say something. or don't." `Font.dt.system`.
- Author/co-author: "EDIT" `Font.dt.button` `Color.dtInk` top-right → the **`EditCheck` sheet**, below. Non-owner: "⋯" → `CheckActionsSheet` `[.height(160)]` (two 52 rows: "hide" `Color.ink`, "report" `Color.dangerInk` → §7.14). Comments are reportable via long-press (§4.10).

**`EditCheck` sheet** `[.large]` (`paperStock = .surface`) — **reuses the EditEvent idiom of §7.16 exactly** (baseline-rule fields 32 apart in the §7.2 style, blocks staggered in per §4.9, pinned SAVE, dirty guard) and covers all six web controls (INVENTORY §1: text, date/time, where, co-authors, share, delete). Blocks top → bottom:
1. **Text** — the Create editor (§7.6) inside the sheet: `Font.dt.display` `Color.ink`, autogrow to 8 lines, no counter (the web has none; the DB has no length cap on `text`). @mention autocomplete works here too: the `Color.deep` list is **inserted into the layout under the caret line** (an inline block that pushes the following fields down with `Spring.page`), *not* an overlay — inside a `.presentationContentInteraction(.scrolls)` sheet an overlay would be clipped at the sheet edge and a drag on it would fight the sheet; an inline block simply scrolls with the content, and the sheet is at `.large` so no detent fights it either. Picking a name inserts a mention chip and adds them as a co-author (block 3).
2. **WHEN** (natural-language field, parse preview "→ thu 25 sep · 7:00pm" `Font.dt.meta` **`Color.successInk`** — on the `surface` sheet that resolves to `#1A6B2B`, 4.79:1; this is the one line the user must read before saving, so it is never `Color.success` — or "couldn't read that" `Color.dangerInk`; "date-ish" / "time-ish" toggles) and **WHERE** (`Font.dt.body`, placeholder "where" `Color.inkFaint`). Mystery checks: both fields are required and SAVE reads "NEEDS A DATE + PLACE" when either is emptied (§7.6 copy).
3. **CO-AUTHORS** label + chips in a `FlowLayout` (the §4.7 mention-chip idiom): accepted → `Color.paper` fill, `.dtInk` name; pending → 1pt **dashed** `Color.ruleMid` outline with "pending" `Font.dt.badge` `Color.inkMuted` trailing; declined → absent (the web drops them). Each chip has a trailing "×" 20pt in a 44 target (removes / cancels the tag). "+ TAG SOMEONE" `Font.dt.button` `.dtInk` opens an inline friend search (same rows as §7.12 search, 40 tall). **Bylines**: while a tag is pending the feed byline reads only the author ("kat") — the tagged friend is not announced until they accept — and the tagged friend sees the "you were tagged" strip (§4.1 #7); once accepted, the feed byline reads "kat + devon" (both `.dtInk`, "you" `Color.ink` 600 if either is you, the entry takes the `mine` tint for both) and the detail byline reads "with Devon, Sara". Accepting auto-downs the co-author (`auto_down_on_coauthor_accept`), so the response row updates in the same reload.
4. **Read-only rows — what cannot be edited after posting, and why it says so instead of hiding.** Three 44pt rows in `Font.dt.label` `Color.inkMuted` (`#55554A` on surface), each with its value and a `Font.dt.meta` reason: "TIMER · 4h left — set when you posted" (an expiry is a promise to the people who responded; the web's `EditCheckModal` has no timer control either); "SQUAD · 5 — change it from the squad's ⋯" with a trailing "OPEN SQUAD →" `.dtInk` when a squad exists (the size lives on `squads/update-size {checkId, maxSquadSize}` and is edited from the `SquadSettings` stepper, §7.8, where the cap's effect — who gets promoted — is visible; when no squad exists yet the row is a stepper inline, same control, writing `interest_checks.max_squad_size` directly); "MYSTERY · ON — can't be changed after posting" (turning it off after responses would reveal the guests before the day; turning it on would retroactively mask a byline people have already seen; the web has no control for it). Recorded as a product decision in §11; if a backend path for either is added later, the row becomes a control with the same copy.
5. **SHARE CHECK** 52 row `.dtInk` (the check `ShareLink` of §7.16, `markCheckShared` first) and **DELETE CHECK** `Color.dangerInk` → `.confirmationDialog` "delete this check? the squad chat ends too" (`archive_interest_check`; the linked squad is archived with it, PR #511) → the sheet dismisses, the entry collapses per §5.1, slip "check removed — undo?" (6s, `revive_interest_check`, which also revives the squad).
6. CTA **"SAVE"** `Font.dt.buttonLarge` pinned; "SAVING"; dirty guard. Server side a text change fires `check_text_updated`, a date change `check_date_updated` **and** `recalc_squad_expiry_on_check_date_change` — so a linked chat's header countdown retargets on the next open (there is no squads realtime), and responders see the feed highlight (§7.9). Co-author edits are allowed (INVENTORY §1: "Edit for author/co-author"), except DELETE and the co-author list, which are the author's.
- Loading: opening from a push or deep link before the check is in memory shows the zoomed page with the entry's known fields (whatever the feed had) and shimmer rules for DOWN / WAITLIST / COMMENTS; a failed fetch shows the inline "couldn't load — RETRY" colophon (§7.15) in place of those sections, with the DOWN bar disabled.
- Bottom: the DOWN toggle as a **full-width 52 bar**, `Elevation.laid`, `Font.dt.buttonLarge`, same states and the same radial stamp as §4.3 (dye from the finger; the page band dyes from the bar).
- The detail page is `CheckDetailView`, pushed on the Feed tab's `NavigationStack` (`router.feedPath`, `ARCHITECTURE.md` §7) — never a sheet. Opening a deleted check (from a notification) pushes `DeletedCheckView` on the same stack (§4.13): quip via `WobbleRenderer`, the dismissal word ("press f") as the whole `Font.dt.buttonLarge` button, "REVIVE IT →" `Color.dtInk` for the owner.

### 7.6 Create ("+") — root overlay, not a sheet

`[graft: native26]` Create lives in the root `ZStack` as a full-screen overlay (`Color.surface` + grain, 24 top radius, `Elevation.laid`), presented with `offset(y: screen → 0)` `Spring.page` and dismissed by the "×" (the rotated "+"), a downward drag at scroll-top ≥ 80pt (with 0.6 resistance, released on velocity via `Spring.snap`), or POST. It is *not* a `.sheet`/`fullScreenCover` so that `matchedGeometryEffect` can carry the composed text into the feed on POST. `.interactiveDismissDisabled`-equivalent: when text is non-empty the drag asks "discard?" via `.confirmationDialog`.

- Two typeset tabs like a masthead index: "IDEA" / "PASTE LINK" `Font.dt.label`, active `Color.ink` with a 2pt `Color.dt` underline sliding `Spring.page`, inactive `Color.inkMuted`, `.selection`.
- **Idea**: the text field is the page. Placeholder "who's down for…" `Font.dt.display` `Color.inkFaint`; typed text `Font.dt.display` `Color.ink`; autogrow to 8 lines. @mention autocomplete: `Color.deep` list under the caret line, rows 40, `Spring.page`; accepted mentions become inline mention chips (§4.7: `Color.paper` fill, `.dtInk` text) and co-authors.
- Below, a **specimen row of setting chips** in a `FlowLayout`, each a pill 32 tall `Color.paper` 1pt `Color.rule` `Font.dt.label`: "WHEN · tmr 7pm", "WHERE · —", "TIMER · 24H", "SQUAD · ∞", "MYSTERY · OFF". Tap → inline expander under the row (`Spring.page` height): timer = segmented 1H/4H/12H/24H/∞ (sliding highlight `Spring.snap`, `.selection`); squad size = 3/4/5/6/8/∞ with the number in `Font.dt.numeral` at 28 `.numericText`; when = natural-language field with parsed preview "→ Fri Oct 3, 7:00pm" `Font.dt.meta` **`Color.successInk`** (the overlay is `surface` stock → `#1A6B2B`, 4.79:1) / "couldn't read that" `Color.dangerInk`, plus "date-ish"/"time-ish" toggles; mystery = native `Toggle` tinted `Color.dt` with copy "hidden host. guests revealed on the day. needs a date + place." and a live kaomoji preview of *your* mask (`kaomojiForSeed`).
- Mystery ON: the "?" frame draws around the whole editor (glyphs appear clockwise, 12ms apart) and the preview byline shows the kaomoji. Requirements unmet → POST reads "NEEDS A DATE + PLACE" `Color.inkMuted` on a `Color.inkFaint` outline, disabled (the label explains the disabled state, so it stays readable).
- **Paste link**: baseline-rule URL field with a trailing **`PasteButton(payloadType: URL.self)`** — the system control, restyled with `.labelStyle(.titleOnly)` + `.buttonBorderShape(.capsule)` + `.tint(Color.dt)` so it reads "PASTE" in the app's own pill (`Font.dt.button` is not applicable to a system button; the tint and shape are). It is used because it is the **only** way to read the pasteboard without the iOS "{app} pasted from {app}" banner or the permission prompt that a programmatic `UIPasteboard.general.string` read triggers on every tap; it also enables itself only when the pasteboard holds a URL, which is the affordance we want. On appear, `UIPasteboard.general.detectPatterns(for: [\.probableWebURL])` (no content read, no banner) decides whether to *pre-focus* the field with the PASTE pill pulsing once (`Spring.ink` scale 1.06 → 1) — the app suggests, the user confirms. Never auto-paste. **Share Extension — decision: not in v1.** The product's origin is "save events from Instagram", and the native equivalent is an iOS Share Extension target from Instagram's share sheet straight into PASTE LINK. The "single iPhone app" constraint is read as *one app target*, so v1 ships without an extension; the entry path is copy-link-in-Instagram → open down to → the pre-focused PASTE pill above (two taps, which the `detectPatterns` nudge makes obvious). **v1.1**: add `DownToShare.appex` (a `ShareExtension` with an `NSExtensionActivationSupportsWebURLWithMaxCount = 1` rule, an App Group for the handoff, and a `downto://paste?url=` open-URL into the Create overlay), with a `.dtSheet`-styled `SLComposeServiceViewController` replacement; the design in §7.6 does not change, the URL just arrives pre-filled. Recorded in §11. While scraping, a 2pt magenta rule shimmers under it and the preview skeleton is `Color.deep` blocks (a 16:9 hero block, a title rule at 70%, two meta rules at 40% / 55%, three pill blocks). Preview = a real `EventEntry` in edit mode (every field tappable: title `Font.dt.title`, date, time, venue, vibe pills, note). Visibility segmented "PUBLIC / FRIENDS". Manual fallback: "MOVIE / EVENT" segmented; movie search results with posters 40×60.
  - **Scrape failure** (`/api/scrape` non-200, timeout > 12s, or an unsupported host): the shimmer stops, the rule turns `Color.danger` for 300ms then back, and the skeleton is replaced by a `Color.deep` band: "couldn't read that link" `Font.dt.headline` + "fill it in yourself?" `Font.dt.bodySmall` `Color.inkMuted` + "MANUAL →" `.dtInk` — which opens the manual fallback with the URL pre-filled in the source field. Instagram-specific failure (private account / login wall) uses the copy "instagram won't show us that one". `.error` haptic once. Offline: the field accepts the URL and the CTA reads "NO CONNECTION" `Color.inkMuted` on a `Color.inkFaint` outline until it returns.
  - **Post failure** (idea or link): "POSTING" reverts to "POST →", the editor is untouched, slip "didn't post — try again" with a `Color.danger` rule and a RETRY action; the draft is also persisted locally (`@AppStorage` keyed by user) so a crash or kill does not lose it, and the Create overlay reopens with "draft restored" `Font.dt.meta` `Color.inkMuted` under the tabs.
- **POST →**: full-width `Color.dt` `Font.dt.buttonLarge` pinned with `.safeAreaInset(edge: .bottom)` above the keyboard. Posting: label → "POSTING", disabled. **Success choreography** (≈ 700ms): the editor's text is `matchedGeometryEffect(id: "draft-\(draftId)", in: rootNS)` with the check text of the new `CheckEntry` already inserted at the top of the feed (in `mine` state, opacity 0 except the text); the overlay's chrome fades (200ms) while the text flies and shrinks from `Font.dt.display` into `Font.dt.checkText` at its feed position (`Spring.page`); the entry's band and byline fade in 120ms later; the overlay slides down; the "+" rotates back; `.success`. The feed is scrolled to top first if needed. Reduce Motion: overlay fades, entry inserts with a crossfade.
  **Prototype caveat (§10 checklist).** `matchedGeometryEffect` interpolates *frames*, not font size: the "shrink from `display` to `checkText`" is a frame interpolation of two differently-sized `Text`s, and it only looks like a type-size change if both ends are laid out with the same alignment (`.topLeading`) and the source's frame is the *text bounds*, not the editor. More importantly, the destination row is a `LazyVStack` child inside a `ScrollView` inside a `NavigationStack`: a row that has not been laid out has no geometry, so the match has nothing to fly to and SwiftUI silently crossfades instead. The sequence is therefore ordered, not simultaneous: (1) insert the new entry into the feed model and scroll to top (`scrollPosition(id:anchor:)`, non-animated if the feed is not visible under the overlay); (2) wait one render (`Task { await Task.yield() }` or an `onGeometryChange` callback on the destination `Text` reporting a non-zero size); (3) *then* flip the `@State` that moves the matched id from the overlay to the row and start fading the overlay chrome. If the destination has not reported geometry within 120ms (e.g. the Feed tab is not the active tab), skip the flight and use the Reduce Motion path. The prototype must verify the flight on a 30-entry feed with the Feed tab active and inactive.

### 7.7 Squad list

- Masthead "squads". Sections `Font.dt.label`: "NEW MESSAGES", "UPCOMING", "FADING ✶" (the ✶ in `Color.warn`).
- Rows 72, 1pt `Color.rule` between: leading unread dot (8, `Color.unreadSquad`) or 8pt of nothing; `AvatarStack` `small` (max 3 + N); name `Font.dt.headline` `Color.ink` (unread: 700); preview `Font.dt.bodySmall` `Color.inkMuted` 1 line ("sara: where are we meeting"); trailing column: time `Font.dt.meta` **`Color.inkMuted`** (the last-message time is information), countdown `Font.dt.meta` tabular `.numericText(countsDown: true)` **`Color.inkMuted`** / `Color.dangerInk` (< 24h) / "ENDED" / "PAST" **`Color.inkMuted`** — state words are never `inkFaint`. **Fading rows (FADING ✶ section) are not dimmed by opacity** — `inkMuted` at 0.85 would be 3.88:1. Decay is carried by the section, a 3pt `Color.warn` left rule, and decorative layers only: the avatar stack at `.opacity(0.7)` (decorative — the name carries the row), the preview line → `Color.inkExpired` (5.07 on paper; it is secondary and still AA), while name, time and countdown keep their full tokens. **Ended rows** (archived, still within the 7d window): same treatment plus the name in 500 instead of 700, no unread dot, and the trailing word ENDED/PAST; tapping opens the read-only chat with the REVIVE strip (§4.10). Waitlisted badge §4.7.
- Row press: `Color.dtFaint` background, scale 0.99, 40ms delay, release `Spring.ink`; push to chat.
- Swipe actions (native): trailing "leave" (`Color.danger`, confirm) only. **No "mute"** — there is no backing field in the data model (INVENTORY §2) and a client-only mute would silently diverge from push; if muting is wanted it is a `squad_members.muted_at` column first, then a swipe action. Recorded in §11.
- No squad realtime: pull-to-refresh (§4.14) + "updated 2m ago" `Font.dt.meta` `Color.inkMuted` under the last section. Empty per §4.13. Cold start and offline per §7.15 (three skeleton rows: dot-less, avatar circles + two rules).

### 7.8 Squad chat

Per §4.10 plus:

- `SquadSettings` sheet `[.fraction(0.72), .large]` (`paperStock = .surface`): member `medium` avatars row, "SEE MEMBERS →", squad-size stepper (`−` `N` `+` in `Font.dt.numeral` at 28, ∞ at the end, `.numericText`, `.selection` per step), "EDIT EVENT" (→ §7.16), **the DATE row** — one of: "PROPOSE A DATE" `.dtInk` when `date_status` is null (→ the `DateProposal` sheet, §4.10); "DATE · fri oct 3 · 8pm" `Color.ink` + "proposed · 2 of 5 in" / "locked ✓" `Font.dt.meta` `Color.inkMuted` with trailing "CHANGE" `.dtInk` and "CLEAR" `Color.dangerInk` text actions (44 targets each; CLEAR confirms) — hidden pre-reveal on mystery squads; "EXTEND CHAT +7 DAYS" (`.dtInk` → `#A000A2` on surface, 5.05:1; on tap the header countdown rolls up 7d with `.numericText` and `.success`; disabled `Color.inkMuted` with "no expiry" when the squad is open-ended, and with "chat ended — revive it from the chat" when archived), "LEAVE SQUAD" (`Color.dangerInk` → `#A82E2E` on surface), each a 52 row with hairlines. Leave/kick confirms use native `.confirmationDialog` (not restyled). In an ended squad (§4.10) the stepper, DATE and EDIT EVENT rows are disabled with their values still readable.
- `SquadMembers` sheet: 56 rows, avatar `medium`, name `Font.dt.headline`, @username `Font.dt.meta` `Color.inkMuted`, role badge (MEMBER none / WAITLIST §4.7 / "CREATED IT" `Font.dt.badge` `Color.inkMuted`); owner actions in a context menu (move to/from waitlist, remove); "ADD FROM PEOPLE DOWN" section listing downers not yet in the squad with "ADD" `.dtInk`; "REQUESTS (2)" section (event squads) with ACCEPT `.dtInk` / DECLINE `Color.inkMuted`. Pre-reveal: kaomoji rows + `Font.dt.system` `Color.inkMuted` "members revealed on the day", all actions disabled and the context menus absent (not greyed — absent).
- Image viewer: full-screen `Color.ink`, `.navigationTransition(.zoom)` from the image, `MagnifyGesture` pinch + pan, close on drag-down > 80pt or the zoom's own dismiss.
- **Foreground push suppression and cleanup.** `willPresent` returns `[]` when `userInfo["relatedId"] == openSquadId` (the payload is `{type, relatedId}` — INVENTORY §5; the server sets **no** `thread-id` today, so nothing may key off `threadIdentifier`). Opening a squad runs `UNUserNotificationCenter.current().deliveredNotifications()` and removes every delivered notification whose `request.content.userInfo["relatedId"] as? String == squadId` via `removeDeliveredNotifications(withIdentifiers:)`, then writes the read cursor. Opening a check detail does the same for `relatedId == checkId`. **Backend follow-up (§10):** send `thread-id: "squad:{id}"` / `"check:{id}"` so iOS groups the banners and the cleanup can use `threadIdentifier` as well — the `relatedId` filter stays as the fallback either way.
- **Badge.** APNs sends `badge: 1` on every push (never a count), so the badge means "something happened", not "N unread". `UNUserNotificationCenter.current().setBadgeCount(0)` runs (a) on every `scenePhase == .active`, (b) when the Notifications sheet opens, and (c) when a squad chat opens — the three moments the user has plausibly seen what the badge pointed at. It is never set to a non-zero value by the client. Backend follow-up (§10): either send the true unread count or drop `badge` from the payload; until then the icon dot is a doorbell, and the in-app dots (§4.7) are the truth.

### 7.9 Notifications

- Sheet `[.fraction(0.72), .large]`, title "notifications" `Font.dt.title`. Opening marks all read except friend requests (web rule); no MARK ALL READ button. Unread rows carry a `Color.checkNew@0.5` band that fades out over 600ms *after* the sheet finishes presenting — the fade is the marking.
- Pending friend requests pinned first in a `Color.checkNew` band with ACCEPT/DECLINE.
- Rows 64: leading 32 circle tinted per type (table below); title `Font.dt.bodySmall` `Color.ink` (unread 700 with a 6pt `Color.dt` dot leading), body `Font.dt.meta` `Color.inkMuted` (`#55554A` on the sheet) 2 lines, time `Font.dt.meta` **`Color.inkMuted`**. Glyphs are single characters set in Plex Mono — no SF Symbols in rows. The glyph circles are **decorative** (`accessibilityHidden`; the title carries the type), so the glyph-on-circle contrast target is the 3:1 graphics floor, which every pair below clears on the `surface` sheet. SF Symbols exist only for the bell, back chevron, ⋯, the ✓ inside the DOWN pill and the "↑"/"↓" circles.

  **Complete glyph / tint map (all 23 types):**

  | Types | Circle fill | Glyph | Glyph colour |
  |---|---|---|---|
  | friend_check, check_text_updated, check_date_updated | `Color.dtLight` | ✶ | `Color.dtInkOnSurface` |
  | check_response, event_down | `Color.dtLight` | ✓ | `Color.dtInkOnSurface` |
  | check_tag | `Color.dtLight` | + | `Color.dtInkOnSurface` |
  | check_comment, event_comment | `Color.dtLight` | ¶ | `Color.dtInkOnSurface` |
  | comment_mention, squad_mention | `Color.dtLight` | @ | `Color.dtInkOnSurface` |
  | squad_message | `Color.dtLight` | ✶ | `Color.dtInkOnSurface` |
  | squad_invite, squad_join_request | `Color.squad@0.2` | → | `Color.squadInk` (surface variant `#6A34B8`) |
  | poll_created | `Color.dtLight` | ▲ | `Color.dtInkOnSurface` |
  | date_confirm, squad_date_nudge | `Color.warn@0.2` | ? | `Color.warnInk` (`#8F5210`) |
  | friend_event, event_date_updated | `Color.pool@0.2` | ↗ | `Color.poolInk` (surface variant `#00607A`) |
  | event_reminder | `Color.pool@0.2` | ◷ | `Color.poolInk` |
  | friend_request | `Color.dtLight` | ☺ | `Color.dtInkOnSurface` — pinned band, ACCEPT / DECLINE |
  | friend_accepted | `Color.dtLight` | ✓ | `Color.dtInkOnSurface` |
  | check_archived | `Color.danger@0.2` | ⌫ | `Color.dangerInk` (`#A82E2E`) |
  | check_revived | `Color.newLime` | ✶ | `Color.newInk` |

  Unknown/future types fall back to `Color.ruleLight` + "·" `Color.ink` rather than crashing the row.
- Tap → dismiss sheet, then route; check rows call `get_check_state` first → `DeletedCheckScreen` if gone. friend_request → §7.12 FriendsModal "ADD" tab; friend_accepted → "FRIENDS" tab; event_reminder / event_* → Feed scrolled to the event entry with the highlight flash; check_revived → Feed highlight (it is active again); squad_date_nudge → the squad chat with the date-confirm composer affordance flashed once.
- Loading / empty / error per §7.15; the sheet's stagger waits for data.

### 7.10 Profile ("You")

- Top: avatar `display` 72 (`Color.dt`), name `Font.dt.display`, "@username" `Font.dt.body` `Color.inkMuted`, "EDIT" `Font.dt.label` `Color.dtInk`.
- **Availability** `[graft: tactile]`: a physical 3-segment slider, 48 tall, `Color.surface` track (pill), segments "open ✨ / awkward 👀 / not available 🌙" `Font.dt.label` — the one place emoji survive, because they are the user's status glyphs. The highlight is a `Color.dt` pill with `Color.onDt` text that slides to the chosen segment with `Spring.stamp`, **overshooting by 4pt** into the direction of travel and settling; `.selection` fires at the apex. Reduce Motion: crossfade. **Unselected segments**: the words set in `.inkMuted`, which on the `Color.surface` track resolves to **`#55554A` (5.47:1)** — the only small-text tokens that pass on surface are `Color.ink` and that variant, and ink would make the unselected options shout. The emoji carry no contrast requirement (they are pictographs, exempt under 1.4.3 as incidental graphics that repeat the word) — the *words* are what must pass, so a segment is never emoji-only, even at accessibility sizes where the track wraps to three stacked rows.
- Then a **colophon list**: `Font.dt.label` sections ("PEOPLE", "SETTINGS", "ARCHIVE", "ACCOUNT") with 52 rows and hairlines: Friends (count trailing `Font.dt.meta` → §7.12), Instagram, Haptics (native `Toggle` tinted `Color.dt`), Notifications (see push states below), Sync to calendar (→ §7.16), Archived checks (rows with "RESTORE" `Color.dtInk`), Blocked (rows with "UNBLOCK"), Reset onboarding (`is_test` only, `Color.warnInk`), About (version `Font.dt.meta` `Color.inkMuted`; long-press 0.6s copies the build id, row flashes `Color.checkDown`), Log out (`Color.ink`), Delete account (`Color.dangerInk`; sheet requiring the username typed on a baseline-rule field; CTA `Color.danger` enabled only on exact match, animating from `Color.inkFaint` outline with `Spring.settle`).
  - **Theme row: hidden in v1.** Dragonfruit (Instrument Serif + Space Mono, token set 2) is out of scope for this document, so the row does not ship half-built; the web's `profiles`-independent local preference is simply not read. When dragonfruit is specified (its own token table, font bundle and the `.smooth(duration: 0.5)` palette crossfade), the row returns under SETTINGS as "EDITION · guava" with a segmented picker. The v1.1 "night edition" toggle (§1.1) will live in the same row.
  - **Notifications row — three states**, read from `UNUserNotificationCenter.notificationSettings()` on appear and on `scenePhase == .active`: `.authorized` → native `Toggle` bound to the app's own "send me pushes" preference (unregisters the token via `DELETE push/subscribe` when off); `.notDetermined` → the row reads "ENABLE" `.dtInk` and requests permission in place; **`.denied`** → the toggle is replaced by "off in settings" `Font.dt.meta` `Color.inkMuted` + "OPEN SETTINGS →" `.dtInk` (`UIApplication.openNotificationSettingsURLString`), with a one-line `Font.dt.meta` explanation under the row: "you'll miss 'X is down' — turn it on in Settings". Never a dead toggle.
- Edit-profile sheet: same fields as setup; username change shows the 14-day cooldown copy ("you can change this again on oct 7") and a confirm dialog.
- `UserProfileOverlay` (someone else): sheet `[.height(360)]` (`paperStock = .surface`): avatar `display`, name `Font.dt.display`, "@username" `Font.dt.body` `Color.inkMuted` (`#55554A`, 5.47), IG handle `.dtInk` (→ `#A000A2`, 5.05) as a link to the profile in Safari, availability chip (read-only), primary action row (ADD / ACCEPT / REMOVE / CANCEL REQUEST as a `Color.dt` pill or `Color.ink` outline; "REQUESTED" text state `Color.inkMuted`; "via {friend}" `Font.dt.meta` `Color.inkMuted` under the name for FoF), "block · report" `Font.dt.meta` **`Color.inkMuted`** at the bottom (these are actions; each word is its own 44-tall target) → block `.confirmationDialog` ("block {name}? removes the friendship and hides everything from each other") / §7.14 `ReportSheet` with `target: .profile(id)`.

### 7.11 Event lobby — `EventLobby`

The whole event-side squad path lives here. Sheet `[.fraction(0.72), .large]` (`paperStock = .surface`), opened from the response row of an `EventEntry` (the avatar stack fans as the sheet rises, §4.4) or from the secondary JOIN SQUAD → / WAITLIST → pill (§4.3), which opens it with the relevant squad card scrolled into view and flashed `Color.dtSubtle` 600ms.

**Anatomy top → bottom** (24 gutter, blocks stagger in per §4.9):

1. Header: "who's down?" `Font.dt.title` `Color.ink`; under it the event title `Font.dt.meta` `Color.inkMuted` truncated, and "N down" tabular `.numericText`.
2. **YOUR SQUAD** (only if you are in a linked squad): a `Color.deep` card radius 12 (`paperStock = .deep`), 64 tall: `AvatarStack` `small` (ring `deep`) → squad name / "N members" `Font.dt.bodySmall` `Color.ink` / `Font.dt.meta` `Color.inkMuted` → "GO TO SQUAD →" `Font.dt.button` `.dtInk`. Whole card is a button → chat (dismisses the sheet first, then pushes).
3. **SQUADS** label (only when ≥ 1 linked squad you are not in; from `get_event_squad_members`): one `Color.deep` card per squad, 72 tall: facepile `small` (max 4 + N) → "kat's squad" (creator's name) `Font.dt.bodySmall` `Color.ink` + "3 of 5 · leaves 9pm" `Font.dt.meta` `Color.inkMuted` → trailing CTA per state:
   - room: "REQUEST TO JOIN" `Font.dt.button` `.squadInk` (surface variant `#6A34B8`, 5.45) in a 1pt `Color.squad` outline pill 36 tall → inserts a `squad_join_requests` row; the pill drains to text "REQUESTED" `Color.inkMuted` with a `.impact(weight: .light)`; tapping REQUESTED again offers "CANCEL REQUEST" via `.confirmationDialog`.
   - full: "WAITLIST →" `Color.inkMuted` outline (→ `join_squad_if_room` → `waitlisted`; the waitlist landing haptic `.warning` plays without the pill animation).
   - accepted while the sheet is open (notification arrives): the card's CTA becomes "GO TO SQUAD →" and the card slides up into the YOUR SQUAD slot with `Spring.page`; `.success`.
4. **DOWN — FRIENDS** label, then rows 48: avatar `small` + name `Font.dt.bodySmall` `Color.ink` + "@username" `Font.dt.meta` `Color.inkMuted`; a 2pt `Color.pool` ring on avatars in the crew pool, with "looking" `Font.dt.meta` `Color.poolInk` (surface variant `#00607A`) trailing. Tap a row → `UserProfileOverlay` (§7.10) stacked on top.
5. **ALSO DOWN** label (non-friends), same rows; the trailing slot is "ADD" `.dtInk` (sends a friend request; → "REQUESTED" `Color.inkMuted`). The event's poster is excluded from both lists per `events-flow.md` (they are named in the byline instead).
6. **Sticky bottom bar** (`Elevation.laid`, `Color.surface`, `.safeAreaInset(edge: .bottom)`, 64 tall + safe area):
   - Not in a squad, no selection mode: primary "START A SQUAD" `Font.dt.buttonLarge` full-width pill `Color.dt`/`Color.onDt` (disabled `Color.ruleLight` with "DOWN FIRST" if you are not down — the lobby is readable before you commit). Under it a text toggle: "I'M LOOKING FOR A SQUAD · 3 LOOKING" `Font.dt.button` `.poolInk` (`#00607A`) / "LEAVE SQUAD POOL" `Color.inkMuted`, `.selection`; joining paints a `Color.pool` 2pt ring onto your avatar in the DOWN list with `Spring.stamp`, the count rolls with `.numericText`. The pool is cleared by the DB when you un-down or join a squad (`remove_from_pool_on_squad_join`) — the ring simply disappears with a 150ms fade when that happens.
   - In a squad: the bar shows only "GO TO SQUAD →" `Color.ink` outline.
7. **Select-members mode** ("START A SQUAD" tapped): the bar's pill becomes "CREATE SQUAD (1) →" (`.numericText`; the 1 is you); every DOWN row gains a leading 22pt check circle (`Color.ruleLight` ring → `Color.dt` fill with `Color.onDt` ✓, `Spring.ink`, `.selection`); pool members are pre-selected (they asked); rows re-sort selected-first with `Spring.settle`. "CANCEL" `Font.dt.button` `Color.inkMuted` appears top-right of the header. Cap at the event's default squad size (∞ for events unless the poster set one) with "that's the whole squad" `Font.dt.meta` `Color.inkMuted` when reached. Tapping CREATE: `.impact(weight: .medium)` → server → on success the sheet dismisses and SQUAD FORMED (§5.6) plays on the event entry (you formed it — this *is* the ceremony), with the selected members' avatars in the strip; the members receive `squad_invite`.
8. Empty (nobody else down): the FRIENDS/ALSO DOWN blocks collapse into a colophon (§4.13 style, smaller: "✶" at `Font.dt.display`): "just you so far." + "share it and see who bites" + "SHARE EVENT →" (`ShareLink`, §7.16). The bottom bar keeps the pool toggle — looking for a squad with nobody down is still a valid signal.

Copy stays dry: "who's down?", "just you so far.", "3 looking". Loading: two skeleton rows per block (§7.15). VoiceOver: each squad card is one element "kat's squad, 3 of 5 members, request to join, button"; the pool toggle announces its state.

### 7.12 Friends — `FriendsSheet`

Sheet `[.fraction(0.72), .large]` (`paperStock = .surface`), from the Profile "Friends" row, the push types `friend_request` (opens on ADD) and `friend_accepted` (opens on FRIENDS), and `?add=` / friend-link deep links (opens ADD with the profile overlay stacked). Title "friends" `Font.dt.title`; count "· 12" `Font.dt.meta` `Color.inkMuted`.

**Typeset tabs** under the title, same idiom as the Create index (§7.6): "FRIENDS" / "ADD" `Font.dt.label`, active `Color.ink` + 2pt `Color.dt` underline sliding `Spring.page`, inactive `Color.inkMuted`, `.selection`. The ADD tab carries the pending-request count as a trailing `Color.dt` dot per §4.7 when > 0.

**FRIENDS tab**
- Baseline-rule filter field at the top ("filter" placeholder `Color.inkFaint`, `Font.dt.body`), `.searchable` is *not* used (its chrome is not paper).
- Rows 56: avatar `medium`, name `Font.dt.headline` `Color.ink`, "@username" `Font.dt.meta` `Color.inkMuted`; trailing availability glyph (✨ / 👀 / 🌙 — the status emoji, the one place they survive, §7.10) at 14pt with `accessibilityLabel`. Sorted: available first, then alphabetical. Tap → `UserProfileOverlay` stacked (REMOVE lives there, behind a confirm — never a swipe on this list; losing a friend by accident is not funny).
- Empty: colophon "no friends yet. brutal." + "ADD SOME →" jumps to the ADD tab.

**ADD tab** — four blocks, each with a `Font.dt.label` `Color.inkMuted` running head and a rule, staggered in per §4.9:
1. **Search**: baseline-rule field "name or @username", debounced 350ms, min 2 chars; results as 56 rows with the trailing state pill: "ADD" `.dtInk` (`#A000A2` on surface) in a 1pt `Color.dtInkOnSurface` outline, 32 tall → on tap `Spring.ink` squash, the pill fills `Color.dt` for 300ms then drains to text "REQUESTED" `Color.inkMuted` (`.impact(weight: .light)`); "FRIENDS ✓" `Color.inkMuted` text for existing friends; "ACCEPT" `.dtInk` filled `Color.dt`/`Color.onDt` when they already asked you. No results: "nobody by that name" `Font.dt.system` `Color.inkMuted`; a searching shimmer rule under the field while in flight.
2. **INVITE LINK**: a 52 row, `Color.deep` card radius 12: "invite by link" `Font.dt.bodySmall` `Color.ink` + "one use · 24h" `Font.dt.meta` `Color.inkMuted` → trailing "SHARE →" `.dtInk`. Tap → `create_friend_link` → a `ShareLink` (§7.16) with the message "add me on down to" and the `/friend?token=` URL; while the RPC runs the row shows "MAKING LINK…" `Color.inkMuted`. `.impact(flexibility: .rigid)` when the share sheet opens.
3. **REQUESTS (N)** — incoming, pinned first when N > 0 in a `Color.checkNew` band: rows 56 with "ACCEPT" (`Color.dt` pill, `.success` on ack) / "DECLINE" `Color.inkMuted` text. Accepting inserts them into FRIENDS with a `Spring.stamp` avatar pop if that tab is visible next. Then **SENT**: outgoing pending rows with "REQUESTED" `Color.inkMuted` (tap → "CANCEL REQUEST" `.confirmationDialog`).
4. **PEOPLE YOU MAY KNOW** (`get_friends_of_friends`): rows 56 with the FoF annotation under the name — "via Sara" / "via Sara + 2" `Font.dt.meta` `Color.inkMuted` (this is *why* they are suggested, so it is readable, not `inkDim`) — and the same ADD pill. Max 10, "MORE" `Font.dt.button` `Color.inkMuted` reveals the rest.

Realtime: the `friendships:{userId}` channel updates row states in place (`Spring.settle` crossfade of the pill); a request accepted while you watch pops the avatar. The `FriendRequestBanner` on the feed (§7.4) deep-links to REQUESTS. VoiceOver: row "Sara, @sara, add friend, button"; pill states as values.

### 7.13 Poll creator — `PollComposer`

Sheet `[.large]` (`paperStock = .surface`) from the composer's poll glyph; unavailable pre-reveal (§4.10). Title "new poll" `Font.dt.title`; trailing "CANCEL" `Font.dt.label` `.dtInk`. Dirty guard per §4.9.

**Kind selector**: a specimen row of three chips (the §7.6 chip idiom, 32 tall): "TEXT" / "DATES" / "WHEN'S GOOD", active `Color.dt`/`Color.onDt`, `Spring.ink`, `.selection`; switching crossfades the body (`Spring.page`, 40ms stagger) and keeps the question.

**Question** — the page's text: `Font.dt.display` `Color.ink`, placeholder "what are we deciding?" `Color.inkFaint`, autogrow 3 lines, 120-char counter `Font.dt.meta` at 100.

**TEXT** (2–10 options, optional multi-select):
- Options as baseline-rule fields 48 tall, numbered "1." `Font.dt.meta` `Color.inkMuted` in the gutter, placeholder "option" `Color.inkFaint`; a new empty field appears under the last filled one (`Spring.page`) up to 10; swipe-to-delete on a filled field (native); an empty trailing field is ignored on POST. Reorder by drag handle "≡" `Color.inkFaint` (`.onMove`).
- Under the list: a native `Toggle` tinted `Color.dt` "pick more than one" `Font.dt.bodySmall`.
- POST enabled at ≥ 2 non-empty options with distinct text.

**DATES** (parsed from natural language — `parseWhen` / `parseNaturalDate` port):
- One baseline-rule field "thurs or fri, next weekend…" `Font.dt.body`. As the user types, the parser's output renders live beneath as **date chips** (the §7.6 chip idiom): "THU 25 SEP", "FRI 26 SEP", each with a trailing "×" 20pt in a 44 target; unparseable input shows "couldn't read that — try 'sat or sun'" `Font.dt.meta` `Color.dangerInk`. Chips appear `Spring.stamp` scale 0.4 → 1 as they parse (the text *becomes* dates). Optional time per chip: tap a chip → an inline "7pm?" field.
- Under the chips: "or add a date" → native `DatePicker` in `.graphical` style tinted `Color.dt` inside a `Color.paper` block (the one system control that is allowed to look like the system, because a hand-drawn calendar is worse).
- POST enabled at ≥ 2 dates. The created poll is `poll_type: "dates"`; its closed card offers PROPOSE THIS (§4.10).

**WHEN'S GOOD** (availability grid, `poll_type: "when"`, `collection_style: "availability"`):
- Three specimen rows of chips: **RANGE** "THIS WEEKEND" / "NEXT 7 DAYS" / "NEXT 14 DAYS" / "CUSTOM" (custom expands two `DatePicker`s in `.compact` style); **WINDOW** "EVENINGS" (18–23) / "AFTERNOONS" (12–18) / "ALL DAY" (9–23); **SLOTS** "30 MIN" / "60 MIN". Defaults: next 7 days, evenings, 60 min.
- A live **preview grid** underneath (the §4.10 grid at 0.7 scale, non-interactive, `Color.surface` cells) that reflows with `Spring.settle` as chips change, with "N slots · 5 days" `Font.dt.meta` `Color.inkMuted` under it. It answers "what am I about to send" without a second screen.
- POST enabled always (defaults are valid).

**POST →**: full-width `Color.dt` pill pinned above the keyboard (`.safeAreaInset(edge: .bottom)`); "POSTING" while in flight; failure → slip "poll didn't post — try again" (`Color.danger` rule), sheet stays. Success: the sheet dismisses, the transcript scrolls to the new poll card which arrives with a `Color.dtSubtle` flash (600ms), `.success`, and the active-poll chip slides in (`Spring.page`).

### 7.14 Report and block — `ReportSheet`

Sheet `[.height(520)]` → `[.large]` when the details field is focused (`paperStock = .surface`). Reachable from: the check "⋯" / context menu (target `.check`), `UserProfileOverlay` "report" (`.profile`), the long-press menu on chat messages (`.squadMessage`), event comments (`.eventComment`) and check comments (`.checkComment`) — every UGC type the schema knows (INVENTORY §1 "Block / report"). The web wired only check and profile; native wires all five. App Store 1.2 is satisfied by: every piece of UGC reportable in ≤ 2 taps, blocking available from every author surface, and the report acknowledged.

- Header: "report" `Font.dt.title`; under it a one-line quote of what is being reported — the check text / message / "@username" — `Font.dt.bodySmall` `Color.inkMuted`, 2 lines, in a `Color.deep` block radius 12 (so the user knows what they are pointing at).
- **Reasons**: six 52 rows with hairlines, `Font.dt.body` `Color.ink`, radio circle 22 trailing (`Color.ruleMid` ring → `Color.dt` fill + `Color.onDt` "·", `Spring.ink`, `.selection`): "harassment", "spam", "impersonation", "inappropriate", "threats", "other" — lowercase, no explanations, the words are enough.
- **Details** (optional, required for "other"): baseline-rule multi-line field "anything else?" `Font.dt.body`, 500-char counter at 450.
- **Also block** (not for `.check`/`.event` targets where the author is you-know-who): a native `Toggle` tinted `Color.dt` "block {name} too" `Font.dt.bodySmall`, default off. On profiles the toggle is on by default.
- CTA "SEND REPORT" `Font.dt.buttonLarge` full-width `Color.ink`/`Color.paper` (not magenta — reporting is not the action we celebrate), enabled once a reason is chosen; "SENDING"; failure → slip with RETRY, sheet stays.
- Success: the sheet dismisses, a slip "reported. we'll take a look." (4s, `Color.success` rule) — and the reported content is **hidden locally right away**: a check collapses per §5.1 (like Hide), a message group is replaced by a `Font.dt.system` `Color.inkMuted` line "message reported" (tap to show), a comment likewise. If block was on: `.warning` → `.impact(weight: .heavy)`, the friendship is removed, their content disappears app-wide on the next load.
- Reports are append-only (`reported_content`); the sheet never shows a report history.

### 7.15 Loading, error and offline states — "the press"

The broadsheet metaphor gives the app one vocabulary for waiting: **the press is running** (shimmer rules), **the press is stopped** (a colophon), and **the press is not running** (offline). No spinners anywhere; no `ProgressView` except inside native system sheets.

**Shimmer-rule skeleton** (`Skeleton`): blocks of `Color.surface` (on paper) or `Color.deep` (on surface) with radius 4 for text rules and the real component's radius for images/avatars; a 60pt `clear → white@0.35 → clear` gradient sweeps left-to-right across *all* blocks in phase every 1.6s (`easeInOut`, `.blendMode(.plusLighter)` — the same shimmer as the expiry rule, §4.2). Rules are 12 tall at `Font.dt.bodySmall` height and 18 at `checkText`, widths 60/35/80% in rotation so the page looks typeset, not striped. Reduce Motion: static blocks. `accessibilityLabel("loading")` on the container, children hidden.

| Surface | Skeleton | Stagger |
|---|---|---|
| Feed cold start | masthead is real immediately; then a "TIMED ✶" label rule and **four skeleton entries** (byline circle 24 + rule 30%, two check-text rules 90/60%, one meta rule 45%, a pill block 88×36 right) separated by hairlines | when data lands, skeletons crossfade out (200ms) and the real entries run the §5.1 first-load stagger — the stagger is the *transition*, so it never runs on nothing |
| Squads cold start | three 72pt skeleton rows (avatar stack circles + rule 50% + rule 70%) | same |
| Notifications sheet | four 64pt rows (circle 32 + rule 60% + rule 40%) | sheet block stagger waits |
| Check detail via push/deep link | known fields real; DOWN / WAITLIST / COMMENTS as rules | §7.5 |
| Chat history | three skeleton groups; pagination rule at top | §4.10 |
| Lobby / Friends / Members sheets | two skeleton rows per block | §7.11, §7.12 |
| Paste-link preview | the event skeleton | §7.6 |
| Images (chat, hero, poster) | block at the stored aspect with shimmer; hero uses `Color.surface` under the wash | — |

Minimum skeleton display is 0 — if data is cached, skeletons never appear; there is no artificial delay. Maximum: after 8s without data the skeleton stays but a `Font.dt.meta` `Color.inkMuted` line "still printing…" appears under it; after 20s it becomes the error colophon with RETRY.

**Cache-first**: the last feed, squads list and notifications are persisted by the `LocalCache` actor (`ARCHITECTURE.md` §4.6 — JSON snapshots keyed by user; SwiftData is explicitly rejected there); cold start renders the cache instantly with the masthead running head reading "updated 14m ago" `Color.inkMuted` until the refresh lands (then the running head returns and new items insert per §5.1). Skeletons are therefore mostly a first-launch experience.

**Error colophon** (inline, replaces the failed block, not a modal): "✶" `Font.dt.display` `Color.inkMuted` (not magenta — nothing to celebrate), headline `Font.dt.headline` `Color.ink` from a pool — "the press jammed.", "couldn't load that.", "something's off on our end." — one line `Font.dt.bodySmall` `Color.inkMuted` with the honest cause where known ("no connection", "server said no (500)", "that squad is gone"), and "RETRY" `Font.dt.button` `.dtInk`. Retry shows the shimmer in place. `.error` haptic once per failure, not per retry. `os.Logger` gets the error in M1 (Sentry is M2, `ARCHITECTURE.md` §2); the user gets the colophon.

**Slip errors** (§4.8, `Color.danger` rule) are for *actions* that failed while the surface is intact: post, send, vote, down (rollback), report, share-link creation, save. Each names the action and offers RETRY where idempotent.

**Offline — "press not running".** Reachability via `NWPathMonitor` (`.unsatisfied` / `.requiresConnection`), debounced 1.5s so a cell hand-off does not flicker:
- A 28pt `Color.ink` band slides in under the masthead (`Spring.page`) with "✶ press not running — you're offline ✶" `Font.dt.label` `Color.paper`, 12pt vertical rhythm. It is the only inverted band in the app, so it cannot be mistaken for content. It hides with `Spring.page` 800ms after reconnection, replaced for 2s by "back on" `Color.success` rule slip.
- Cached content stays fully readable and scrollable; the DOWN toggle, "+", composer send, polls and every server action are **disabled** (`Color.inkFaint` outline states with their labels intact — DOWN ?, POST →), never hidden; tapping one nudges the band (offset y 0 → 4 → 0, `Spring.snap`) and `.impact(weight: .light)`, no toast. Composed chat text and Create drafts are kept.
- Pull-to-refresh while offline: the rule draws, the label reads "OFFLINE" instead of RELEASE, no shimmer, release settles with no haptic.
- Airplane mode at cold start with no cache: the feed shows the error colophon with "no connection" and the band; RETRY re-checks the path.
- Realtime: `RealtimeChannel` disconnects are not surfaced as offline. While a channel is `.reconnecting`/`.closed` and the path is satisfied, the masthead running head appends "· reconnecting" `Color.inkMuted` (feed) or the chat header countdown line shows "reconnecting…" for at most 10s; on `.subscribed` the affected list silently reloads (checks: full reload as the web does; chat: fetch messages since the last id) and any missed inserts arrive per §5.1 (held behind "N new ↑" if scrolled). Foreground after > 30s in background: silent full reload (INVENTORY §6), no skeleton.
- Session expiry per §7.1.

### 7.16 Edit event, calendar export, share flows

**EditEvent sheet** `[.large]` (`paperStock = .surface`), from the poster's context menu / detail "EDIT", and from `SquadSettings` "EDIT EVENT" (there, per the web: only the check author may edit the title of a check-backed squad; others see the title row read-only in `Color.inkMuted`). Blocks, baseline-rule fields 32 apart in the §7.2 idiom, staggered in:
1. Title `Font.dt.title`; date + time (natural-language field with the parsed preview `Color.successInk` / `Color.dangerInk`, "date-ish"/"time-ish" toggles); where; vibes (the pill `FlowLayout` in edit mode — tap toggles, "+ VIBE" adds a free-text one, max 6); note `Font.dt.body` autogrow 4 lines, 280 counter.
2. **LINKED SQUADS** label (new UI; only when ≥ 1 squad links to the event): rows 56 with facepile `small`, "kat's squad · 3 of 5" `Font.dt.bodySmall`, and a trailing **join-request count** pill when > 0: `Font.dt.badge` "2 WANT IN" `Color.onDt` on `Color.dt` → tapping opens that squad's `SquadMembers` sheet at REQUESTS (stacked). This is where the poster clears requests for squads they don't sit in.
3. "SHARE EVENT" 52 row `.dtInk` (the `ShareLink` below) and, for the poster, "DELETE EVENT" `Color.dangerInk` → `.confirmationDialog` → collapse + undo slip.
4. CTA "SAVE" `Font.dt.buttonLarge` pinned; "SAVING"; dirty guard. Date changes fire `event_date_updated` for downers (they see the feed highlight, §7.9).

**What SAVE does to the date depends on where the sheet was opened from** — this is the distinction the web leaves implicit:
- **From the feed / detail (the poster editing their event)**: SAVE edits `events.date` / `time_display`. Nothing is proposed to anyone; linked squads' expiry recalculates server-side and their members get `event_date_updated`. No CLEAR DATE row (an event without a date is a manual-fallback event; the field can simply be emptied).
- **From `SquadSettings → EDIT EVENT` (any member, in a squad)**: the date row is the squad's date, and **saving a changed date proposes it** — `squads/set-date {squadId, date, time, locked: false}` — with the consequences of §4.10 (system line, sticky bars, auto-lock). The sheet says so *under the field*, in `Font.dt.meta` `Color.inkMuted`: "saving proposes this date — everyone gets asked 'still down?'", and the same "ASK EVERYONE / LOCK IT" chip pair from the `DateProposal` sheet sits under the field (default ASK EVERYONE). If a date is already proposed/locked, the field shows it with "proposed · 2 of 5 in" / "locked ✓" in the meta line, and changing it triggers the re-propose `.confirmationDialog` (§4.10). A **"CLEAR DATE"** row (`Color.dangerInk`, 52, hairlines; `.confirmationDialog` "clear the date? everyone's answers go too") appears under the field when `date_status` is set → `set-date {clear: true}` and the sheet stays open with the field emptied. Title/where/vibes/note in this mode edit the event or check as the web does (title only by the check author for check-backed squads), and SAVE with an unchanged date proposes nothing.
- `EditCheck` (§7.5) never proposes: a check's date is the check's; the squad's expiry follows it via the trigger, and a *squad* date is proposed from the squad.

**Sync to calendar sheet** `[.fraction(0.72), .large]`: title "calendar" `Font.dt.title`; typeset tabs "SUBSCRIBE" / "EXPORT".
- SUBSCRIBE (default): "everything you're down for, live" `Font.dt.bodySmall` `Color.inkMuted`; the webcal URL in a `Color.deep` block radius 12 `Font.dt.meta` `Color.ink` (selectable, 3 lines) with "COPY" `.dtInk` → "COPIED ✓" for 1.5s (`.impact(flexibility: .rigid)`); a primary "ADD TO CALENDAR →" `Color.dt` pill that opens the `webcal://` URL (iOS hands it to Calendar's subscription flow); a `Font.dt.meta` `Color.inkMuted` note "google calendar: paste the link under 'from URL'".
- EXPORT: "pick what to put on your calendar" `Color.inkMuted`; then a list of exportable items (saved events, down checks, authored dated checks — the same set as the webcal feed) as 56 rows with a leading 22pt check circle (§7.11 idiom), title `Font.dt.bodySmall`, "fri 3 oct · 8pm · blue note" `Font.dt.meta` `Color.inkMuted`; "SELECT ALL" / "NONE" `Font.dt.label` `.dtInk` in the block's running head. Bottom bar (`Elevation.laid`): "GOOGLE CALENDAR →" `Color.ink` outline (opens the `calendar.google.com/render?action=TEMPLATE…` URL for a single item, or for several the .ics path with a hint) and "SHARE .ICS (3) →" `Color.dt` pill (`.numericText`) → a `ShareLink(item: icsFile, preview: SharePreview("down to · 3 events", image: Image("app-mark")))` where `icsFile` is a `Transferable` `FileRepresentation` written by the `ics.ts` port; disabled at 0 selected. Empty: colophon "nothing to export yet."

**Share flows — `ShareLink` previews.** Every share is a native `ShareLink` (the share sheet is the one system surface users expect to look like the system). Preview images are rendered with `ImageRenderer` from a 600×315 `SharePreviewCard` SwiftUI view — cream paper, grain, the wordmark, the content in `Font.dt.display` `Color.ink`, a magenta 3pt left rule — so the link looks like the app in Messages.
- **Check** (context menu / detail / EditCheck "SHARE"): the item is `https://downto.xyz/check/{id}`; before presenting, call `markCheckShared` (sets `shared_at`, which the public page requires) — the ShareLink is wrapped in a `Button` that awaits the RPC, then presents via `.sheet` with a `ShareLink`-backed view (or uses `ShareLink` with an `async` `Transferable` whose `exporting` performs the RPC). Preview: `SharePreview("{author} wants to know if you're down", image: card)` where the card shows the check text; mystery checks use the kaomoji byline and *never* the author's name (the web's known leak, fixed here). Message text: "{text} — you down? {url}".
- **Event**: item = the event's source URL (`ig_url` / `dice_url` / `letterboxd_url`), or the app's event URL when there is none; preview title "{title} · {venue}", card shows the hero (if any) under the wash. Message: "{title} · {date} at {venue} — {url}".
- **Friend invite** (§7.12): item = `/friend?token=`; preview "add me on down to", card shows your `display` avatar and name. The RPC creates the link before the sheet presents (24h, one use — the card says so in `Font.dt.meta`).
- Haptic `.impact(flexibility: .rigid)` when the share sheet presents; none on completion (the system's own is enough). `ShareLink` labels are typeset: "SHARE" `Font.dt.button` `.dtInk`, no SF square-and-arrow glyph.

### 7.17 Deep links, invite links, shared-check entry and push routing — `Route`

PRODUCT.md: growth is through invite links; every link the web app emits (INVENTORY §7) must land somewhere specific in the native app, cold or warm, logged in or not. One enum, one replay slot. **Structure is `ARCHITECTURE.md` §7–§7.4** (`Domain/Route.swift`'s `Route` cases, `Router.go/enqueue/drainPending/drainPendingIntents`, `dt.pendingRoute` / `dt.pendingCheckId` / `dt.pendingFriendToken` / `dt.pendingAddUsername`, `FeedStore.resolveCheckRoute`, the `MainShell` sheet-stacking rules); the case names written below (`.feedHighlight`, `.addUser`, …) are descriptive, and this section specifies what the user *sees* on each path.

**Plumbing.** Associated Domains `applinks:downto.xyz` (the web's `/.well-known/apple-app-site-association` lists `/check/*`, `/friend`, and `/?add=*`, `/?pendingCheck=*`, `/?tab=*` — the query-form paths are matched with `?` components; the OG page `check/[id]` keeps rendering on the web for non-users and for the link preview, the app claims the same URL). A custom scheme `downto://` mirrors every path for the v1.1 share extension and for testing. The root `WindowGroup` has `.onOpenURL { Route.parse($0) → router.handle(_) }` and `.onContinueUserActivity(NSUserActivityTypeBrowsingWeb)` for universal links; the push delegate's `didReceive` feeds the same `router.handle(Route.fromPush(userInfo))` (`mapPushToNavigateAction` port, INVENTORY §5 table). `Route` is an enum: `.check(id)`, `.friendToken(token)`, `.addUser(username)`, `.squad(id)`, `.feedHighlight(checkId | eventId)`, `.friends(tab)`, `.notifications`.

**Replay — "one pending route, latest wins".** `router.handle` runs the route immediately when the root is `.feed` (authed, onboarded, first feed load done); otherwise it stores it in `@AppStorage("pendingRoute")` (JSON, with a timestamp) and the root replays it once, when it reaches `.feed`, then clears it; a pending route older than 24h is dropped on launch (a stale push tap should not teleport a user who opened the app a day later). Cold launch from a push or a link therefore always goes: launch screen (§7.18) → cache-rendered feed → the route, never a blank screen with a spinner. Running a route always: dismisses any sheet, pops the active tab's stack to root, switches tab, *then* pushes — in that order, with the tab switch animation of §5.2, so the user sees where they are being taken.

**Routing table.**

| Link / push | Logged in, onboarded | Not logged in / not onboarded |
|---|---|---|
| `/check/{id}` and `/?pendingCheck={id}` | **In the feed** (FoF or friend): switch to FEED, scroll to the entry, highlight flash (§4.1), then the zoom to detail (§5.4) 300ms after the scroll lands. **Not in the feed** (viewer is not FoF — RLS hides it): `get_shared_check(id)` (SECURITY DEFINER, needs `shared_at`) → push the **shared-check detail** — the §7.5 page rendered from the RPC's fields, with a `Color.checkNew` context band under the byline "{author} sent you this" `Font.dt.bodySmall` `Color.ink`, and the bottom bar reading "I'M DOWN" (`Font.dt.buttonLarge`, the §4.3 stamp) → `POST checks/respond-shared {checkId, response: "down"}` (bypasses RLS, sets `referred_by_check_id`). After ack the bar becomes DOWN ✓ and, when the squad forms/joins, "you're in →" per §5.6 with OPEN → pushing the chat (`can_view_check_squad` admits responders). The author is offered under the band as "ADD {author}" `.dtInk` → friend request (`FriendsSheet` not needed). Mystery checks arrive redacted exactly as in the feed (the RPC returns `author_id`; the client redacts — INVENTORY §1's known leak is closed on this surface). Not found / archived / `shared_at` null → `DeletedCheckScreen` (§7.5) with the quip and no REVIVE. **Backend follow-up (§10)**: confirm that a non-FoF responder's check appears in *their* feed afterwards (RLS `is_friend_or_fof` OR has-a-response); if not, the shared-check detail is reachable from the notification and the squad but not the feed, and the OPEN SQUAD → link lives in the squad list — state which in the ledger before ship. | Store `.check(id)` as the pending route **and** `pendingCheckId` for onboarding (INVENTORY §4): the Auth screen shows the context band (§7.1) with the check text from `get_shared_check`; the notifications gate is skipped; after profile setup `respond-shared` fires *before* the friend gate, whose top row pins the author in the `Color.checkNew` band ("they sent you here", §7.3); the route then replays onto the feed with the entry highlighted (it is in the feed now: you responded). `referred_by_check_id` is the server's copy if local storage is lost. |
| `/friend?token={t}` | `redeem_friend_link(p_token)` immediately, no screen: success → slip "you and {creator_name} are friends now" (`Color.success` rule, 4s) with an action "SEE →" that opens `FriendsSheet` FRIENDS with their row popping (`Spring.stamp` avatar, §7.12); if the sheet is already open the row pops in place. Errors map to slips with `Color.danger` rule: `Link already used` → "that invite's been used — ask {creator} for a fresh one"; `Link expired` → "that invite expired (they last 24h) — ask for a new one"; `Already friends` (`already_friends: true`) → "you're already friends. nice." (`Color.success` rule); unknown/network → "couldn't redeem that link — RETRY". No token creator name in the error cases (the RPC does not return it there) — copy uses "them". | `pendingFriendToken` stored; auto-redeemed after onboarding (INVENTORY §4). **Feedback on auto-redeem** (the web is silent): the friend gate pins the link's creator at the top (the RPC does not expose them before redemption, so the gate redeems *first* — on its appear — and pins the resulting friend as "already friends ✓" in the `Color.checkNew` band: "{name} brought you here"); errors use the same slips on the gate. Notifications gate is not skipped for friend links. |
| `/?add={username}` | FEED stays; `FriendsSheet` opens on ADD with `UserProfileOverlay` for that username stacked (§7.12). Unknown username → the overlay's colophon "nobody by that name". | pending route; replays after onboarding onto the same sheet (the friend gate is the same list, so the user has already seen them: the replay is skipped if a friendship with that user now exists). |
| `/?tab=squads&squadId=` / `?checkId=` / `?openFriends=` (sw.js forms) | `.squad(id)` → SQUADS, push the chat (§5.5); `.feedHighlight` as above; `.friends(.friends)`. | pending route |
| push `squad_*`, `poll_created`, `date_confirm`, `squad_date_nudge` | `.squad(relatedId)`: SQUADS → push the chat; the delivered notifications for that squad are removed (§7.8). `squad_date_nudge` additionally flashes the DATE row affordance once (§7.9). If the squad is archived: the chat opens in its ended state (§4.10); if purged: the "that squad is gone" colophon. | pending route (24h) |
| push `friend_check`, `check_response`, `check_tag`, `check_*_updated`, `check_comment`, `comment_mention` | `.feedHighlight(checkId)`: `get_check_state` first → active: FEED scroll + flash; gone: `DeletedCheckScreen`. | pending route |
| push `event_*`, `friend_event` | FEED (`.feed(checkId: nil)` — `mapPushToRoute` carries no event id, INVENTORY §5 "Feed" with no highlight); `refreshEvent` side effect only. The §4.5 `highlighted` event state is specified for M2 event routing and is unreachable in M1. | pending route |
| push `friend_request` / `friend_accepted` | `FriendsSheet` ADD / FRIENDS. | pending route |
| push `check_archived`, `check_revived` | `check_revived` → `.feedHighlight` (via `resolveCheckRoute`, so a re-archived check lands on `DeletedCheckView`); `check_archived` → **no route** (`mapPushToRoute` returns nil, INVENTORY §5 "unmapped"): the app opens where it was and the notification row explains. | pending route |

**Copy rules for links.** Every slip names what happened and who ("you and Sara are friends now"), never a code. The shared-check entry never says "join to respond" — that is the web's job before the app is installed; in the app you are already in.

### 7.18 Launch surface and app icon

- **Launch screen**: Info.plist `UILaunchScreen` with `UIColorName = "paper"` (the Asset Catalog colour, `#FCFFE2` light / `#141410` for the v1.1 night edition — the launch storyboard-less dictionary form picks the trait automatically) and **no image, no navigation bar, no tab bar keys** — the launch frame is blank cream. Without this the cold start flashes white for ~200ms before the first SwiftUI frame, which on this palette reads as a glitch. The first rendered frame is the masthead on paper with the cache-rendered feed (§7.15); the wordmark fades in over 200ms (`Spring.settle`) so cream → cream-with-type is the only transition. Grain is on from the first frame.
- **App icon**: a cream `#FCFFE2` tile carrying a single magenta `#FE44FF` "✶" set in Inter 700, optically centred, occupying ~58% of the tile, with the grain tile multiplied over it at 0.06 (icons are the one place grain is stronger — at 60pt the 0.03 texture vanishes). No wordmark, no text (icons with words fail at 29pt). Variants required by iOS 18+: **dark** — `#141410` tile, same magenta star; **tinted** — the star as a white-on-transparent glyph so the system tint applies; **clear** (iOS 26 Liquid Glass icons) — the star only, glass supplied by the system. The `✶` is already the app's decorative mark (§4.13 empty states, system-message flanks, SQUAD FORMED), so the icon is the brand's glyph, not a new one.
- **Home-screen name**: "down to" (with the space; `CFBundleDisplayName`). Quick actions (`UIApplicationShortcutItems`): "new check" (→ Create overlay, `Route.create`) and "squads" (→ SQUADS tab), typeset by the system — no icons beyond the SF `plus` and `bubble.left.and.bubble.right`.

---

## 8. Accessibility

**Contrast** (WCAG 2.x, recomputed for this revision; the original draft mis-stated several figures — corrected numbers are the ones here):

- On `#FCFFE2` paper: `#2A2A1A` ink **14.2:1** ✓; `#6B6B5A` muted **5.30:1** ✓ AA; `#8A8A70` dim **3.45:1** ✗ small text; `#B0B098` faint **2.16:1** ✗.
- On `#E0DCC8` surface: muted **3.93** ✗ → hence the surface variant `#55554A` **5.47** ✓; dim 2.56; faint 1.71. On `#D8D4C0` deep: muted 3.64 ✗ → `#55554A` **5.06** ✓.
- `#FE44FF` on cream **2.74:1** — fails AA text (4.5), fails *large* text (3.0) and the 3:1 non-text floor. **Pure magenta is therefore never text at any size**; §1.2 no longer allows "display text ≥ 20pt" (the earlier "≥ 26pt" in this section was equally wrong). It is fills (ink on it **5.2:1** ✓), the 2–3pt rules (state is also carried by tint + label), and decorative glyphs (the "✶", the detail-page "?") that carry no information the label does not.
- `Color.dtInk` `#C400C6`: **4.93** paper ✓, 4.66 checkDown ✓, 4.60 waitlistBg ✓, **3.66 surface ✗, 3.39 deep ✗, 2.88 ruleLight ✗**. Hence `Color.dtInkOnSurface` `#A000A2`: **5.05 surface ✓, 4.67 deep ✓, 6.81 paper**, 4.68 on dtSubtle-over-surface ✓, 4.34 on dtSubtle-over-deep ✗ (so no magenta text on a dtSubtle tint over deep — mention chips are paper-filled, §4.7). The stock rule (§1.2) resolves the right one.
- `Color.onDt` ink on magenta 5.2:1 ✓; white on magenta 2.8 ✗.
- `Color.newInk` `#C400A6` on `#C2FF8A`: **4.61** ✓ at 9pt bold.
- `Color.warnInk` — **corrected**: the previous `#B86E1E` was **3.62** on waitlistBg and 3.89 on paper (the draft claimed 4.6). The token is now `#8F5210`: **5.66 waitlistBg ✓, 6.07 paper ✓, 4.51 surface ✓**, 4.17 deep (✗ — on deep, warn is a glyph at ≥ 3:1 or the words are `Color.ink`; there is no size exception, see the next bullet).
- **"Large text" does not exist in this app.** WCAG's threshold is 18pt regular / 14pt bold in *CSS points* (1pt = 1/72 in = 1.333 CSS px), i.e. ≈ 24 px regular / ≈ 18.7 px bold — and an iOS point is ≈ 1 CSS px at 1×, so the bar in iOS points is **≥ 24pt regular / ≥ 19pt bold**. The only styles that clear it are `masthead`, `wordmark`, `display`, `numeral`, `displayCount` (and `title` at 22/600 does *not*: 22 < 24 regular and 600 is not bold's 700). Every coloured label in this document is ≤ 19pt, so **every text pair is held to 4.5:1**; the earlier "`warnInk` on deep at ≥ 14pt bold" exception is withdrawn (a 14pt bold iOS label is ≈ 10.5 WCAG-pt). The 3:1 figure appears in this document only for non-text: glyph circles, rings, the ✓/✗ glyphs, and the expiry fill.
- `Color.success` `#51CF66`: 1.96 paper / 1.46 surface / 1.35 deep — **never text**; only fills and the 3pt slip rule (7.25 on ink ✓). `Color.successInk` `#1F7A32`: **5.28 paper ✓**, 4.99 checkDown ✓; surface variant `#1A6B2B`: **4.79 surface ✓**, 4.43 deep ✗ → on deep cards the ✓ glyph is green (≥ 3:1 graphic) and the words are ink (§4.10).
- `Color.squad` `#A855F7`: 3.87 paper — a ring/fill, not text. `Color.squadInk` `#7C3FD0`: **5.90 paper ✓**, 5.58 checkDown ✓, 4.38 surface ✗ → surface variant `#6A34B8`: **5.45 surface ✓, 5.04 deep ✓**.
- `Color.poolInk` `#007A93`: 4.88 paper ✓, 3.62 surface ✗ → surface variant `#00607A`: 5.16 / 4.77 ✓. `Color.dangerInk` `#C63838`: 5.10 paper ✓, 3.79 surface ✗ → `#A82E2E`: 4.92 / 4.55 ✓.
- `Color.ink` on `#ECFFA5` **13.44**, on `#F0FFD8` 13.85, on `#FFF5CC` 13.28, on `#E0DCC8` 10.55, on `#D8D4C0` **9.76**, on `#C8C4B0` 8.29, on `#C2FF8A` 12.4 — ink is safe on every stock and tint, which is why the rule below prefers it. (Earlier revisions printed 12.7 / 9.5; the corrected figures change no decision.) `inkDim` on `ruleLight` is **2.01** (not 2.2) — still a fail, §4.4 corrected.
- **Pairs the doc uses that sit near the floor — recorded so a tint tweak cannot silently break them** (all AA, all ≤ 0.35 above 4.5): `dtInk #C400C6` on `checkMine` **4.80**, on `checkNew` **4.61**, on `downIdle` **4.65** (the idle "DOWN ?" label), on `checkDown` 4.66, on `waitlistBg` 4.60; `inkMuted #6B6B5A` on `checkDown` **5.01**, `checkMine` 5.16, `checkNew` **4.95**, `waitlistBg` **4.94**, `downIdle` 5.00; `inkExpired #6E6E5C` on `checkNew` **4.74**, `waitlistBg` **4.73**, `checkDown` 4.80, `downIdle` 4.79, `checkMine` 4.94, paper 5.07; `dangerInk #C63838` on `checkDown` **4.82**, `checkNew` 4.77, `waitlistBg` 4.76, `downIdle` 4.81. **Rule for tint changes:** `checkNew`, `waitlistBg` and `downIdle` may not get lighter than they are — any edit to §1.3 re-runs this list. `inkExpired`, `inkMuted`, `dtInk` and `dangerInk` are never small text on `surface`/`deep`/`ruleLight` (3.77 / 3.93 / 3.66 / 3.79 on surface) — the stock rule substitutes the surface variants, and `inkExpired` has none because expired entries live only on feed stocks.
- **Non-text on the AA-floor list**: the expiry fill `#FE44FF` on the `ruleLight` track is **1.60:1** and the `danger` fill 1.58 — exempt as an `accessibilityHidden` ornament whose value is carried by the "Xh left" label (§4.2). Under Increase Contrast the *fill* is remapped to `#A000A2` (3.97 on `ruleLight` ✓); the *track* is deliberately **not** remapped to `ruleMid` because `#A000A2` on `#B8B4A0` drops to 3.34 and pure magenta to 1.35 — the darker track would make the fill less visible, not more. The pair to re-check on any track change is fill-on-track ≥ 3:1 in Increase Contrast.
- Dark (v1.1): `#F2F2DC` on `#141410` **16.28**; `#FE44FF` on `#141410` 6.6 (magenta may be text in dark); dark surface variants (`#FF9AFF`, `#C9A6FF`, `#8EE59E`) are placeholders to be recomputed when dark ships.

**The inkDim / inkFaint rule — restated to match §4.** `Color.inkDim` (3.45:1) may carry only text that is *decorative or redundant*: "via Sara" (the friend is also in the response row), the masthead date (the device shows it), "-ish" suffixes (the date already reads as approximate), the "⋯" glyph (duplicated by long-press), poster "year · director" (secondary to the title, repeated in detail), "terms · privacy". Everything below was `inkDim` or `inkFaint` in the earlier draft and is now **`inkMuted`** because it is the *only* carrier of its information: "Xh left" / "expired" (the rule is `accessibilityHidden`); section labels TIMED / OPEN / HIDDEN and squad sections; chat system messages; "you were tagged"; "guests revealed on the day"; chat timestamps and squad-row times; ENDED / PAST / CLOSED; the sort toggle's inactive option; "block · report"; notification times; "updated 2m ago"; the About version. `Color.inkFaint` (2.16:1) is now strictly: placeholders, disabled *fills/borders* (never a disabled *label* — CLOSED and DOWN FIRST keep their `inkMuted` words), the "·" separators, the OTP's unfilled "·" slots, the sheet handle, and the 1pt strikethrough on hidden entries. **No entry, row or label is ever dimmed with `.opacity` below 1.0** — the earlier 0.55 (expired), 0.7 (hidden) and 0.85 (fading) rules are withdrawn because opacity multiplies every token on the row: `inkMuted` at 0.55 over paper is 2.22:1, at 0.7 is 2.91, at 0.85 is 3.88; `dtInk` at 0.55 is 2.75, at 0.7 is 3.55; even `ink` at 0.55 is 3.46 — and §2.1's 19pt/500 check text is not large text. Receded states are expressed by **recolouring text to a token that still passes** (`Color.inkExpired`, §1.2; `Color.inkMuted` for the state word) and by **dimming only decorative layers** (avatar fills, rules, tracks, flags, hero saturation — §4.1, §4.5, §7.4, §7.7). Opacity below 1.0 on text exists in exactly two places, both transient: the optimistic message/toggle label at 0.6–0.7 *until the server acks* (§4.3, §4.10), and the sort-change dip to 0.6 for 120ms (§5.1). Audit rule for reviewers: *if deleting the text would remove information, it is at least `inkMuted`; if the row is at less than full opacity, it is a bug.*

**Increase Contrast** (`@Environment(\.colorSchemeContrast) == .increased` — not `accessibilityContrast`, which is not a SwiftUI environment value), in the token layer: `inkDim → inkMuted`, `inkFaint → inkDim`, `rule → ruleMid`, every `*Ink` → its surface variant on all stocks; `[graft: tactile]` **`Color.dt` fills → `Color.dtInkOnSurface` `#A000A2` with `Color.paper` text (6.81:1)** on the DOWN active pill, the "+", the send circle, primary CTAs, the SQUAD FORMED stamp and your avatar (the earlier draft claimed 7.9:1 for paper on `#C400C6`; the true figure is 4.93, which passes AA but is not the headline number — `#A000A2` is used so the increased-contrast mode is visibly stronger); the DOWN active pill also gains a 1pt `Color.ink` inset border; the grain is removed (it is a low-contrast texture); the expiry fill → `#A000A2` while the **track stays `ruleLight`** (see the non-text bullet above — remapping the track to `ruleMid` would lower fill-on-track from 3.97 to 3.34); the hero wash's 0.85 stop becomes 0.92 and the imminent rule under the hero → `dangerInk`.

**Reduce Transparency** (`\.accessibilityReduceTransparency`): the grain overlay (a multiply blend) is removed; `presentationBackground(Color.surface)` is already opaque, and the context-menu preview's system blur is the system's to handle; the hero wash gradient goes fully opaque `Color.paper` under the title band; `Color.dtFaint`/`dtSubtle` press tints are replaced by `Color.ruleLight` (opaque). Nothing in the app depends on translucency for meaning.

**Dynamic Type:** every style uses `relativeTo` (kaomoji included, via its host, §2.1). At `≥ .accessibility1`: the DOWN toggle moves under the response row full-width 44; avatar stacks cap at 2 + N; Folio labels wrap to two lines and the bar grows to its intrinsic height (§4.11) with the underline following the label width; the masthead running head moves into the feed as a band (§4.12) — the friends-out count is never dropped; the grid poll becomes a list of time blocks with checkboxes; the OTP numeral drops to 28pt to keep 8 digits on one line; setting chips wrap; the chat's principal toolbar item drops the avatar stack and keeps name + countdown; uppercase tracking halves above `.xxLarge`. Test at `.xxxLarge` and `.accessibility3`.

**Hit targets:** 44×44 minimum everywhere, stated explicitly for the ones smaller than that visually: the 36pt "+" (44 `.contentShape`), the sort toggle (one 44-tall adjustable control), the bell, "⋯", sheet header trailing labels, the "×" on date chips, chat composer glyphs and the 32pt send circle, "block · report", ACCEPT/DECLINE text buttons, "COPY", the "↓" circle, notification rows (64) and every list row (≥ 48).

**Reduce Motion:** `Motion.resolve` maps springs with damping < 0.86 to `Spring.settle`; the DOWN radial dye and band dye become 120ms crossfades with no overshoot; the stamp, unfurl strip, "you're in" strip, reveal fuse/flip/scramble, ripple, shimmer (skeletons go static), "✶" spin, fan-out, availability overshoot, first-load stagger, "+" rotation, tab-content offset, hero scale, the POST text flight (§7.6), the promotion flood (§4.3) and the revive drain (§4.10) are disabled (crossfades only); **`.symbolEffect(.bounce.up.byLayer)` on the DOWN ✓ is replaced by a plain `.contentTransition(.symbolEffect(.replace))`** (SF Symbol effects do not check the setting themselves) and the **OTP digit pop** (§7.1, scale 1.3 → 1) and the entered-digit shake become an opacity 0 → 1 fade and a `Color.danger` rule flash respectively; `WobbleRenderer`/`ScrambleRenderer` draw their final state; the zoom transition falls back to the system's reduced-motion crossfade; grain stays. The "?" frame wave and the expiry shimmer are static (§4.1, §4.2). Haptics are unchanged.

**VoiceOver:** an entry is one element: "{author}'s check: {text}. {when} {where}. {N} down. {Xh left}." with the toggle as an `accessibilityAction` ("Down" / "Un-down") and Hide/Report/Share as custom actions. Toggle values "not down" / "down" / "waitlisted, position 2" / "closed". The NEW flag is a trait. Mystery: "mystery check, host revealed on {date}"; kaomoji `accessibilityLabel("mystery host")`. System messages read without the ✶ ornaments. Chat messages are elements "{sender}, {time}: {text}" with Copy / Report / Block (/ Delete) as custom actions; chat images carry "image from {sender}" (§4.10). Poll bars expose `accessibilityValue("3 votes, 40 percent")`. The expiry rule is hidden. Toasts, SQUAD FORMED, "you're in" and the offline band post announcements. Sheets announce their title. Folio tabs carry `.isSelected` (§4.11). Skeletons are one "loading" element; error colophons are one element with RETRY as an action.

**Other:** minimum hit target 44 everywhere (24pt avatars and 8pt dots are never the only route to an action). Colour is never the sole state carrier: down = tint + rule + label; expired = recoloured text + emptied track + the word "expired" + CLOSED; hidden = strikethrough + section + UNHIDE; waitlisted = dash + tint + label; new = flag + tint; past event = "happened" + CLOSED; fading squad = section + rule.

---

## 9. Signature moments (what gets screenshotted)

1. **The stamp.** Your thumb lands, the pill squashes, magenta floods it from the touch point, the click hits at the overshoot, and 60ms later the lime band dyes outward from the pill across the whole entry before the magenta rule draws down the page edge. Four haptics, under half a second. It feels like stamping a passport.
2. **The broadsheet feed.** Cream page, printed section labels with rules, entries separated by hairlines, one magenta-edged entry among them, a lime NEW flag bleeding off the edge, grain over everything. It doesn't look like an app.
3. **SQUAD FORMED.** tap-tap-hmmm-**THUD**: a rotated magenta rubber stamp lands on the check, a strip unfurls out of the entry reading "kat, devon + you · OPEN →", and the stamp flies into the SQUADS folio where the red dot pops.
4. **The mystery reveal.** The "?" frame burns clockwise into ✦, the kaomoji flips into a letter, the host's name decrypts symbol by symbol, and the guest count rolls up as the avatars rise. Pre-reveal the entries themselves are the other screenshot: `(⌐■_■) wants to know if you're down`.
5. **The transcript chat.** No bubbles: left-aligned mono, your messages marked by a single magenta rule, system lines in italic between ✶ ✶ — "not Devon actually following through" reads like a stage direction.

Honourable mentions: the "+" ripple on a fresh account and its 45° turn into "×"; the availability slider overshooting into "awkward 👀"; the waitlist landing that drains to a dashed border and types WAITLISTED at you; the deleted-check page whose only button says "press f", dropping in glyph by glyph.

---

## 10. Build notes (feasibility ledger)

- Custom Folio, custom pull-to-refresh, custom toast, custom stamp overlay, "?" frame, TextRenderers, transcript chat, grouped messages, root-overlay Create with matched geometry, CoreHaptics actor, skeleton/offline system, lobby select-members mode, poll composer (three variants), share preview cards: all bespoke; budget accordingly. Nothing here requires a nonexistent API.
- Keep all **three** tab stacks (FEED, SQUADS, YOU) alive in the root `ZStack` (opacity + hit-testing) for per-tab scroll preservation and cross-tab stamp overlays.
- `DragGesture(minimumDistance: 0)` under buttons (touch location for the radial dye) must be `.simultaneousGesture` with the `Button` so taps still fire. Gesture precedence on feed rows is specified in §4.1 and is an acceptance test, not a hope.
- The root `ZStack` order, bottom → top: tab content stacks → Folio → Create overlay → SQUAD FORMED stamp layer → Slip toast → offline band (under the masthead visually, but hosted at root so it survives navigation) → Grain.
- The module uses SE-0466 default `MainActor` isolation (§6.2); `HapticEngine` is the one explicit actor; helpers that run off-main are `nonisolated`.
- Token resolution goes through the `paperStock` environment (§1.2); a view that hard-codes `Color.dtInk` on a sheet is a review defect.
- Backend follow-ups this spec depends on (not blockers for v1 UI, but the doc assumes them): a `delete_message` path for own chat messages (§4.10 — omitted from the menu until it exists); `squad_members.muted_at` if mute is ever wanted (§7.7); report targets `squad_message` / `event_comment` / `check_comment` already exist in the schema and only need client wiring (§7.14); **APNs `thread-id`** (`squad:{id}` / `check:{id}`) so banners group and delivered-notification cleanup can key off `threadIdentifier` in addition to `userInfo.relatedId` (§7.8); **`badge`**: send the true unread count or drop it — the client only ever clears it (§7.8); a system line on `reactivate_squad` ("{name} revived the chat", §4.10); confirm `squads/extend` is rejected for archived squads (the UI offers REVIVE there, not EXTEND); confirm feed RLS admits a check the viewer responded to via `respond-shared` when they are not FoF (§7.17 — decides whether OPEN SQUAD → for that user lives on the feed or only in the squad list); the `cap_down_responses` author-slot bug in specs/interest-check-flow.md (the UI's "you're #N" ordinal assumes the fixed cap).
- Product decisions recorded here rather than in code: timer, squad size (post-creation) and mystery mode are not editable from `EditCheck` (§7.5); past events leave the feed on the next load (§4.5); no Share Extension in v1, `DownToShare.appex` in v1.1 (§7.6); light-only v1 (§1.1).
- Prototype checklist before locking: `checkText` face (Inter 19 vs Plex Mono 15–16); kaomoji cascade on device at 9/13/26 (with the corrected Hiragino W3 name and the `U+200B` strip); the radial band dye on the longest entry (diagonal ≈ 900pt — confirm 0.45s reads as a bleed, not a wipe); `Spring.stamp` apex timing against the 460ms THUD with a real `CHHapticEngine` latency measurement; **the hidden navigation bar in chat keeps the interactive edge-swipe pop on iOS 26.0 and 26.3 with `InteractivePopEnabler` installed** (§4.10, `ARCHITECTURE.md` §7.5 — the `#if DT_CUSTOM_POP` fallback there is the only approved alternative); **sheet geometry on iOS 26**: `presentationBackground(Color.surface)` + `presentationCornerRadius(24)` at `.fraction(0.72)` and `.height(N)` must present **edge-to-edge with the two top corners rounded** — if 26.x presents partial sheets inset/floating with four rounded corners, pin them with `.presentationSizing(.page)` and re-test, and if they still float, `Elevation.laid`'s 1pt top rule becomes a 1pt `ruleMid` stroke on the whole sheet outline (paper still has an edge, just all the way round); the iOS 26 scroll-edge effect is fully suppressed under the masthead, Folio and chat insets with `.scrollEdgeEffectStyle(.hard)`; the feed gesture acceptance test (§4.1); **the POST text flight** (§7.6) on a 30-entry feed with the Feed tab active and inactive — the destination row must report geometry before the overlay fades, else the flight is skipped; **cold start shows no white frame** with the `UILaunchScreen` `UIColorName = paper` dictionary on a device with the app killed (§7.18); the hero wash at its 0.85 stop over an all-black test image (ink ≥ 10:1, §4.5); the WHEN'S GOOD list fallback at `.accessibility3` (§4.10).

---

## 11. Revision ledger — gaps closed in this revision

| # | Gap | Resolution |
|---|---|---|
| 1 | dtInk fails AA on surface/deep/ruleLight | Added `Color.dtInkOnSurface` `#A000A2` + the `paperStock` environment stock rule (§1.2); every magenta-text call site on sheets, deep cards, the SQUAD FORMED strip, the profile overlay IG handle and the @mention list now resolves to it; vibe pill moved to a paper fill, mention chip to a paper fill (§4.7). |
| 2 | warnInk ratio mis-stated (3.62, not 4.6) | `Color.warnInk` → `#8F5210` (5.66 waitlistBg / 6.07 paper / 4.51 surface); §8 corrected and notes that 12pt bold is not WCAG large. |
| 3 | `Color.success` used as 1.96:1 text | Added `Color.successInk` `#1F7A32` (+ `#1A6B2B` surface variant); "looks good", the parse previews, "you're in", LOCKED all moved; `Color.success` is fills and the toast rule only; on deep the ✓ is green and the words are ink. |
| 4 | inkMuted fails on surface/deep; inkDim/inkFaint carrying meaning | inkMuted gets a `#55554A` surface variant via the stock rule; §8's rule restated with an explicit list — "Xh left", section labels, system messages, "you were tagged", "guests revealed…", chat/squad timestamps, ENDED/PAST/CLOSED, inactive sort option, "block · report" all promoted to `inkMuted`; `inkFaint` restricted to placeholders, disabled fills/borders, separators. |
| 5 | squad purple as text 3.87; "Color.dt display text ≥ 20pt" | Added `Color.squadInk` `#7C3FD0` (+ `#6A34B8` surface); `Color.dt` restated as fills/rules/decorative glyphs only, never text at any size (§1.2, §8). |
| 6 | Increase Contrast figure and environment key wrong | Corrected to `\.colorSchemeContrast == .increased`; paper on `#C400C6` is 4.93 — the mode now uses `#A000A2` (6.81) so it is visibly stronger; grain removed in that mode. |
| 7 | EventLobby unspecified | New §7.11: full anatomy (YOUR SQUAD, SQUADS with REQUEST TO JOIN / REQUESTED / WAITLIST states, DOWN — FRIENDS, ALSO DOWN, pool toggle, select-members mode → CREATE SQUAD (n) →, empty state), copy, motion, haptics, VoiceOver. |
| 8 | FriendsModal unspecified | New §7.12: sheet with typeset FRIENDS / ADD tabs, filter, row states ADD / REQUESTED / ACCEPT / FRIENDS ✓, invite-link card → ShareLink, incoming REQUESTS band, SENT, FoF "via Sara" suggestions, realtime, push routing. |
| 9 | Poll creator unspecified; PollMessage missing reopen/clear/close | New §7.13: TEXT (2–10, multi-select), DATES (natural-language → date chips + graphical picker), WHEN'S GOOD (range / window / slot chips + live preview grid); §4.10 poll card gains a meta line, CLEAR MY VOTES, CLOSE POLL / REOPEN, PROPOSE THIS → proposed ✓. |
| 10 | ReportSheet and message/comment reporting unspecified | New §7.14: six reasons, details field, "block too" toggle, ink CTA, local hide on success; §4.10 long-press context menu on messages and comments (Copy / Report / Block / Delete-if-supported) using the §4.1 preview pattern; all five schema targets wired. |
| 11 | No loading / error / offline states | New §7.15 "the press": shimmer-rule skeletons per surface with the first-load stagger as the skeleton→data transition, cache-first cold start, inline error colophons with RETRY, slip errors for actions, the inverted "press not running" offline band with disabled-not-hidden actions, realtime reconnect handling, image upload / send / scrape / post / OTP / rate-limit / session-expiry failures (§4.10, §7.1, §7.5, §7.6, §7.9). |
| 12 | DOWN CTA precedence and the "joined an existing squad" moment | §4.3 gains a surface × condition → CTA table (SQUAD → retired; JOIN SQUAD → / WAITLIST → / REQUESTED are event-only secondary pills); §5.6 gains the "you're in" strip (48pt, no stamp, no Pattern A) with a permanent OPEN SQUAD → link afterwards. |
| 13 | Hidden nav bar vs interactive pop | §4.10 keeps the system bar restyled via `toolbarBackground` + `ToolbarItem(.principal)`, names the UIKit `interactivePopGestureRecognizer` shim as the only approved fallback, and adds an iOS 26 device check to §10. |
| 14 | Internal contradictions (tabBar modifier, four stacks, WAITLISTED, dragonfruit, mute) | Folio hidden by root state (§4.10, §4.11); three stacks (§10); WAITLISTED uses `WobbleRenderer` in both §4.3 and §5.9; Theme row hidden in v1 with the return condition stated (§7.10); mute swipe removed with the backing-field note (§7.7, §10). |
| 15 | Kaomoji cascade names and glyph coverage | §2.2: Hiragino Sans **W3**, Apple SD Gothic Neo, `UIFont.systemFont(ofSize:).fontDescriptor`; coverage holes for `ʖ`, `꒳`, `ς` listed with a replacement entry; `U+200B` stripped on port; device verification step kept and extended. |
| 16 | API naming nits | `onScrollGeometryChange` written in full with `action:` old/new (§4.14); `.smooth(duration:)` (§4.10, §5); `Text.dtTracking` via `UIFontMetrics` (§2); enum renamed `DTSpring` (§5); `resetHandler` hops with `Task { await … }` and SE-0466 default MainActor isolation stated (§6.2). |
| 17 | Author's own mystery check, pre-reveal chat surfaces, midnight flip | §4.1 adds the author-variant row ("?" frame shown, own byline unredacted, "N ?" count); §4.10 lists everything hidden pre-reveal (polls, chip, date-confirm card *and* bar, composer glyphs, member actions) and the `TimelineView(.explicit)` midnight tick; §5.7 trigger restated in viewer-local time with the author's reduced reveal. |
| 18 | EditEvent, Sync Calendar EXPORT, share flows, notification mapping | New §7.16: EditEvent blocks incl. LINKED SQUADS with join-request count pills; Sync sheet SUBSCRIBE / EXPORT layouts with the .ics `ShareLink`; check / event / friend `ShareLink` previews (rendered `SharePreviewCard`, `markCheckShared` first, mystery-safe); §7.9 maps all 23 notification types. |
| 19 | Dynamic Type / accessibility loose ends | Folio intrinsic height + `.isSelected` (§4.11); kaomoji scales with its host (§2.1); Reduce Transparency section (§8); 44pt targets stated for "+", sort toggle and the rest (§4.12, §8); chat image labels (§4.10); push `.denied` → OPEN SETTINGS row (§7.10); masthead count moves into the feed at accessibility sizes (§4.12). |
| 20 | iOS 26 scroll-edge effect and gesture stacking | Masthead and Folio are `safeAreaInset`s with `.scrollEdgeEffectStyle(.hard)` (§4.11, §4.12), chat insets likewise (§4.10); §4.1 names the gesture precedence (scroll cancels press at 6pt / scroll phase; system long-press wins at 0.35s; tap on release; toggle isolated) with an on-device acceptance test. |

**Revision 3 — gaps closed**

| # | Gap | Resolution |
|---|---|---|
| 21 | Expired / hidden / fading rows dimmed below AA (0.55 → inkMuted 2.22, 0.7 → dtInk 3.55, 0.85 → inkMuted 3.88) | Whole-entry opacity abolished everywhere (§1.3, §4.1, §5.8, §7.4, §7.7, §8). New `Color.inkExpired` `#6E6E5C` (≥ 4.73 on every feed stock, §1.2) for receded body text; state words stay `inkMuted`; only decorative layers dim (avatar fills, tracks, flags, hero saturation). §8's audit rule extended: "if the row is at less than full opacity, it is a bug". |
| 22 | iOS 26 glass capsules on the chat toolbar items | §4.10: every `ToolbarItem`/`ToolbarItemGroup` carries `.sharedBackgroundVisibility(.hidden)`; the system back button (which cannot lose its capsule) is hidden and replaced by a custom chevron item, with the `interactivePopGestureRecognizer` shim now mandatory; `.toolbarBackground(Color)` flat-fill verification and the `safeAreaInset(.top)` fallback added to the §10 checklist. |
| 23 | Ended / grace / archived / kicked / promoted chat states unspecified | §4.10 "Chat lifecycle" table: live, waitlist, grace strip with SET A DATE →, < 1h EXTEND strip, **ended** read-only composer strip with REVIVE IT → (`reactivate_squad`), purged colophon, kicked/archived-while-open (swap in place, never pop), **promoted while open** (strip → composer, date-confirm bar appears per date-confirm-flow.md). §7.7 ended rows; §7.8 settings read-only in ended squads; §4.3 the reverse WAITLISTED → DOWN ✓ choreography on the feed. |
| 24 | No permanent feed route to the squad for the author or after expiry | §4.1 response row: "OPEN SQUAD →" for every member of a linked squad, author included (it takes the toggle's slot on own checks), persisting through the expired/CLOSED state until the squad is archived; unread dot; VoiceOver action. §5.6 cross-referenced. |
| 25 | EditCheck was one line | §7.5 `EditCheck` fully specified, reusing the §7.16 idiom: display-size text editor with inline @mention list (why inline, not overlay, inside `presentationContentInteraction(.scrolls)`), WHEN/WHERE, CO-AUTHORS chips with pending/accepted states and the before/after bylines, read-only TIMER / SQUAD (→ SquadSettings stepper, `squads/update-size`) / MYSTERY rows with reasons, SHARE / DELETE (+undo), SAVE side-effects. |
| 26 | Propose / lock / clear a squad date outside polls | §4.10 "Proposing, locking and clearing a date": `DateProposal` quick sheet with ASK EVERYONE / LOCK IT (`set-date {locked}`), re-propose confirm, auto-lock retarget, "nobody can make {date}" copy, CLEAR (`{clear: true}`) with header retarget back to the check's clock; §7.8 DATE row (PROPOSE A DATE / CHANGE / CLEAR); §7.16 EditEvent: SAVE proposes only when opened from SquadSettings, CLEAR DATE row, EditCheck never proposes. |
| 27 | Deep links, invite links, shared-check entry, push cold launch | New §7.17 `Route`: associated domains + `downto://`, `onOpenURL`, one pending route with 24h replay, full routing table for `/check/{id}` (in-feed vs non-FoF shared-check detail with I'M DOWN → `respond-shared`), `/friend?token=` with every RPC error mapped to copy, `/?add=`, sw.js forms, and all push types cold and warm; onboarding paths (context band, notifications gate skipped, author pinned, friend-link creator pinned). RLS follow-up for non-FoF responders recorded in §10. |
| 28 | Event entry states beyond down | §4.5 state table: mine (poster keeps the DOWN toggle; excluded only from the responders row), new (flag placement vs source chip), saved-not-down, imminent (24h/2h `dangerInk` date segment + rule), past (recolour, "happened", CLOSED, leaves the feed on next load — no server expiry for events), highlighted (band + wash flash), visibility chip for the poster. |
| 29 | Push cleanup relied on an unset `threadIdentifier`; badge never cleared | §7.8: cleanup filters `deliveredNotifications()` on `userInfo.relatedId`; `setBadgeCount(0)` on active / notifications sheet / chat open; `thread-id` and a real badge count added to the §10 backend ledger. |
| 30 | WHEN'S GOOD closed state and list-mode voting | §4.10 grid poll: ranked block rows (rank, heat swatch, "thu 7–9pm", "4 of 5") each with PROPOSE THIS → (`propose-from-poll {pollId, date, time}` = block start) → "proposed ✓"; Dynamic Type voting fallback as a per-day slot list with WHOLE WINDOW toggles. |
| 31 | `sensoryFeedback` positional shorthand | Every `.impact(...)` rewritten as `.impact(flexibility:intensity:)` / `.impact(weight:intensity:)` (37 occurrences); §6.1 states the API spelling. |
| 32 | WCAG large-text threshold misapplied to iOS points | §8: threshold restated as ≥ 24pt regular / ≥ 19pt bold in iOS points; no coloured label in the app qualifies, so every text pair is held to 4.5:1; the `warnInk`-on-deep "≥ 14pt bold" exception withdrawn (§1.2, §8). |
| 33 | Contrast arithmetic slips and untested near-floor pairs | §8: ink/checkDown 13.44, ink/deep 9.76, inkDim/ruleLight 2.01 (§4.4 too), dark 16.28; a recorded list of every pair within 0.35 of the floor (dtInk on checkMine/checkNew/downIdle, inkMuted on checkDown/checkMine/checkNew/waitlistBg, inkExpired on all feed stocks, dangerInk on checkDown) with a "tints may not get lighter" rule; expiry fill-on-track stated (1.60) with the Increase Contrast remap of the *fill* and the reasoned decision not to remap the track (§4.2, §8). |
| 34 | Hero title contrast over photos uncomputed | §4.5: wash stops are defined by the measured title box (0 at 40% → 0.85 at box top − 16 → 0.92 at bottom); worst case over a black photo computed at 10.07:1 / 11.92:1, 5.0 even at the 0.6 point; no luminance sampling needed; Reduce Transparency goes opaque. |
| 35 | Availability slider unselected-segment colour | §7.10: words in `.inkMuted` → `#55554A` on surface (5.47); emoji exempt, words never omitted. |
| 36 | Paste-link entry and the Share Extension decision | §7.6: `PasteButton(payloadType: URL.self)` (no pasteboard banner) + `detectPatterns` nudge, never auto-paste; Share Extension explicitly deferred to v1.1 (`DownToShare.appex`) under the single-target reading of the constraint. |
| 37 | Reduce Motion and strict-concurrency loose ends | §8: `.symbolEffect(.bounce)` → `.replace`, OTP pop/shake → fade/rule flash, plus the promotion/revive/POST-flight additions; §6.2: one list of every off-main callback (`NWPathMonitor`, Realtime, notification delegate, haptics) and how each hops to the main actor. |
| 38 | POST matched-geometry choreography | §7.6 prototype caveat: frame (not font) interpolation, destination row must be laid out first — ordered insert → scroll → geometry callback → flip; 120ms bail-out to the crossfade path; on the §10 checklist. |
| 39 | iOS 26 sheet geometry, launch screen, app icon | §10 checklist: edge-to-edge sheet verification with `.presentationSizing(.page)` and an outline-rule fallback; new §7.18: `UILaunchScreen` `UIColorName = paper` (no white frame), the "✶" icon with dark / tinted / clear variants, display name, quick actions. |

**Revision 4 — reconciliation with `ARCHITECTURE.md`** (each row cites its `DECISIONS.md` entry; that file is the authority when the two documents still disagree)

| # | Conflict | Resolution |
|---|---|---|
| 40 | Precedence and naming between the two docs | Header: INVENTORY (what) → ARCHITECTURE (how built) → DESIGN (how it looks) → DECISIONS over all; this document's token / spring / haptic / component names are the code names; screens keep ARCHITECTURE's file names (map in the header). DECISIONS #1, #9 |
| 41 | Fonts: static Inter cuts + `Font.custom` (ARCHITECTURE) vs `Inter-Variable.ttf` + descriptor axes (here) | §2: `InterVariable.ttf` + five static Plex Mono cuts; every `Font.dt.*` built through `UIFontDescriptor` (`wght`/`opsz` variation attributes) → `UIFontMetrics.scaledFont` → `Font(_:)`; no `.weight()`, no `Font.custom(_:size:relativeTo:)`, no `@ScaledMetric` on sizes, no scale clamp; real PostScript names (`InterVariable`, `IBMPlexMono`, `-Medm`, `-SmBld`, `-Bold`, `-Italic`) with a CI assertion; §2.2 cascade name fixed. DECISIONS #5 |
| 42 | `checkText` face left open | §2.3: `DTTextStyle.checkText.face` token, default `.inter` (19/24/500), `.mono` (15/22/400) one line away; gallery renders both; product owner decides on device. DECISIONS #6 |
| 43 | Chat navigation bar: restyled system bar (here) vs hidden bar + custom `ChatHeader` (ARCHITECTURE §7.5) | §4.10, §5.5, §10: hidden bar, custom `ChatHeader` 48pt with the same layout, `InteractivePopEnabler` shim mandatory; the toolbar de-glassing bullets and `.toolbarRole(.editor)` experiment withdrawn. DECISIONS #15 |
| 44 | Midnight reveal and expiry ticks scheduled per view (`TimelineView(.explicit)` / `.periodic(by: 30)`) vs in the stores (ARCHITECTURE §4.8) | §4.2, §4.10, §5.7: the stores tick; views watch `revealedNow` and `ExpiryState`; only the < 5 min entry runs a 1-second `TimelineView`. DECISIONS #17, #18 |
| 45 | Chat page size 50 vs 100 | §4.10: 100 (ARCHITECTURE §7.6). DECISIONS #26 |
| 46 | Cache store (`SwiftData or JSON`) and Sentry in M1 | §7.15: `LocalCache` actor; `os.Logger` in M1, Sentry M2. DECISIONS #21 |
| 47 | Route enum, replay storage, push routing for events and `check_archived` | §7.17: structure is ARCHITECTURE §7–§7.4; event pushes route to the feed without highlight (INVENTORY §5); `check_archived` routes nowhere; the 24h stale-route drop is adopted by ARCHITECTURE. DECISIONS #25 |
| 48 | Presentation of detail / Create / deleted check (sheets in ARCHITECTURE §7) vs zoom push / root overlay / push (here) | §4.9, §5.4, §7.5, §7.6 stand; ARCHITECTURE's `Router` gains `feedPath` and `isCreateOpen`, `Folio` hides on `router.hidesFolio` (§4.11). DECISIONS #16, #13 |
| 49 | Push-permission band condition | §7.4: ARCHITECTURE §4.9's `NotifNudgeBanner` condition (≥ 1 squad or check, dismissible, Settings when denied) with this document's look. DECISIONS #29 |
| 50 | M1 treatments of deferred features (ARCHITECTURE §15.1) vs the full §7 | New §7.0 table: lobby slip, read-only `EventEntry` with hidden secondary pills / SAVE / chip / comments, IDEA-only Create, disabled poll glyph + `PollPlaceholderRow`, list-only members, Copy-only message menu, `.check`/`.profile` reports, hidden Sync-to-calendar row, movie header as a text link. DECISIONS #27 |
| 51 | Component / file names used by ARCHITECTURE (`CheckCard`, `ExpiryBar`, `BottomNav`, `Toast`, `DTSheet`, `GrainOverlay`, `NewBadge`, `MysteryBorder`, `DTAnimation`, `DTHaptic`, `DT.Color.*`) | ARCHITECTURE §1, §13, §14 rewritten to this document's names; the "?" frame is named `MysteryFrame` (§4.1); `ToastCenter` stays as the store behind `Slip`. DECISIONS #2–#4, #7–#9 |
