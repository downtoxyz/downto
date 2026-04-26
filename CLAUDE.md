# down to

Event saving app with social layer. Save events from Instagram to your calendar, see who else is going, form small squads.

## Specs
Product behavior specs live in `specs/`. Read the relevant spec before implementing or modifying a feature.

## Stack
- Next.js (App Router)
- TypeScript
- Supabase (auth, Postgres, RLS, Realtime, DB triggers)
- Tailwind CSS (primary). The theme lives in `src/app/global.css` (`@theme` block). `src/lib/styles.ts` exports a parallel `color` map that mirrors the Tailwind palette — fine to use for inline styles when reaching for one-off values
- Light cream theme (#FCFFE2 bg) with #FE44FF magenta accent. Inter for serif/headings, IBM Plex Mono for body/labels

## Design Rules

Prefer Tailwind classes over inline styles. The `color` object in `src/lib/styles.ts` is kept in sync with the Tailwind palette and is acceptable for inline-style use; the `font` object there (`Sora`/`Exo`) is **out of sync** with the actual rendered fonts (Inter / IBM Plex Mono) — don't rely on it, use the `font-serif` / `font-mono` classes.

### Surfaces
- `bg-bg` (#FCFFE2 cream) — page background
- `bg-card` (#FCFFE2) — card background, same as page; cards rely on borders for separation
- `bg-surface` (#E0DCC8) — bottom sheets, panels
- `bg-deep` (#D8D4C0) — modal panels, confirm dialogs
- `bg-dt` / `text-dt` (#FE44FF magenta) — brand accent, your content, active states. Pair with `text-on-accent` (#fff) on `bg-dt` backgrounds
- `bg-pool` / `text-pool` (#00D4FF) — squad pool / "looking for crew" affordances
- `bg-danger` / `text-danger` (#ff6b6b) — destructive / urgent

### Text hierarchy
- `text-primary` (#2A2A1A) — main content
- `text-muted` (#6B6B5A) — secondary (other people's names, last-message previews)
- `text-dim` (#8A8A70) — tertiary (venue, timestamps, "via" annotations)
- `text-faint` (#B0B098) — quaternary (placeholder, expired/disabled state, separators)
- `text-dt` — your content, active states, links, primary actions

### Borders
- `border-border` (#D8D4C0) — default card/panel borders
- `border-border-light` (#C8C4B0) — subtle separators, used as the bg for non-highlight avatars and pill chips
- `border-border-mid` (#B8B4A0) — emphasized borders

### Typography
- `font-serif` → Inter. Use for headings. The `.font-serif` class applies `letter-spacing: -0.04em`. Standard heading sizes: `text-lg` (18px) for card titles, `text-xl`/`text-2xl` for sheet/modal titles.
- `font-mono` → IBM Plex Mono. Use for body, labels, buttons. The `.font-mono` class applies `letter-spacing: -0.04em` and weight 400. Standard sizes: `text-xs` (12px) body, `text-tiny` (10px) metadata/labels.
- Section labels: `font-mono text-tiny uppercase tracking-widest text-dim`
- Action button text: `font-mono text-xs font-bold uppercase tracking-wider`

### Cards
- Default: `rounded-2xl mb-2 bg-card border border-border` (16px radius)
- Newly-added emphasis: `rounded-sm bg-(--color-check-new-bg) border-(--color-check-new-border)` — sharper corners + warm tint draw the eye
- Down state on check cards: apply the `check-down` class (defined in `global.css`) — sets `bg-(--color-check-down-bg)` and clears the border
- Author/created-by check cards: apply the `check-mine` class — same pattern with `bg-(--color-check-mine-bg)`
- Author row (cards in feed): `w-5 h-5 rounded-full bg-border-light text-dt` letter circle, then `font-mono text-tiny text-muted` line with the author name in `text-dt font-semibold`. "via {friendName}" uses `text-dim` for the FoF annotation.

### Bottom sheets (DetailSheet, ReportSheet, CheckActionsSheet, NotificationsPanel, EventLobby, …)
- Mount under `fixed inset-0 z-[100] flex items-end justify-center`
- Backdrop: transparent → `backdropFilter: blur(8px)`, transitioned over 300ms (entering and closing both go to `blur(0px)`)
- Panel: `bg-surface rounded-t-3xl pt-3`, max width 420px, max height 70–80vh
- Drag handle: `w-10 h-1 bg-faint rounded-sm` centered at top (inside a `touch-none` wrapper)
- Animation: `animate-slide-up` on open; `translateY(100%)` over 250ms on close
- Swipe-to-dismiss: 60px downward threshold
- The shared shell is `src/shared/components/DetailSheet.tsx` — prefer extending it over reimplementing the gesture/animation logic

### Avatars
Use `<AvatarLetter avatarLetter={...} size="..." highlight={isYou} />`.
- Sizes: `inline` (24px), `small` (28px), `medium` (40px), `display` (72px)
- `highlight={true}` → your avatar, magenta fill
- Stacked avatars overlap with `marginLeft: -6` to `-8`, `border: 2px solid` matching the surface they sit on
- "+N" overflow counter: `font-mono text-[8px] font-bold`
- The component's non-highlight default still references dark-theme tokens (`bg-neutral-800 text-neutral-500`) — call sites that want the cream-theme look pass `className="bg-border-light text-dim"`. When touching avatar-using components, prefer fixing them (or the component) to the new tokens.

### Pills, badges, dots
- "New" badge: `bg-dt text-on-accent font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full`
- Vibe pill: `bg-border-light text-dt py-0.5 px-1.5 rounded-xl font-mono text-tiny uppercase tracking-widest`
- Notification unread dot: `w-2 h-2 rounded-full bg-dt`
- Squad unread dot: `w-2 h-2 rounded-full bg-red-500` (squad cards + bottom nav)
- Expiry bar on checks: 3px tall, green → orange → red gradient as time elapses

### Buttons
Use `<Button variant="..." size="..." />` from `src/shared/components/Button.tsx` for the standard set:
- `primary` — `bg-dt` filled, dark text
- `outline` — transparent with a neutral border (this variant still uses dark-theme tokens, hasn't been reskinned yet)
- `highlight` — transparent with `text-dt` and `border-dt`
- Sizes: `small` (`rounded-lg text-tiny`), `medium` (`rounded-lg text-xs`), `large` (`rounded-xl text-sm uppercase tracking-widest`)

Card-internal toggles ("DOWN ?" on event cards):
- Idle: `bg-(--color-down-idle-bg) text-dt border border-(--color-down-idle-border) rounded-full`
- Active: `bg-dt text-bg rounded-full`

### Compound metadata
Join related info with `" · "` separator (space-dot-space):
- `Feb 15 · 8pm` (event/check date/time line)
- `2h · expires 3d` (squad list)
Use `text-faint` for the whole line, or per-segment coloring (e.g. `text-danger` for urgent expiry under 24h).

### Global behaviors (in `global.css` `@layer base`)
- All buttons: `transition: all 0.15s ease`, `:active` scales to 0.97
- Inputs: `:focus { border-color: #FE44FF }` and `::placeholder { color: #B0B098 }`
- `html, body` are `overflow: hidden` with `overscroll-behavior: none` (mobile-first, no rubber-banding)
- `* { user-select: none }` by default; inputs/textareas/contenteditable opt back into text selection
- Animations available as Tailwind classes: `animate-fade-in`, `animate-slide-up`. `expiryShimmer` keyframe is defined for the check expiry bar.

## Development
- `npm run dev` — local Supabase (`127.0.0.1:54321` via `.env.development.local`)
- `npm run dev:prod` — cloud Supabase (`.env.local`, for testing with real data)
- Production env vars are set in Vercel

### Worktree setup
After creating a worktree, always run these steps before doing anything else:
1. Copy env files: `cp /Users/katsu/downto/.env.local <worktree>/ && cp /Users/katsu/downto/.env.development.local <worktree>/`
2. Install dependencies: `npm install` (from within the worktree)

## Workflow
- Bugs and feature requests are tracked in [GitHub Issues](https://github.com/xylene-p/downto/issues).
- Work on the next highest priority issue unless I say otherwise.

## Testing with agent-browser

### Auth
Local Supabase uses OTP codes. Emails go to Mailpit (http://127.0.0.1:54324). To log in for testing:
1. Send OTP via the app (enter email, click "Send Code")
2. Get the 8-digit code from Mailpit:
```bash
# Fetch latest OTP code for a test user
OTP=$(curl -s "http://127.0.0.1:54324/api/v1/search?query=to:kat@test.com" | \
  python3 -c "import json,sys,re; msgs=json.load(sys.stdin)['messages']; print(re.search(r'\d{8}', msgs[0]['Snippet']).group())")
echo "$OTP"
```
3. Enter the code in the app

Use `--session-name downto` on all agent-browser commands to persist auth across browser restarts.

Test users: `kat@test.com`, `testuser2@test.com`

### App navigation
- **Bottom nav tabs**: Feed (`⚡ Feed`), Cal (`📅 Cal`), Squads (`👥 Squads`), You (`⚙ You`)
- **Feed** has two sub-tabs: "For You" (checks + public events) and "Tonight ✶"
- Use `snapshot -i -C` to get cursor-interactive elements (onclick divs like event cards)

### Interest checks (in feed)
- "Down" / "Maybe" buttons to respond, "✓ Down" / "✓ Maybe" to undo
- "Squad →" creates a squad, "💬 Squad →" opens existing squad, "Join Squad →" joins one

### Event cards (in feed)
- "I'm Down ✋" toggles down status, "You're Down ✋" means already down
- "N people down→" (cursor-interactive) opens EventLobby overlay
- "✓ Saved" / "Save" toggles calendar save

### EventLobby (overlay)
- Shows "Who's down?" list
- "I'm looking for a squad" joins crew pool, becomes "Leave squad pool" when joined
- Close by clicking the dark overlay area above the sheet
- Crew pool state resets when un-downing an event (DB trigger)

### Squads tab
- Lists active squads with chat
- Squad chat opens inline with message input
