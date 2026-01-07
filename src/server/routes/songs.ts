import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';
import type { Song } from '../../shared/types';

const router = Router();

/**
 * Select best version from available versions
 * Rules: Prefer "nam", non-remix, standard karaoke, then lowest version_id
 */
function selectBestVersion(versions: any[]): any | null {
  if (!versions || versions.length === 0) return null;

  // All versions passed here should already have video files (filtered in query)
  // Priority 1: Prefer "nam" tone
  const namVersions = versions.filter(v => 
    v.label && (v.label === 'nam' || v.label.startsWith('nam_'))
  );
  if (namVersions.length > 0) {
    // Among nam versions, prefer non-remix
    const namNonRemix = namVersions.filter(v => 
      !v.label?.includes('remix')
    );
    if (namNonRemix.length > 0) {
      return namNonRemix.sort((a, b) => a.id.localeCompare(b.id))[0];
    }
    return namVersions.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  // Priority 2: Prefer non-remix
  const nonRemix = versions.filter(v => 
    !v.label?.includes('remix')
  );
  if (nonRemix.length > 0) {
    return nonRemix.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  // Priority 3: Prefer is_default
  const defaultVersion = versions.find(v => v.is_default);
  if (defaultVersion) return defaultVersion;

  // Fallback: lowest version_id
  return versions.sort((a, b) => a.id.localeCompare(b.id))[0];
}

/**
 * Build play URL from storage_path
 */
function buildPlayUrl(storagePath: string): string {
  const encoded = encodeURIComponent(storagePath);
  return `${config.mediaServer.baseUrl}/${encoded}`;
}

/**
 * Group-aware song search (per Songs_API_Contract.md)
 * Returns one result per song group with best_version selected server-side
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 30 } = req.query;
    console.log('Group-aware search request:', { q, limit });

    // REQUIRE search query
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.json({ query: '', results: [] });
    }

    const searchTerm = q.trim().toLowerCase();
    const searchLimit = parseInt(limit as string, 10);

    // Use a single RPC call or simplified query approach
    // First, get groups matching search
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('id, base_title_unaccent, base_title_display')
      .ilike('base_title_unaccent', `%${searchTerm}%`)
      .limit(searchLimit);

    if (groupsError) {
      throw new Error(`Failed to search groups: ${groupsError.message}`);
    }

    if (!groups || groups.length === 0) {
      return res.json({ query: searchTerm, results: [] });
    }

    const groupIds = groups.map(g => g.id);

    // Get all data in one go using a more direct approach
    // For each group, get its versions with files directly
    const results = await Promise.all(
      groups.map(async (group) => {
        // Get songs in this group
        const { data: members } = await supabaseAdmin
          .from('kara_song_group_members')
          .select('song_id')
          .eq('group_id', group.id);

        if (!members || members.length === 0) {
          return null;
        }

        const songIds = members.map(m => m.song_id).filter(Boolean);
        
        // Get artists for these songs
        const { data: songs } = await supabaseAdmin
          .from('kara_songs')
          .select('artist_id')
          .in('id', songIds);

        const artistIds = [...new Set((songs || []).map(s => s.artist_id).filter(Boolean))];
        const { data: artists } = await supabaseAdmin
          .from('kara_artists')
          .select('name')
          .in('id', artistIds);

        const artistNames = (artists || []).map(a => a.name).filter(Boolean);

        // Get versions with files for songs in this group
        const { data: versions } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            song_id,
            label,
            key,
            is_default,
            kara_files!inner (
              id,
              storage_path,
              type,
              duration_seconds
            )
          `)
          .in('song_id', songIds)
          .eq('kara_files.type', 'video');

        if (!versions || versions.length === 0) {
          return null;
        }

        // Format versions
        const groupVersions = versions
          .filter(v => v.kara_files && v.kara_files.length > 0)
          .map((v: any) => {
            const file = Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files;
            return {
              id: v.id,
              song_id: v.song_id,
              label: v.label,
              key: v.key,
              is_default: v.is_default,
              file: {
                id: file.id,
                storage_path: file.storage_path,
                play_url: buildPlayUrl(file.storage_path),
              },
            };
          });

        if (groupVersions.length === 0) {
          return null;
        }

        // Select best version
        const bestVersion = selectBestVersion(groupVersions);

        // Get available tones/styles
        const allLabels = groupVersions.map(v => v.label).filter(Boolean);
        const tones = [...new Set(allLabels.filter(l => l === 'nam' || l === 'nu' || l.startsWith('nam_') || l.startsWith('nu_')))];
        const styles = [...new Set(allLabels.filter(l => !tones.includes(l)))];

        return {
          group_id: group.id,
          display_title: group.base_title_display || group.base_title_unaccent,
          normalized_title: group.base_title_unaccent,
          artists: artistNames,
          best_version: bestVersion ? {
            version_id: bestVersion.id,
            tone: bestVersion.label === 'nam' || bestVersion.label?.startsWith('nam_') ? 'nam' :
                  bestVersion.label === 'nu' || bestVersion.label?.startsWith('nu_') ? 'nu' : null,
            pitch: bestVersion.key || null,
            styles: bestVersion.label ? [bestVersion.label] : [],
            file: bestVersion.file,
          } : null,
          available: {
            version_count: groupVersions.length,
            tones,
            styles,
          },
        };
      })
    );

    const validResults = results.filter(r => r !== null && r.best_version !== null);
    console.log(`Found ${validResults.length} results from ${groups.length} groups`);
    
    // Sort results: exact matches first, then alphabetical
    const searchTermLower = searchTerm.toLowerCase();
    validResults.sort((a, b) => {
      const titleA = (a?.display_title || '').toLowerCase();
      const titleB = (b?.display_title || '').toLowerCase();
      const normalizedA = (a?.normalized_title || '').toLowerCase();
      const normalizedB = (b?.normalized_title || '').toLowerCase();
      
      // Check for exact matches (starts with search term)
      const aExact = titleA.startsWith(searchTermLower) || normalizedA.startsWith(searchTermLower);
      const bExact = titleB.startsWith(searchTermLower) || normalizedB.startsWith(searchTermLower);
      
      if (aExact && !bExact) return -1; // a comes first
      if (!aExact && bExact) return 1;  // b comes first
      
      // Both exact or both not exact - sort alphabetically
      return titleA.localeCompare(titleB);
    });
    
    res.json({ query: searchTerm, results: validResults });
  } catch (error: any) {
    console.error('Error in group-aware search:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get all versions for a song group (per Songs_API_Contract.md)
 */
router.get('/group/:groupId/versions', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Get group info
    const { data: group, error: groupError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('id, base_title_display, base_title_unaccent')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get songs in this group
    const { data: members, error: membersError } = await supabaseAdmin
      .from('kara_song_group_members')
      .select('song_id')
      .eq('group_id', groupId);

    if (membersError) {
      throw new Error(`Failed to fetch group members: ${membersError.message}`);
    }

    const songIds = (members || []).map((m: any) => m.song_id);

    if (songIds.length === 0) {
      return res.json({
        group_id: groupId,
        title: group.base_title_display || group.base_title_unaccent,
        versions: [],
      });
    }

    // Get all versions
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('kara_versions')
      .select('id, song_id, label, key, is_default')
      .in('song_id', songIds)
      .order('is_default', { ascending: false })
      .order('id', { ascending: true });

    if (versionsError) {
      throw new Error(`Failed to fetch versions: ${versionsError.message}`);
    }

    if (!versions || versions.length === 0) {
      return res.json({
        group_id: groupId,
        title: group.base_title_display || group.base_title_unaccent,
        versions: [],
      });
    }

    // Get files for these versions (only video files)
    const versionIds = versions.map((v: any) => v.id);
    const { data: files, error: filesError } = await supabaseAdmin
      .from('kara_files')
      .select('id, version_id, storage_path, type, duration_seconds')
      .in('version_id', versionIds)
      .eq('type', 'video');

    if (filesError) {
      throw new Error(`Failed to fetch files: ${filesError.message}`);
    }

    // Group files by version_id (take first file per version)
    const filesByVersion = new Map();
    (files || []).forEach((f: any) => {
      if (!filesByVersion.has(f.version_id)) {
        filesByVersion.set(f.version_id, f);
      }
    });

    // Format versions (only those with files)
    const formattedVersions = (versions || []).filter((v: any) => filesByVersion.has(v.id)).map((v: any) => {
      const file = filesByVersion.get(v.id);
      return {
        version_id: v.id,
        tone: v.label === 'nam' || v.label?.startsWith('nam_') ? 'nam' :
              v.label === 'nu' || v.label?.startsWith('nu_') ? 'nu' : null,
        pitch: v.key || null,
        styles: v.label ? [v.label] : [],
        duration_s: file?.duration_seconds || null,
        file: {
          file_id: file.id,
          storage_path: file.storage_path,
          play_url: buildPlayUrl(file.storage_path),
        },
      };
    });

    res.json({
      group_id: groupId,
      title: group.base_title_display || group.base_title_unaccent,
      versions: formattedVersions,
    });
  } catch (error: any) {
    console.error('Error fetching group versions:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get song by ID
 */
router.get('/:songId', async (req, res) => {
  try {
    const { songId } = req.params;

    const { data: song, error } = await supabaseAdmin
      .from('kara_songs')
      .select('*')
      .eq('id', songId)
      .single();

    if (error || !song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({ song: song as Song });
  } catch (error: any) {
    console.error('Error fetching song:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get user's song history for a room
 */
router.get('/history/:roomId/:userId', async (req, res) => {
  try {
    const { roomId, userId } = req.params;

    const { data: history, error } = await supabaseAdmin
      .from('kara_song_history')
      .select(
        `
        *,
        song: kara_songs(*)
      `
      )
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch history: ${error.message}`);
    }

    res.json({ history: history || [] });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

