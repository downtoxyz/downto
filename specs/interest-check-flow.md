# Interest Check Flow Spec

## Context

Interest checks are the core social unit. A user posts a check ("Downto fall in love?"), friends and friends-of-friends see it in their feed, and people respond "down". When enough people are down, a squad forms and the group can coordinate via chat.

Checks can have a `max_squad_size` cap (default: unlimited). When a check is capped, the waitlist system controls who gets into the squad.

---

## Creating a check

Author fills out:
- **Text** (required): the check body
- **Expiry**: hours until check expires (null = open/no expiry)
- **Max squad size**: cap on total squad members including author (null = unlimited)
- **Event date/time** (optional): date_flexible / time_flexible flags
- **Location** (optional)
- **Co-authors** (optional): tagged friends who can bypass the squad size cap

On creation:
- Check is visible to author's friends and friends-of-friends (RLS via `is_friend_or_fof`)
- FoF viewers see a "via {mutual_friend}" annotation
- Co-authors get a notification and can accept/decline

---

## Responding to a check

### "Down" button
A single response type: "Down". No "Maybe" or other options.

When a user clicks "Down":

1. **Cap check** (DB trigger `cap_down_responses`, BEFORE INSERT):
   - If `max_squad_size` is NULL → response stays 'down'
   - If `max_squad_size` is set:
     - Count existing 'down' responses + 1 (for the author's reserved slot)
     - If count >= `max_squad_size` → response is converted to 'waitlist'
     - Co-authors (accepted status) bypass the cap entirely
2. **Auto-join squad** (DB trigger `auto_join_squad_on_down_response`, AFTER INSERT):
   - If an active squad exists for this check:
     - Count current squad members with role='member'
     - If count < `max_squad_size` → add as 'member'
     - If count >= `max_squad_size` → add as 'waitlist'
   - If no squad exists yet → no action (squad created separately)
3. **Toast feedback**:
   - Response = 'down' → "You're down! 🙌"
   - Response = 'waitlist' → "Check is full — you're on the waitlist"

### Un-downing
Clicking the filled "✓ Down" or "✓ Waitlisted" button removes the response:
- Deletes `check_response` row
- If user was in the squad → removed from squad, leave message posted
- Triggers waitlist promotion (see below)

---

## Squad formation

A squad is created when a user clicks the "Squad →" button on a check. This button appears after the user responds "down" and at least one other person is also down.

### Who gets added at creation
- The check author (always)
- The current user (if not the author)
- All users with response='down', up to `max_squad_size`
- Everyone added at creation gets role='member'

### CTA button states (on check card)

| State | Button | Action |
|-------|--------|--------|
| No response yet | "Down" | Submit 'down' response |
| Responded 'down', no squad | "Squad →" (yellow) | Create squad |
| Responded 'down', in squad | "💬 Squad →" (purple) | Navigate to squad |
| Responded 'down', squad exists, not joined | "Join Squad →" (purple border) | Join via `join_squad_if_room` |
| Responded 'down', squad full, not joined | "Waitlist →" (gray border) | Join as waitlisted |
| Waitlisted (check or squad) | "✓ Waitlisted" | Shows status; tap to view squad |
| Check expired, no response | Disabled "Down" | No action |

---

## Waitlist behavior

### Who gets waitlisted
A user is waitlisted when they try to join a squad that's at capacity (`max_squad_size`). This can happen:
- At response time: `cap_down_responses` converts response to 'waitlist'
- At squad join time: `join_squad_if_room` adds as role='waitlist'
- At auto-join time: trigger adds as 'waitlist' if squad is full

### Waitlisted user experience
- Cannot send messages in squad chat (read-only)
- Cannot vote on polls
- Cannot confirm/decline date proposals
- Sees "Waitlisted" badge on squad card
- Gets system message: "{name} is on the waitlist. manifesting a spot"
- Can still un-down to remove themselves entirely

### Promotion from waitlist
When a squad member leaves (or un-downs from the check):
1. `promote_waitlisted_check_response` finds the earliest waitlisted check_response (by `created_at`)
2. Updates their response from 'waitlist' → 'down'
3. This fires the auto-join trigger, which updates their squad role to 'member'
4. System message: "{name} was promoted from the waitlist"
5. Notification: "A spot opened up — you're in!"

Promotion is **FIFO** — earliest responder gets promoted first.

---

## Known bug: cap doesn't account for author's squad slot (as of 2026-04-07)

`cap_down_responses` allows `max_squad_size` 'down' responses, but the author takes one squad slot without having a check_response row. This means one more person gets a 'down' response than can actually fit as a squad member.

**Example**: "Downto fall in love?" has max_squad_size=5. The squad has 5 members (mini mike the author + 4 responders), which is correct. But there are 5 check_responses with response='down' — the 5th 'down' responder (michelle) can never actually get a squad member slot. She has check_response='down' but squad_members.role='waitlist'.

**Fix**: `cap_down_responses` should count the author's reserved slot. The cap should be `max_squad_size - 1` 'down' responses (reserving 1 slot for the author). This way the 5th person to respond gets correctly waitlisted at the check_response level, not just at the squad level.

---

## Shared check flow (via link)

When a check is shared via URL (`/check/[id]`):
- **Not logged in**: "Join to respond" → redirects to auth, then back with `?pendingCheck=` param
- **Logged in, not responded**: "I'm Down 👋" button → calls `/api/checks/respond-shared`
- **Already responded**: Shows "You're down 🙌" + "Open downto" link

Same cap/waitlist logic applies. If the viewer isn't a friend/FoF of the author, they can still respond via the shared link (RLS is bypassed for shared checks).

---

## Edge cases

- **Author responds to own check**: Not allowed (button not shown for authors)
- **Co-authors**: Bypass squad size cap; always get 'down' response regardless of capacity
- **Check expires with waitlisted users**: Waitlisted users stay waitlisted; no auto-promotion on expiry
- **Squad archived**: Waitlist promotion stops; no new members can join
- **User leaves and re-responds**: Gets fresh response; waitlist position resets to end of queue
