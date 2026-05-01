import type { InterestCheck } from "@/lib/ui-types";

// Curated kitchen-sink of check variations for dev-mode previewing.
// Each entry targets a visual state that's hard to reproduce against real
// data on demand (fresh + new banner, near-expiry red timer, FoF annotation,
// co-author pending tag, movie card, long title wrap, etc).
//
// Enable via the "MOCK" toggle in the feed (dev builds only).
// When the toggle is on, the feed replaces real checks with these.

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
const hoursFromNow = (h: number) => new Date(now + h * 3600_000).toISOString();

const uuid = (n: number) => `dev-mock-${String(n).padStart(12, "0")}`;

/**
 * Mock check IDs that should always render with the "NEW" banner when
 * mock mode is on, regardless of the viewer's lastSeenFeedAt. Lets us
 * preview the banner + non-banner states on the same screen.
 */
export const DEV_MOCK_NEW_IDS: string[] = [
  uuid(1), // Sara / Mubi — fresh dated
  uuid(2), // Leo / coffee — near-expiry
  uuid(8), // Nickon / co-author pending tag
];

export const DEV_MOCK_CHECKS: InterestCheck[] = [
  {
    id: uuid(1),
    text: "downto catch the new Mubi release? they're doing a Miyazaki retro",
    author: "Sara",
    authorId: uuid(101),
    timeAgo: "just now",
    expiresIn: "23h",
    expiryPercent: 4,
    responses: [
      { name: "Devon", avatar: "D", status: "down", odbc: uuid(102) },
      { name: "Mia",   avatar: "M", status: "down", odbc: uuid(103) },
    ],
    eventDate: new Date(now + 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "tomorrow",
    eventTime: "7pm",
    dateFlexible: false,
    timeFlexible: true,
    location: "Metrograph",
    movieTitle: "Spirited Away",
    year: "2001",
    director: "Hayao Miyazaki",
    // Letterboxd CDN hotlink-blocks; Wikimedia serves the same poster
    // and accepts cross-origin <img> requests.
    thumbnail: "https://upload.wikimedia.org/wikipedia/en/d/db/Spirited_Away_Japanese_poster.png",
    vibes: ["cozy", "nostalgia"],
    commentCount: 2,
    createdAt: hoursAgo(0.1),
    expiresAt: hoursFromNow(23),
  },
  {
    id: uuid(2),
    text: "downto grab coffee ☕",
    author: "Leo",
    authorId: uuid(104),
    timeAgo: "12m",
    expiresIn: "43m",
    expiryPercent: 82,
    responses: [],
    eventDate: new Date().toISOString().slice(0, 10),
    eventDateLabel: "today",
    eventTime: "3pm",
    location: "Devoción",
    createdAt: hoursAgo(0.2),
    expiresAt: hoursFromNow(0.7),
  },
  {
    id: uuid(3),
    text: "someone convince me to leave the apartment tonight",
    author: "Kai",
    authorId: uuid(105),
    timeAgo: "6m",
    expiresIn: "open",
    expiryPercent: 0,
    responses: [
      { name: "Nova", avatar: "N", status: "down", odbc: uuid(106) },
    ],
    createdAt: hoursAgo(0.1),
  },
  {
    id: uuid(4),
    text: "going to see Bladee at Elsewhere, who's down",
    author: "Zoe",
    authorId: uuid(107),
    timeAgo: "2h",
    expiresIn: "22h",
    expiryPercent: 9,
    responses: [
      { name: "Finn",  avatar: "F", status: "down", odbc: uuid(108) },
      { name: "Blake", avatar: "B", status: "down", odbc: uuid(109) },
      { name: "Quinn", avatar: "Q", status: "down", odbc: uuid(110) },
      { name: "River", avatar: "R", status: "waitlist", odbc: uuid(111) },
    ],
    eventDate: new Date(now + 4 * 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "Sat, Apr 27",
    eventTime: "10pm",
    location: "Elsewhere (Rooftop)",
    maxSquadSize: 4,
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(22),
  },
  {
    id: uuid(5),
    text: "pickleball sunday morning?",
    author: "Sage",
    authorId: uuid(112),
    timeAgo: "4h",
    expiresIn: "20h",
    expiryPercent: 17,
    responses: [],
    viaFriendName: "Luna",
    eventDate: new Date(now + 3 * 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "Sun, Apr 28",
    eventTime: "10am",
    location: "McCarren Park",
    createdAt: hoursAgo(4),
    expiresAt: hoursFromNow(20),
  },
  {
    id: uuid(6),
    text: "dinner + debate: best natural wine bar in Greenpoint",
    author: "you",
    authorId: uuid(999),
    timeAgo: "1h",
    expiresIn: "23h",
    expiryPercent: 4,
    responses: [
      { name: "You",   avatar: "Y", status: "down", odbc: uuid(999) },
      { name: "Marco", avatar: "M", status: "down", odbc: uuid(113) },
    ],
    isYours: true,
    eventDate: new Date(now + 2 * 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "Fri, Apr 26",
    eventTime: "7:30pm",
    location: "Four Horsemen → ??? → ???",
    createdAt: hoursAgo(1),
    expiresAt: hoursFromNow(23),
  },
  {
    id: uuid(7),
    text: "tuesday morning run — williamsburg bridge loop @alex",
    author: "Jess",
    authorId: uuid(114),
    timeAgo: "3h",
    expiresIn: "45h",
    expiryPercent: 6,
    responses: [],
    eventDate: new Date(now + 5 * 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "Tue, Apr 30",
    eventTime: "7am",
    coAuthors: [
      { userId: uuid(115), name: "Alex", avatar: "A", status: "accepted" },
    ],
    createdAt: hoursAgo(3),
    expiresAt: hoursFromNow(45),
  },
  {
    id: uuid(8),
    text: "you've been tagged — Nickon wants you in on their dinner plans",
    author: "Nickon",
    authorId: uuid(116),
    timeAgo: "just now",
    expiresIn: "24h",
    expiryPercent: 1,
    responses: [],
    coAuthors: [
      { userId: uuid(999), name: "You", avatar: "Y", status: "pending" },
    ],
    pendingTagForYou: true,
    eventDate: new Date(now + 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "tomorrow",
    eventTime: "8pm",
    location: "Lilia",
    createdAt: hoursAgo(0.1),
    expiresAt: hoursFromNow(24),
  },
  {
    // Mystery hangout pre-reveal: full ?-rectangle border, redacted
    // wingdings author, hidden responder list, kaomoji-fied comments.
    // mysteryUnrevealed and mysteryGuestsHidden are normally derived in
    // useChecks.transformCheck; we set them directly here so the mock
    // doesn't depend on event_date math at render time.
    id: uuid(9),
    text: "downto come to a mystery hangout",
    author: "???",
    authorId: uuid(117),
    timeAgo: "30m",
    expiresIn: "23h",
    expiryPercent: 4,
    responses: [],
    eventDate: new Date(now + 9 * 86400_000).toISOString().slice(0, 10),
    eventDateLabel: "Sat, May 9",
    eventTime: "8pm",
    location: "secret location · revealed day-of",
    mystery: true,
    mysteryUnrevealed: true,
    mysteryGuestsHidden: true,
    createdAt: hoursAgo(0.5),
    expiresAt: hoursFromNow(23),
  },
];
