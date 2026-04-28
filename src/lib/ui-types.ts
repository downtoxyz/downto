export interface Person {
  name: string;
  avatar: string;
  mutual: boolean;
  userId?: string;
  inPool?: boolean;
  inSquadId?: string;
  inSquadName?: string;
}

export interface Event {
  id: string;
  createdBy?: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  image: string;
  igHandle: string;
  igUrl?: string;
  diceUrl?: string;
  letterboxdUrl?: string;
  movieTitle?: string;
  movieYear?: string;
  movieDirector?: string;
  movieThumbnail?: string;
  note?: string;
  saved: boolean;
  isDown: boolean;
  peopleDown: Person[];
  isPublic?: boolean;
  visibility?: 'public' | 'friends';
  posterName?: string;
  posterAvatar?: string;
  neighborhood?: string;
  rawDate?: string;
  poolCount?: number;
  userInPool?: boolean;
  socialLoaded?: boolean;
  createdAt?: string;
}

export interface InterestCheck {
  id: string;
  text: string;
  author: string;
  authorId?: string;
  timeAgo: string;
  expiresIn: string;
  expiryPercent: number;
  responses: { name: string; avatar: string; status: "down" | "waitlist"; odbc?: string }[];
  isYours?: boolean;
  eventDate?: string;
  eventDateLabel?: string;
  eventTime?: string;
  dateFlexible?: boolean;
  timeFlexible?: boolean;
  location?: string;
  maxSquadSize?: number | null;
  squadId?: string;
  squadMemberCount?: number;
  inSquad?: boolean;
  isWaitlisted?: boolean;
  movieTitle?: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  letterboxdUrl?: string;
  vibes?: string[];
  viaFriendName?: string;
  coAuthors?: { userId: string; name: string; avatar: string; status: 'pending' | 'accepted' | 'declined' }[];
  isCoAuthor?: boolean;
  pendingTagForYou?: boolean;
  commentCount?: number;
  createdAt?: string;
  expiresAt?: string;
  /** True iff this check was posted as `mystery=true`. */
  mystery?: boolean;
  /** True for non-authors viewing a mystery check before event_date arrives.
   *  Used to redact the author identity (name + avatar). Author sees their own
   *  identity unredacted (it's their own check). */
  mysteryUnrevealed?: boolean;
  /** True for ANYONE — including the author — viewing a mystery check pre-reveal.
   *  Used to hide the responder list, count, and squad data. The host doesn't
   *  know if the room filled until the reveal. */
  mysteryGuestsHidden?: boolean;
}

export interface ScrapedEvent {
  type?: "event" | "movie";
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  igHandle: string;
  isPublicPost: boolean;
  igUrl?: string;
  movieTitle?: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  letterboxdUrl?: string;
  diceUrl?: string;
  raUrl?: string;
  note?: string;
}

export interface Squad {
  id: string;
  checkId?: string;
  eventId?: string;
  checkAuthorId?: string;
  name: string;
  event?: string;
  eventDate?: string;
  eventIsoDate?: string;
  eventTime?: string;
  eventLocation?: string;
  dateFlexible?: boolean;
  timeFlexible?: boolean;
  maxSquadSize?: number | null;
  members: { name: string; avatar: string; userId?: string }[];
  waitlistedMembers?: { name: string; avatar: string; userId: string }[];
  downResponders?: { name: string; avatar: string; userId: string }[];
  dateStatus?: 'proposed' | 'locked';
  messages: { id?: string; sender: string; text: string; time: string; isYou?: boolean; messageType?: 'date_confirm' | 'poll'; messageId?: string; imagePath?: string; imageWidth?: number; imageHeight?: number; imagePreviewUrl?: string }[];
  lastMsg: string;
  time: string;
  meetingSpot?: string;
  arrivalTime?: string;
  transportNotes?: string;
  expiresAt?: string;
  graceStartedAt?: string;
  hasUnread?: boolean;
  isWaitlisted?: boolean;
  lastActivityAt?: string;
}

export interface Friend {
  id: string;
  friendshipId?: string;
  name: string;
  username: string;
  avatar: string;
  status: "friend" | "pending" | "incoming" | "none";
  availability?: "open" | "awkward" | "not-available";
  igHandle?: string;
  mutualFriendName?: string;
}

export type AvailabilityStatus = "open" | "not-available" | "awkward";

export const TABS = ["feed", "squads", "profile"] as const;
export type Tab = (typeof TABS)[number];

export const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string; emoji: string; color: string }[] = [
  { value: "open", label: "open to friends!", emoji: "✨", color: "var(--color-dt)" },
  { value: "awkward", label: "available, but awkward", emoji: "👀", color: "#ffaa5a" },
  { value: "not-available", label: "not available rn", emoji: "🌙", color: "#666" },
];

export const EXPIRY_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "tonight", label: "tonight" },
  { value: "tomorrow", label: "tomorrow" },
  { value: "custom", label: "custom..." },
  { value: "none", label: "until I change it" },
];
