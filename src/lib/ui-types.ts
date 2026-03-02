export interface Person {
  name: string;
  avatar: string;
  mutual: boolean;
  userId?: string;
  inPool?: boolean;
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
  saved: boolean;
  isDown: boolean;
  peopleDown: Person[];
  isPublic?: boolean;
  neighborhood?: string;
  rawDate?: string;
  poolCount?: number;
  userInPool?: boolean;
}

export interface InterestCheck {
  id: string;
  text: string;
  author: string;
  authorId?: string;
  timeAgo: string;
  expiresIn: string;
  expiryPercent: number;
  responses: { name: string; avatar: string; status: "down" | "maybe" | "nah"; odbc?: string }[];
  isYours?: boolean;
  eventDate?: string;
  eventDateLabel?: string;
  eventTime?: string;
  dateFlexible?: boolean;
  timeFlexible?: boolean;
  maxSquadSize?: number;
  squadId?: string;
  squadMemberCount?: number;
  inSquad?: boolean;
  movieTitle?: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  letterboxdUrl?: string;
  vibes?: string[];
  viaFriendName?: string;
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
}

export interface Squad {
  id: string;
  checkId?: string;
  checkAuthorId?: string;
  name: string;
  event?: string;
  eventDate?: string;
  eventIsoDate?: string;
  members: { name: string; avatar: string; userId?: string }[];
  dateStatus?: 'proposed' | 'locked';
  messages: { sender: string; text: string; time: string; isYou?: boolean; messageType?: 'date_confirm'; messageId?: string }[];
  lastMsg: string;
  time: string;
  meetingSpot?: string;
  arrivalTime?: string;
  transportNotes?: string;
  expiresAt?: string;
  graceStartedAt?: string;
  hasUnread?: boolean;
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
}

export type AvailabilityStatus = "open" | "not-available" | "awkward";

export const TABS = ["feed", "calendar", "groups", "profile"] as const;
export type Tab = (typeof TABS)[number];

export const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string; emoji: string; color: string }[] = [
  { value: "open", label: "open to friends!", emoji: "✨", color: "#E8FF5A" },
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
