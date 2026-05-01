import type { Event } from "@/lib/ui-types";

// Curated kitchen-sink of event variations for dev-mode previewing,
// parallel to devMockChecks. Lets us see how event cards render with
// the NEW pill, public/friends visibility, peopleDown, pool state,
// hero images, etc — without having to wait for a real event to come
// in or fiddle with createdAt timestamps.
//
// Toggled together with DEV_MOCK_CHECKS via the same MOCK switch.

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

const uuid = (n: number) => `dev-mock-event-${String(n).padStart(8, "0")}`;

/**
 * Mock event IDs that should always render with the "NEW" pill when
 * mock mode is on. Matches the DEV_MOCK_NEW_IDS pattern for checks.
 */
export const DEV_MOCK_NEW_EVENT_IDS: string[] = [
  uuid(1), // Bladee — fresh, has hero image
  uuid(3), // Persian dinner — friends-only with comments
];

export const DEV_MOCK_EVENTS: Event[] = [
  {
    id: uuid(1),
    title: "Bladee @ Elsewhere (Rooftop)",
    venue: "Elsewhere",
    date: "Sat, Jun 14",
    time: "10pm",
    rawDate: new Date(now + 7 * 86400_000).toISOString().slice(0, 10),
    vibe: ["live", "rooftop"],
    image: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&q=80",
    igHandle: "elsewherebrooklyn",
    igUrl: "https://instagram.com/elsewherebrooklyn",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "Finn",  avatar: "F", mutual: true },
      { name: "Blake", avatar: "B", mutual: true },
      { name: "Quinn", avatar: "Q", mutual: false },
    ],
    isPublic: true,
    visibility: "public",
    posterName: "elsewhere",
    posterAvatar: "E",
    socialLoaded: true,
    createdAt: hoursAgo(0.2),
  },
  {
    id: uuid(2),
    title: "Joji",
    venue: "Barclays Center",
    date: "Fri, Jun 26",
    time: "7pm",
    rawDate: new Date(now + 21 * 86400_000).toISOString().slice(0, 10),
    vibe: [],
    image: "",
    igHandle: "",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "gian", avatar: "G", mutual: true },
    ],
    isPublic: false,
    visibility: "friends",
    posterName: "sarah f",
    posterAvatar: "S",
    socialLoaded: true,
    createdAt: hoursAgo(8),
  },
  {
    id: uuid(3),
    title: "Come over for homemade Persian food",
    venue: "383 bushwick ave",
    date: "Mon, May 11",
    time: "7pm",
    rawDate: new Date(now + 10 * 86400_000).toISOString().slice(0, 10),
    vibe: ["dinner", "homemade"],
    image: "",
    igHandle: "",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "aidanfox", avatar: "A", mutual: true },
      { name: "minnie",   avatar: "M", mutual: true },
      { name: "haowie",   avatar: "H", mutual: true },
    ],
    isPublic: false,
    visibility: "friends",
    posterName: "ashkon",
    posterAvatar: "A",
    socialLoaded: true,
    createdAt: hoursAgo(0.5),
  },
];
