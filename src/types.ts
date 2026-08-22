export type MatchType = 'tournament' | 'squad' | 'duo' | 'solo' | 'tdm' | 'wow';
export type MapType = 'Erangel' | 'Miramar' | 'Sanhok' | 'Vikendi' | 'Warehouse' | 'Livik' | 'WOW';
export type MatchStatus = 'upcoming' | 'upcoming_announcement' | 'room_published' | 'live' | 'completed';

export interface PrizeBreakdown {
  first_prize: number;
  second_prize?: number;
  third_prize?: number;
  per_kill_prize?: number;
  total_pool: number;
}

export interface RoomCredential {
  map_index?: number;
  map_name?: string;
  room_id?: string;
  room_password?: string;
  release_time_ms?: number;
  release_timer_minutes?: number;
}

export interface Match {
  id: string;
  title: string;
  type: MatchType;
  map: MapType;
  match_time: string; // e.g. "6 August | 07:00 PM (PKT)" or ISO
  timestamp: number;
  entry_fee: number; // in PKR (RS)
  prizes: PrizeBreakdown;
  max_slots: number;
  booked_slots: number;
  room_id?: string;
  room_password?: string;
  room_credentials?: RoomCredential[];
  status: MatchStatus;
  rules: string[];
  banner_url?: string;
  squad_type: 'SOLO' | 'DUO' | 'SQUAD';
  version: string; // e.g. "PUBG Mobile v3.5"
  maps?: string[]; // for multi-map tournaments (e.g. ['Erangel', 'Miramar', 'Rondo'])
  registration_opens_at?: number; // timestamp in ms when booking opens
  map_banners?: string[]; // custom uploaded thumbnails for each map in a tournament
  map_max_slots?: number[]; // custom max slots for each map in multi-map tournaments
  locked_slots?: number[]; // list of slot numbers locked by admin
  start_timestamp?: number; // target start timestamp in ms
  is_ended?: boolean;
  start_time?: string | number;
  gap_minutes?: number;
}

export interface SlotBooking {
  id: string;
  match_id: string;
  user_id?: string | null;
  player_id?: string | null;
  team_name?: string;
  player_ign: string;
  player_uid?: string;
  teammate_uids?: string[];
  slot_number: number;
  booking_time?: string;
  created_at?: string;
  status: 'confirmed' | 'cancelled' | string;
  paid_amount?: number;
  is_admin_booked?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name: string;
  pubg_name?: string;
  pubg_id_name: string;
  pubg_id_number: string;
  wallet_balance: number;
  role: 'player' | 'admin';
  is_admin?: boolean;
  total_matches: number;
  matches_played?: number;
  total_wins: number;
  total_kills: number;
  total_earnings?: number;
  total_losses?: number;
  matches_lost?: number;
  avatar_url?: string;
  phone_number?: string;
  created_at: string;
  last_seen?: string;
  is_new?: boolean;
  is_banned?: boolean;
  ban_expires_at?: string | null;
  ban_reason?: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  username?: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'match_entry' | 'match_winning' | 'reward_adjustment';
  payment_method?: 'JazzCash' | 'EasyPaisa' | 'SadaPay' | 'NayaPay' | 'Wallet' | string;
  account_number?: string;
  account_title?: string;
  sender_name?: string;
  trx_id?: string;
  screenshot_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  created_at: string;
  updated_at?: string;
}

export interface PlayerResult {
  slot_number: number;
  player_ign: string;
  player_uid?: string;
  username?: string;
  user_id?: string;
  team_name?: string;
  kills: number;
  is_winner: boolean;
  is_win?: boolean;
  rank?: number;
  points?: number; // Total points for tournament matches
  winning_prize?: number | string; // Admin-specified winning prize (display only)
  prize_display?: number | string;
  earnings?: number;
}

export interface MatchResult {
  id?: string | number;
  match_id: string;
  match_title: string;
  match_type: MatchType;
  squad_type: 'SOLO' | 'DUO' | 'SQUAD';
  map?: string;
  match_time?: string;
  total_prize_pool?: number;
  tournament_matches_count?: number; // e.g. 3, 4, 6 matches
  result_image_url?: string; // Optional result screenshot uploaded by admin
  screenshot_url?: string;
  result_image_aspect?: '16:9' | '9:16' | 'auto';
  team_prizes?: { [teamKey: string]: number | string };
  published_at: string;
  results: PlayerResult[];
  is_published: boolean;
}

export interface LeaderboardPlayer {
  rank: number;
  username: string;
  pubg_id: string;
  kills: number;
  wins: number;
  earnings: number;
  badge: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface BanRecord {
  id: string;
  user_id?: string;
  username: string;
  reason?: string;
  duration: string;
  expires_at: number | null; // Timestamp in ms. null for permanent.
  created_at: string;
}

export interface AccountDeletionRequest {
  id: string;
  user_id: string;
  username: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_pubg_name?: string;
  receiver_id: string; // 'admin' or player user_id
  message_text: string;
  created_at: string;
  is_read: boolean;
}

export interface Notification {
  id: string;
  user_id: string | null; // null for public, specific user ID for private
  title: string;
  message: string;
  is_read: boolean;
  type: string;
  match_id?: string;
  announcement_id?: string;
  image?: string;
  created_at: string;
}

export interface Rule {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export interface RulesConfig {
  id: string;
  content: string;
  updated_at: string;
}

export interface LiveStream {
  id: string;
  title: string;
  youtube_url: string;
  viewers_count?: string;
  thumbnail_url: string;
  is_active: boolean;
  created_at: string;
}

export interface FriendItem {
  id: string; // friend user_id
  username: string;
  name: string;
  pubg_id_name: string;
  pubg_id_number: string;
  avatar_url?: string;
  status: 'online' | 'offline';
  last_seen?: string;
  last_message?: string;
  last_message_time?: string;
}

export interface FriendRequestItem {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_name?: string;
  sender_avatar?: string;
  sender_pubg_name?: string;
  sender_pubg_id?: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar?: string;
  receiver_id: string;
  message_text: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  created_at: string;
  is_read: boolean;
}

export interface LeaderboardVideo {
  category: string; // 'kills' | 'wins' | 'matches' | 'rewards'
  rank: number; // 1 | 2 | 3
  video_url: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  sort_order: number;
}

export interface PollVoter {
  user_id: string;
  username: string;
  avatar_url?: string;
  name?: string;
  option_id: string;
  option_text?: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at?: string;
}

export interface Poll {
  id: string;
  question: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  options: PollOption[];
  votes: PollVote[];
  voters?: PollVoter[];
  total_votes?: number;
}