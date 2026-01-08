import { supabaseAdmin } from './supabase';
import { config } from '../config';
import type { QueueItem, Song } from '@/shared/types';

/**
 * Extract basename (filename only) from storage_path
 * Removes folder prefixes, encoded slashes, and path separators
 * media_url must never include %2F or /Videos
 */
export function extractBasename(storagePath: string): string {
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
export async function resolveMediaUrlsForQueue(queueItems: QueueItem[]): Promise<QueueItem[]> {
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

