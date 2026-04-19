// ============================================================================
// Database Types - Matches Supabase schema
// ============================================================================

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_letter: string;
  availability: 'open' | 'awkward' | 'not-available';
  ig_handle: string | null;
  onboarded: boolean;
  is_test: boolean;
  timezone: string;
  theme_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  title: string;
  venue: string | null;
  neighborhood: string | null;
  date: string | null; // ISO date
  date_display: string | null; // "Fri, Feb 14"
  time_display: string | null; // "11PM-5AM"
  vibes: string[];
  image_url: string | null;
  ig_handle: string | null;
  ig_url: string | null;
  dice_url: string | null;
  letterboxd_url: string | null;
  ra_url: string | null;
  movie_metadata: {
    title: string;
    year?: string;
    director?: string;
    thumbnail?: string;
    vibes?: string[];
  } | null;
  note: string | null;
  is_public: boolean;
  visibility: 'public' | 'friends';
  created_by: string | null;
  created_at: string;
  // Joined data
  creator?: { display_name: string; avatar_letter: string } | null;
}

export interface SavedEvent {
  id: string;
  user_id: string;
  event_id: string;
  is_down: boolean;
  saved_at: string;
  // Joined data
  event?: Event;
  user?: Profile;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
  // Joined data
  requester?: Profile;
  addressee?: Profile;
}

export interface InterestCheck {
  id: string;
  author_id: string;
  text: string;
  expires_at: string | null;
  event_date: string | null; // ISO date from natural language parsing
  event_time: string | null; // display time like "7 PM"
  date_flexible: boolean;
  time_flexible: boolean;
  location: string | null;
  max_squad_size: number;
  letterboxd_url: string | null;
  ra_url: string | null;
  movie_metadata: {
    title: string;
    year?: string;
    director?: string;
    thumbnail?: string;
    vibes?: string[];
  } | null;
  archived_at: string | null;
  created_at: string;
  // Joined data
  author?: Profile;
  responses?: CheckResponse[];
}

export interface CheckResponse {
  id: string;
  check_id: string;
  user_id: string;
  response: 'down' | 'waitlist';
  created_at: string;
  // Joined data
  user?: Profile;
}

export interface CheckCoAuthor {
  id: string;
  check_id: string;
  user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  // Joined data
  user?: Profile;
}

export interface CheckComment {
  id: string;
  check_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user?: Profile;
}

export interface Squad {
  id: string;
  name: string;
  event_id: string | null;
  check_id: string | null;
  created_by: string;
  created_at: string;
  meeting_spot: string | null;
  arrival_time: string | null;
  transport_notes: string | null;
  expires_at: string | null;
  grace_started_at: string | null;
  warned_at: string | null;
  locked_date: string | null;
  date_status: string | null;
  archived_at: string | null;
  // Joined data
  event?: Event;
  check?: InterestCheck;
  members?: SquadMember[];
  messages?: Message[];
}

export interface CrewPoolEntry {
  id: string;
  event_id: string;
  user_id: string;
  joined_at: string;
  // Joined data
  user?: Profile;
}

export interface SquadMember {
  id: string;
  squad_id: string;
  user_id: string;
  joined_at: string;
  role?: string;
  // Joined data
  user?: Profile;
}

export interface Message {
  id: string;
  squad_id: string;
  sender_id: string | null;
  text: string;
  created_at: string;
  is_system: boolean;
  message_type: string;
  // Joined data
  sender?: Profile;
}

export interface SquadJoinRequest {
  id: string;
  squad_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  user?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'friend_request' | 'friend_accepted' | 'check_response' | 'squad_message' | 'squad_invite' | 'friend_check' | 'date_confirm' | 'check_tag' | 'check_comment' | 'poll_created' | 'squad_join_request' | 'squad_mention' | 'comment_mention' | 'friend_event' | 'event_reminder' | 'event_down' | 'check_date_updated' | 'event_date_updated' | 'event_comment';
  title: string;
  body: string | null;
  related_user_id: string | null;
  related_squad_id: string | null;
  related_check_id: string | null;
  related_event_id: string | null;
  is_read: boolean;
  created_at: string;
  // Joined data
  related_user?: Profile;
}

// ============================================================================
// Frontend View Types - Transformed for UI consumption
// ============================================================================

export interface EventView {
  id: string;
  title: string;
  venue: string;
  neighborhood?: string;
  date: string;
  time: string;
  vibe: string[];
  image: string;
  igHandle: string;
  saved: boolean;
  isDown: boolean;
  isPublic?: boolean;
  peopleDown: PersonDown[];
}

export interface PersonDown {
  name: string;
  avatar: string;
  mutual: boolean;
}

export interface InterestCheckView {
  id: string;
  text: string;
  author: string;
  authorId: string;
  timeAgo: string;
  expiresIn: string;
  expiryPercent: number;
  responses: CheckResponseView[];
}

export interface CheckResponseView {
  name: string;
  avatar: string;
  status: 'down' | 'waitlist';
}

export interface SquadView {
  id: string;
  name: string;
  event?: string;
  members: { name: string; avatar: string }[];
  messages: MessageView[];
  lastMsg: string;
  time: string;
}

export interface MessageView {
  sender: string;
  text: string;
  time: string;
  isYou?: boolean;
}

export interface FriendView {
  id: string;
  name: string;
  username: string;
  avatar: string;
  status: 'friend' | 'pending' | 'incoming' | 'none';
  availability?: 'open' | 'awkward' | 'not-available';
}

// ============================================================================
// API Types
// ============================================================================

export interface ScrapedEvent {
  title: string;
  venue: string;
  date: string;
  time: string;
  vibes: string[];
  image: string;
  igHandle: string;
  igUrl: string;
}
