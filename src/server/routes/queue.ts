import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { QueueManager } from '../lib/queue';
import { config } from '../config';
import type { QueueItem, AddToQueueRequest, ReorderQueueRequest, RoomState, Song } from '../../shared/types';

const router = Router();

/**
 * Extract basename (filename only) from storage_path
 * Removes folder prefixes, encoded slashes, and path separators
 * media_url must never include %2F or /Videos
 */
function extractBasename(storagePath: string): string {
  if (!storagePath) return '';
  
  // First decode any URL-encoded characters (e.g., %2F -> /)
  let decoded = decodeURIComponent(storagePath);
  
  // Remove any leading/trailing slashes and whitespace
  decoded = decoded.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  
  // Split by any path separator (/ or \)
  const parts = decoded.split(/[/\\]+/);
  
  // Take the last part (filename)
  const basename = parts[parts.length - 1];
  
  // Remove any remaining encoded slashes or folder prefixes
  return basename.replace(/%2F/gi, '').replace(/^Videos[/\\]/i, '');
}

/**
 * Resolve media URLs for queue items in a single batch query (no N+1)
 * All media selection logic (version preference, remix rules, fallback) lives here.
 * This is the single source of truth for media URL resolution.
 * Always builds media_url from basename (filename only), no folder prefixes, no encoded slashes.
 */
async function resolveMediaUrlsForQueue(queueItems: QueueItem[]): Promise<QueueItem[]> {
  if (!queueItems || queueItems.length === 0) {
    return [];
  }

  // Extract unique song_ids
  const songIds = Array.from(new Set(
    queueItems
      .filter(item => item.song_id)
      .map(item => item.song_id)
  ));

  if (songIds.length === 0) {
    return queueItems;
  }

  // Single batch query: fetch all versions and files for all songs
  const { data: versionsData, error: versionsError } = await supabaseAdmin
    .from('kara_versions')
    .select(`
      id,
      song_id,
      label,
      kara_files!inner(
        id,
        storage_path,
        type
      )
    `)
    .in('song_id', songIds)
    .eq('kara_files.type', 'video');

  if (versionsError) {
    console.error('Failed to fetch versions for media URLs:', versionsError);
    // Fallback: use file_path from song (extract basename)
    return queueItems.map(item => {
      if (item.song && item.song.file_path) {
        const basename = extractBasename(item.song.file_path);
        return {
          ...item,
          song: {
            ...item.song,
            media_url: `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`
          }
        };
      }
      return item;
    });
  }

  // Build a map: song_id -> best version file
  const songIdToFile = new Map<string, { storage_path: string }>();

  for (const version of versionsData || []) {
    if (!version.song_id) continue;

    const files = Array.isArray(version.kara_files) 
      ? version.kara_files 
      : version.kara_files ? [version.kara_files] : [];

    if (files.length === 0) continue;

    const file = files[0]; // Take first file (should only be one video per version)
    
    // Version selection rules (prefer "nam", avoid remix)
    const isNam = version.label && (version.label === 'nam' || version.label.startsWith('nam_'));
    const isRemix = version.label && version.label.includes('remix');
    
    // If we don't have a version for this song yet, or this is better, use it
    if (!songIdToFile.has(version.song_id)) {
      songIdToFile.set(version.song_id, file);
    } else {
      // Prefer "nam" non-remix versions
      const current = songIdToFile.get(version.song_id)!;
      const currentVersion = versionsData?.find(v => 
        v.song_id === version.song_id && 
        (Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files)?.storage_path === current.storage_path
      );
      const currentIsNam = currentVersion?.label && (currentVersion.label === 'nam' || currentVersion.label.startsWith('nam_'));
      const currentIsRemix = currentVersion?.label && currentVersion.label.includes('remix');

      if (isNam && !isRemix && (!currentIsNam || currentIsRemix)) {
        songIdToFile.set(version.song_id, file);
      } else if (!isRemix && currentIsRemix) {
        songIdToFile.set(version.song_id, file);
      }
    }
  }

  // Attach media_url to each queue item
  return queueItems.map(item => {
    if (!item.song || !item.song_id) {
      return item;
    }

    const file = songIdToFile.get(item.song_id);
    
    if (file && file.storage_path) {
      // Extract basename only (no folder prefixes, no encoded slashes)
      const basename = extractBasename(file.storage_path);
      return {
        ...item,
        song: {
          ...item.song,
          media_url: `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`
        } as Song
      };
    }

    // Fallback to song file_path if no version file found (extract basename)
    if (item.song.file_path) {
      const basename = extractBasename(item.song.file_path);
      return {
        ...item,
        song: {
          ...item.song,
          media_url: `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`
        } as Song
      };
    }

    return item;
  });
}

