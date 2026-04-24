# Events Flow Spec

## Context

Events are scraped from links (Instagram, Resident Advisor, Letterboxd) or created directly. They're shown in feed, calendar, and event detail views. Users can mark "down" to signal interest, which surfaces friends-of-friends social signal and kicks off squad-forming flows.

---

## Event card display

Event cards appear in the feed and "saved" list. They show poster attribution, metadata (date/time/venue/vibe), a DOWN ?/DOWN toggle, an "X is down" responders row, and (when expanded) an avatar stack of people who are down.

### Poster attribution

The event's poster is shown once, in the attribution area near the top of the card (`posterName` + `posterAvatar`). This is the canonical place we surface "who posted this."

### "Is down" responders row

The inline responders row (next to the DOWN button) summarizes who's interested — e.g. "Alice is down" or "Alice + 3 others down".

**Rule**: the event's poster is excluded from this row — they're already shown in the poster attribution area above. Showing them again in "Kat is down" on Kat's own event reads as redundant.

Implementation: filter `event.peopleDown` by `event.createdBy` when computing the first responder and the `othersCount`. The avatar stack and the full EventLobby list are not affected — those show the complete set (including the poster).

If no one else is down, the responders row collapses to nothing. Previously it would have shown the poster alone — the exact redundancy this rule prevents.
