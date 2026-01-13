// Shared types between frontend and backend

export interface Room {
  id: string;
  room_code: string;
  room_name: string;
  host_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  subscription_tier: string;
  expires_at: string | null;
  current_entry_id: string | null; // Backend-controlled: current playing queue entry
  last_singer_id: string | null; // Round-robin cursor: last singer who had a turn
}

export interface User {
  id: string;
  fingerprint: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  preferred_language: string;
  created_at: string;
  last_seen_at: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  language: string;
  youtube_id: string | null;
  file_path: string;
  duration: number | null;
  created_at: string;
  media_url?: string; // Computed by backend: full URL to media file
}

// Group-aware search types (per Songs_API_Contract.md)
export interface VersionFile {
  file_id: string;
  storage_path: string;
  play_url: string;
}

export interface VersionInfo {
  version_id: string;
  label: string | null; // Mixer type (nam, nu, nam_nu, beat, etc.)
  tone: "nam" | "nu" | null;
  pitch: string | null;
  tempo: number | null; // BPM
  is_default: boolean; // Recommended version flag
  styles: string[];
  file: VersionFile;
}

export interface SongGroupResult {
  group_id: string;
  display_title: string;
  normalized_title: string;
  artists: string[];
  best_version: VersionInfo;
  available: {
    version_count: number;
    tones: string[];
    styles: string[];
  };
}

export interface SearchSongsResponse {
  query: string;
  results: SongGroupResult[];
}

export interface GroupVersion {
  version_id: string;
  label: string | null; // Mixer type (nam, nu, nam_nu, beat, etc.)
  tone: string | null;
  pitch: string | null;
  tempo: number | null; // BPM
  is_default: boolean; // Recommended version flag
  styles: string[];
  duration_s: number | null;
  file: VersionFile;
}

export interface GroupVersionsResponse {
  group_id: string;
  title: string;
  versions: GroupVersion[];
}

export interface QueueItem {
  id: string;
  room_id: string;
  song_id: string;
  user_id: string;
  position: number;
  status: 'pending' | 'playing' | 'completed' | 'skipped';
  added_at: string;
  started_at: string | null;
  completed_at: string | null;
  round_number: number;
  host_override: boolean;
  host_override_position: number | null;
  // Joined data
  song?: Song;
  user?: User;
}

export interface SongHistory {
  id: string;
  room_id: string;
  user_id: string;
  song_id: string;
  sung_at: string;
  times_sung: number;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  last_active_at: string;
  role: 'participant' | 'host';
}

export interface CreateRoomRequest {
  room_name: string;
  host_fingerprint: string;
  host_display_name?: string;
}

export interface JoinRoomRequest {
  room_code: string;
  user_fingerprint: string;
  display_name?: string;
}

export interface AddToQueueRequest {
  room_id: string;
  song_id?: string; // Legacy: for backward compatibility
  version_id?: string; // New: preferred way to add songs
  user_id: string;
}

export interface ReorderQueueRequest {
  room_id: string;
  queue_item_id: string;
  new_position: number;
}

/**
 * Room state response (read-only, canonical source of truth)
 * Used by /api/rooms/:roomId/state endpoint
 */
export interface RoomState {
  room: Room;
  currentSong: QueueItem | null; // Currently playing song (if any)
  queue: QueueItem[]; // Ledger order (all pending + playing items, by position)
  upNext: QueueItem | null; // Turn order (next to play via round-robin, informational only)
}