/**
 * Get queue for a room
 */
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const { data: queueItems, error } = await supabaseAdmin
      .from('kara_queue')
      .select(
        `
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `
      )
      .eq('room_id', roomId)
      .in('status', ['pending', 'playing', 'completed', 'skipped'])
      .order('position', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch queue: ${error.message}`);
    }

    // Add full media URL to songs
    // Since version_id column doesn't exist, we'll get the best version for each song
    const queueWithUrls = await Promise.all((queueItems || []).map(async (item: any) => {
      if (!item.song || !item.song_id) {
        return item;
      }

      // Get the best version for this song (prefer "nam", non-remix)
      try {
        const { data: versions } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            label,
            kara_files!inner(
              id,
              storage_path,
              type
            )
          `)
          .eq('song_id', item.song_id)
          .eq('kara_files.type', 'video');

        if (versions && versions.length > 0) {
          // Find best version (prefer "nam", non-remix)
          const namVersion = versions.find((v: any) => 
            v.kara_files && v.kara_files.length > 0 && 
            v.label && (v.label === 'nam' || v.label.startsWith('nam_')) &&
            !v.label.includes('remix')
          );
          const bestVersion = namVersion || versions[0];
          
          if (bestVersion && bestVersion.kara_files && bestVersion.kara_files.length > 0) {
            const file = Array.isArray(bestVersion.kara_files) 
              ? bestVersion.kara_files[0] 
              : bestVersion.kara_files;
            if (file.storage_path) {
              const basename = extractBasename(file.storage_path);
              item.song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
              return item;
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file:', e);
      }
      
      // Fallback to song file_path if it exists (extract basename)
      if (item.song.file_path) {
        const basename = extractBasename(item.song.file_path);
        item.song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
      }
      return item;
    }));

    res.json({ queue: queueWithUrls as QueueItem[] });
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Add song to queue
 * Accepts either version_id (preferred) or song_id (legacy)
 */
