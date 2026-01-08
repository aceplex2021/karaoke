import type {
  Room,
  User,
  Song,
  QueueItem,
  CreateRoomRequest,
  JoinRoomRequest,
  AddToQueueRequest,
  SongGroupResult,
  GroupVersionsResponse,
  RoomState,
} from '../shared/types';

const API_BASE = '/api';

export const api = {
  // Rooms
  async createRoom(data: CreateRoomRequest): Promise<{ room: Room; user: User }> {
    const res = await fetch(`${API_BASE}/rooms/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    // Check if response is actually JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Non-JSON response:', text.substring(0, 200));
      throw new Error(`Server returned ${res.status}: ${text.substring(0, 100)}`);
    }
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Failed to create room: ${res.status}`);
    }
    
    return res.json();
  },

  async getRoomByCode(code: string): Promise<{ room: Room }> {
    const res = await fetch(`${API_BASE}/rooms/code/${code}`);
    if (!res.ok) throw new Error('Room not found');
    return res.json();
  },

  async getRoom(roomId: string): Promise<{ room: Room }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}`);
    if (!res.ok) throw new Error('Room not found');
    return res.json();
  },

  async getRoomState(roomId: string): Promise<RoomState> {
    // Prevent caching: append timestamp to ensure fresh data
    const res = await fetch(`${API_BASE}/rooms/${roomId}/state?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to get room state');
    return res.json();
  },

  async joinRoom(data: JoinRoomRequest): Promise<{ room: Room; user: User }> {
    const res = await fetch(`${API_BASE}/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to join room');
    return res.json();
  },

  // Songs - Group-aware search (per Songs_API_Contract.md)
  async searchSongs(params: {
    q?: string;
    limit?: number;
  }): Promise<{ query: string; results: SongGroupResult[] }> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.limit) query.set('limit', params.limit.toString());

    const url = `${API_BASE}/songs/search?${query}`;
    console.log('Group-aware search URL:', url);
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Search failed:', res.status, errorText);
      throw new Error(`Search failed: ${res.status} ${errorText}`);
    }
    
    const data = await res.json();
    console.log('Search response:', data);
    return data;
  },

  // Get versions for a song group
  async getGroupVersions(groupId: string): Promise<GroupVersionsResponse> {
    const url = `${API_BASE}/songs/group/${groupId}/versions`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Get versions failed:', res.status, errorText);
      throw new Error(`Failed to get versions: ${res.status} ${errorText}`);
    }
    
    return res.json();
  },

  async getSong(songId: string): Promise<{ song: Song }> {
    const res = await fetch(`${API_BASE}/songs/${songId}`);
    if (!res.ok) throw new Error('Song not found');
    return res.json();
  },

  async getHistory(roomId: string, userId: string): Promise<{ history: any[] }> {
    const res = await fetch(`${API_BASE}/songs/history/${roomId}/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },

  // Queue
  async getQueue(roomId: string): Promise<{ queue: QueueItem[] }> {
    const res = await fetch(`${API_BASE}/queue/${roomId}`);
    if (!res.ok) throw new Error('Failed to fetch queue');
    return res.json();
  },

  async addToQueue(data: AddToQueueRequest): Promise<{ queueItem: QueueItem }> {
    const res = await fetch(`${API_BASE}/queue/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to add to queue: ${errorText}`);
    }
    return res.json();
  },

  // Backend-controlled playback (TV mode)
  async getCurrentSong(roomId: string): Promise<{ queueItem: QueueItem | null }> {
    const res = await fetch(`${API_BASE}/queue/${roomId}/current`);
    if (!res.ok) throw new Error('Failed to get current song');
    return res.json();
  },

  async reportPlaybackEnded(roomId: string, queueItemId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/${roomId}/playback-ended`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueItemId }),
    });
    if (!res.ok) throw new Error('Failed to report playback ended');
  },

  async reportPlaybackError(roomId: string, queueItemId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/${roomId}/playback-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueItemId }),
    });
    if (!res.ok) throw new Error('Failed to report playback error');
  },

  async markAsCompleted(
    queueItemId: string,
    roomId: string,
    userId: string,
    songId: string
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/item/${queueItemId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, user_id: userId, song_id: songId }),
    });
    if (!res.ok) throw new Error('Failed to mark as completed');
  },

  async skipSong(queueItemId: string, roomId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/item/${queueItemId}/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId }),
    });
    if (!res.ok) throw new Error('Failed to skip song');
  },

  async removeFromQueue(queueItemId: string, roomId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/item/${queueItemId}?room_id=${roomId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to remove from queue');
  },

  async reorderQueue(
    queueItemId: string,
    newPosition: number,
    roomId: string
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/queue/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue_item_id: queueItemId,
        new_position: newPosition,
        room_id: roomId,
      }),
    });
    if (!res.ok) throw new Error('Failed to reorder queue');
  },
};

