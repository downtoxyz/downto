# down to

Event saving app with social layer. Save events from Instagram to your calendar, see who else is going, form small squads.

## Stack
- Next.js (App Router)
- TypeScript
- Supabase (auth, Postgres, RLS, Realtime, DB triggers)
- Migrating to Tailwind CSS — inline styles are fine during this transition. Space Mono + Instrument Serif fonts, dark theme with #E8FF5A accent

## Design Rules

Migrating from inline styles to Tailwind CSS. Inline styles with tokens from `src/lib/styles.ts` are acceptable during the transition.

### Typography
- **Headings**: `font.serif`, weight 400 — 22px for sheet/panel titles, 24px for event card titles, 18px for check body text and modal titles, 17px for squad card names
- **Body/labels**: `font.mono` — 12–13px for body text and buttons, 11px for secondary labels (author names, notification titles), 10px for metadata (timestamps, section labels, expiry)
- **Section labels**: `font.mono`, 10px, `textTransform: "uppercase"`, `letterSpacing: "0.15em"`, `color.dim`
- **Action button text**: `font.mono`, 12px, weight 700, uppercase, `letterSpacing: "0.08em"`

### Color hierarchy (text)
- `color.text` (#fff) — primary content
- `color.muted` (#888) — secondary (other people's names, last messages)
- `color.dim` (#666) — tertiary (venue, timestamps, "via" annotations, inactive buttons)
- `color.faint` (#444) — quaternary (message timestamps, expiry labels, disabled state)
- `color.accent` (#E8FF5A) — your content, active states, primary actions

### Cards
- Event cards: `borderRadius: 20`, `marginBottom: 16`, bg `color.card`, border `color.border`
- Check cards: `borderRadius: 14`, `marginBottom: 8`, bg `color.card`, border `color.border`
- Squad cards: `borderRadius: 16`, `marginBottom: 8`, `padding: 16`, bg `color.card`, border `color.border`

### Avatars
- Letter circles, `borderRadius: "50%"`. Sizes: 36px (lobby/notifications), 28px (check authors), 24px (responses, chat members)
- Your avatar: bg `color.accent`, color `#000`
- Others: bg `color.borderLight`, color `color.dim`
- Stacked avatars overlap with `marginLeft: -6` (responses) or `-8` (event social preview), `border: 2px solid color.card`
- Overflow: "+N" counter at 8px mono 700

### Bottom sheets (EventLobby, NotificationsPanel)
- Backdrop: `rgba(0,0,0,0.7)` + `backdropFilter: blur(8px)`, zIndex 100
- Panel: bg `color.surface`, `borderRadius: "24px 24px 0 0"`, maxWidth 420, maxHeight 70–80vh
- Drag handle: 40x4px, bg `color.faint`, borderRadius 2, centered
- Open animation: `slideUp 0.3s ease-out`. Close: `translateY(100%)` over 0.25s
- Swipe-to-dismiss threshold: 60px downward

### Compound metadata
Join related info with `" · "` separator (space-dot-space) in a single line:
- `2h · expires 3d` (squad list)
- `Feb 15 · 8pm` (event card)
Use `color.faint` for the whole line, or per-segment coloring (e.g. red for urgent expiry under 24h)

### Status indicators
- Notification unread dot: 8px circle, `color.accent` (yellow)
- Squad unread dot: 8px circle, `#ff3b30` (red) — used in both squad cards and bottom nav
- Expiry bar on checks: 3px tall, green→orange→red as time elapses

### Buttons
- Primary: bg `color.accent`, color `#000`, borderRadius 12, padding 12–14px
- Secondary: bg transparent, color `color.text`/`color.dim`, border `1px solid color.borderMid`, borderRadius 12
- Destructive: bg `#ff4444`, color `#fff`, borderRadius 10

### Confirm dialogs
- Overlay: fixed inset, `rgba(0,0,0,0.7)`, zIndex 9999
- Panel: bg `color.deep`, border `color.border`, borderRadius 16, maxWidth 300, padding `24px 20px`
- Title serif 18px, body mono 11px `color.dim`, button row flex gap 10

## Development
- `npm run dev` — local Supabase (`127.0.0.1:54321` via `.env.development.local`)
- `npm run dev:prod` — cloud Supabase (`.env.local`, for testing with real data)
- Production env vars are set in Vercel

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

Test users: `kat@test.com`, `zereptak.burner@gmail.com`

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