router.post('/add', async (req, res) => {
  try {
    const { room_id, song_id, version_id, user_id }: AddToQueueRequest = req.body;

    if (!room_id || !user_id) {
      return res.status(400).json({
        error: 'room_id and user_id are required',
      });
    }

    // If version_id provided, get song_id from version
    let targetSongId = song_id;
    if (version_id && !song_id) {
      const { data: version, error: versionError } = await supabaseAdmin
        .from('kara_versions')
        .select('song_id')
        .eq('id', version_id)
        .single();

      if (versionError || !version) {
        return res.status(404).json({
          error: 'Version not found',
        });
      }

      targetSongId = version.song_id;
    }

    if (!targetSongId) {
      return res.status(400).json({
        error: 'Either song_id or version_id is required',
      });
    }

    const queueItem = await QueueManager.addToQueue(room_id, targetSongId, user_id, version_id);

    // Fetch with joined data
    const { data: fullItem, error } = await supabaseAdmin
      .from('kara_queue')
      .select(
        `
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `
      )
      .eq('id', queueItem.id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch queue item: ${error.message}`);
    }

    // Get version_id from queueItem (might be in memory if column doesn't exist)
    const itemVersionId = (queueItem as any).version_id || version_id;

    // Add media URL - prefer version file, fallback to song file_path
    if (itemVersionId) {
      try {
        const { data: versionData } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            kara_files!inner(
              id,
              storage_path,
              type
            )
          `)
          .eq('id', itemVersionId)
          .eq('kara_files.type', 'video')
          .single();
        
        if (versionData && versionData.kara_files && versionData.kara_files.length > 0) {
          const file = Array.isArray(versionData.kara_files) 
            ? versionData.kara_files[0] 
            : versionData.kara_files;
          if (file.storage_path) {
            const basename = extractBasename(file.storage_path);
            (fullItem as any).song = (fullItem as any).song || {};
            (fullItem as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
            res.json({ queueItem: fullItem as QueueItem });
            return;
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file, using fallback:', e);
      }
    }
    
    // Fallback to song file_path (extract basename)
    if (fullItem.song && (fullItem.song as any).file_path) {
      const basename = extractBasename((fullItem.song as any).file_path);
      (fullItem as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
    }

    res.json({ queueItem: fullItem as QueueItem });
  } catch (error: any) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get current playing song (TV mode - backend authority)
 * Returns the song URL from rooms.current_entry_id
 */
router.get('/:roomId/current', async (req, res) => {
  try {
    const { roomId } = req.params;

    const currentSong = await QueueManager.getCurrentSong(roomId);

    if (!currentSong) {
      return res.json({ queueItem: null });
    }

    // Add media URL to song
    if (currentSong.song && currentSong.song_id) {
      try {
        const { data: versions } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            label,
            kara_files!inner(
              id,
              storage_path,
              type
            )
          `)
          .eq('song_id', currentSong.song_id)
          .eq('kara_files.type', 'video');

        if (versions && versions.length > 0) {
          // Find best version (prefer "nam", non-remix)
          const namVersion = versions.find((v: any) => 
            v.kara_files && v.kara_files.length > 0 && 
            v.label && (v.label === 'nam' || v.label.startsWith('nam_')) &&
            !v.label.includes('remix')
          );
          const bestVersion = namVersion || versions[0];
          
          if (bestVersion && bestVersion.kara_files && bestVersion.kara_files.length > 0) {
            const file = Array.isArray(bestVersion.kara_files) 
              ? bestVersion.kara_files[0] 
              : bestVersion.kara_files;
            if (file.storage_path) {
              const basename = extractBasename(file.storage_path);
              (currentSong as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
              res.json({ queueItem: currentSong });
              return;
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file:', e);
      }
    }

    // Fallback to song file_path (extract basename)
    if (currentSong.song && (currentSong.song as any).file_path) {
      const basename = extractBasename((currentSong.song as any).file_path);
      (currentSong as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
    }

    res.json({ queueItem: currentSong });
  } catch (error: any) {
    console.error('Error getting current song:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * TV reports playback ended (backend authority)
 */
router.post('/:roomId/playback-ended', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { queueItemId } = req.body;

    if (!queueItemId) {
      return res.status(400).json({ error: 'queueItemId is required' });
    }

    await QueueManager.handlePlaybackEnded(roomId, queueItemId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error handling playback ended:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * TV reports playback error (backend authority)
 */
router.post('/:roomId/playback-error', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { queueItemId } = req.body;

    if (!queueItemId) {
      return res.status(400).json({ error: 'queueItemId is required' });
    }

    await QueueManager.handlePlaybackError(roomId, queueItemId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error handling playback error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Mark song as playing
 */
// Note: Playback is now backend-controlled via startPlaying()
// This endpoint is no longer used - TV reports ended/error instead

/**
 * Mark song as completed
 */
router.post('/:queueItemId/complete', async (req, res) => {
  try {
    const { queueItemId } = req.params;
    const { room_id, user_id, song_id } = req.body;

    if (!room_id || !user_id || !song_id) {
      return res.status(400).json({
        error: 'room_id, user_id, and song_id are required',
      });
    }

    await QueueManager.markAsCompleted(queueItemId, room_id, user_id, song_id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking as completed:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Skip song (backend-controlled)
 * Marks song as skipped and auto-starts next song
 * Idempotent: returns 200 if already skipped/ended/error
 */
router.post('/:queueItemId/skip', async (req, res) => {
  try {
    const { queueItemId } = req.params;

    if (!queueItemId) {
      return res.status(400).json({ error: 'queueItemId is required' });
    }

    // Get queue item to check status and get room_id
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, status, room_id')
      .eq('id', queueItemId)
      .single();

    if (fetchError || !queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    // Idempotency: if already skipped/ended/error, return 200 and ensure playing
    if (queueItem.status === 'skipped' || queueItem.status === 'completed' || queueItem.status === 'error') {
      // Already in terminal state, ensure playback continues if room is idle
      await QueueManager.ensurePlaying(queueItem.room_id);
      return res.json({ success: true, message: 'Already skipped' });
    }

    // Skip the song (handles both playing and pending items)
    await QueueManager.skipSong(queueItem.room_id, queueItemId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error skipping song:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Remove song from queue (host only)
 */
router.delete('/:queueItemId', async (req, res) => {
  try {
    const { queueItemId } = req.params;
    const { room_id } = req.query;

    if (!room_id || typeof room_id !== 'string') {
      return res.status(400).json({ error: 'room_id is required' });
    }

    await QueueManager.removeFromQueue(queueItemId, room_id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing from queue:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Host reorder queue (overrides round-robin)
 */
router.post('/reorder', async (req, res) => {
  try {
    const { queue_item_id, new_position, room_id }: ReorderQueueRequest =
      req.body;

    if (!queue_item_id || new_position === undefined || !room_id) {
      return res.status(400).json({
        error: 'queue_item_id, new_position, and room_id are required',
      });
    }

    await QueueManager.hostReorderQueue(room_id, queue_item_id, new_position);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error reordering queue:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Export resolveMediaUrlsForQueue for use in other routes
export { resolveMediaUrlsForQueue };

export default router;

