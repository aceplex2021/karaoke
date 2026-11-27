import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import {
  FavoriteMetaMap,
  isYouTubeFavoriteKey,
  videoIdFromFavoriteKey,
  youtubeFavoriteKey,
} from '@/lib/favorite-keys';

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function asMetaMap(raw: unknown): FavoriteMetaMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as FavoriteMetaMap;
}

async function loadPrefs(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('kara_user_preferences')
    .select('favorite_song_ids, favorite_meta')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    ids: asStringArray(data?.favorite_song_ids),
    meta: asMetaMap((data as { favorite_meta?: unknown } | null)?.favorite_meta),
  };
}

async function savePrefs(
  userId: string,
  ids: string[],
  meta: FavoriteMetaMap
) {
  const { error } = await supabaseAdmin.from('kara_user_preferences').upsert(
    {
      user_id: userId,
      favorite_song_ids: ids,
      favorite_meta: meta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

/** Normalize legacy queue UUIDs → youtube:VIDEO_ID; drop dead orphans. */
async function normalizeFavoriteIds(
  ids: string[],
  meta: FavoriteMetaMap
): Promise<{ ids: string[]; meta: FavoriteMetaMap; changed: boolean }> {
  const uuidLike = ids.filter(
    (id) => !isYouTubeFavoriteKey(id) && /^[0-9a-f-]{36}$/i.test(id)
  );
  const queueById = new Map<
    string,
    { youtube_url: string | null; metadata: any }
  >();
  if (uuidLike.length) {
    const { data: queueItems } = await supabaseAdmin
      .from('kara_queue')
      .select('id, youtube_url, metadata, source_type')
      .in('id', uuidLike);
    for (const row of queueItems || []) {
      queueById.set(row.id, {
        youtube_url: row.youtube_url,
        metadata: row.metadata,
      });
    }
  }

  const nextIds: string[] = [];
  const nextMeta: FavoriteMetaMap = { ...meta };
  const seen = new Set<string>();
  let changed = false;

  for (const id of ids) {
    if (isYouTubeFavoriteKey(id)) {
      if (seen.has(id)) {
        changed = true;
        continue;
      }
      seen.add(id);
      nextIds.push(id);
      continue;
    }

    const q = queueById.get(id);
    if (q?.youtube_url) {
      const key = youtubeFavoriteKey(q.youtube_url);
      if (key) {
        changed = true;
        if (!seen.has(key)) {
          seen.add(key);
          nextIds.push(key);
          nextMeta[key] = {
            title: q.metadata?.title || nextMeta[key]?.title || 'YouTube Video',
            youtube_url:
              q.youtube_url ||
              nextMeta[key]?.youtube_url ||
              `https://www.youtube.com/watch?v=${videoIdFromFavoriteKey(key)}`,
          };
        }
        continue;
      }
    }

    // Keep version UUIDs (and unknown non-YT ids that weren't queue YouTube)
    if (!q) {
      if (seen.has(id)) {
        changed = true;
        continue;
      }
      seen.add(id);
      nextIds.push(id);
    } else {
      // Queue row existed but not YouTube — drop (shouldn't be a fav key)
      changed = true;
    }
  }

  // Drop meta keys no longer referenced
  for (const k of Object.keys(nextMeta)) {
    if (!seen.has(k)) {
      delete nextMeta[k];
      changed = true;
    }
  }

  return { ids: nextIds, meta: nextMeta, changed };
}

/**
 * GET /api/users/:userId/favorites
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    let { ids, meta } = await loadPrefs(userId);

    if (ids.length === 0) {
      return NextResponse.json({ favorites: [] });
    }

    const normalized = await normalizeFavoriteIds(ids, meta);
    ids = normalized.ids;
    meta = normalized.meta;
    if (normalized.changed) {
      await savePrefs(userId, ids, meta);
    }

    if (ids.length === 0) {
      return NextResponse.json({ favorites: [] });
    }

    const versionIds = ids.filter((id) => !isYouTubeFavoriteKey(id));
    const ytKeys = ids.filter(isYouTubeFavoriteKey);

    let versions: any[] = [];
    if (versionIds.length) {
      const { data, error } = await supabaseAdmin
        .from('kara_versions')
        .select(
          `
        id,
        title_display,
        tone,
        mixer,
        style,
        artist_name,
        performance_type
      `
        )
        .in('id', versionIds);
      if (error) {
        console.error('[GET favorites] Error fetching versions:', error);
        return NextResponse.json(
          { error: 'Failed to fetch favorite versions' },
          { status: 500 }
        );
      }
      versions = data || [];
    }

    // Fill YT meta from recent queue rows when missing
    const missingYt = ytKeys.filter((k) => !meta[k]?.youtube_url);
    if (missingYt.length) {
      const videoIds = missingYt
        .map(videoIdFromFavoriteKey)
        .filter((v): v is string => Boolean(v));
      if (videoIds.length) {
        const { data: queueItems } = await supabaseAdmin
          .from('kara_queue')
          .select('youtube_url, metadata')
          .eq('source_type', 'youtube')
          .not('youtube_url', 'is', null)
          .order('added_at', { ascending: false })
          .limit(200);
        for (const row of queueItems || []) {
          const key = row.youtube_url
            ? youtubeFavoriteKey(row.youtube_url)
            : null;
          if (!key || !missingYt.includes(key) || meta[key]?.youtube_url) continue;
          meta[key] = {
            title: row.metadata?.title || 'YouTube Video',
            youtube_url: row.youtube_url,
          };
        }
      }
    }

    const youtubeFavorites = ytKeys.map((key) => {
      const vid = videoIdFromFavoriteKey(key);
      const entry = meta[key] || {};
      const url =
        entry.youtube_url ||
        (vid ? `https://www.youtube.com/watch?v=${vid}` : null);
      return {
        id: key,
        title_display: entry.title || 'YouTube Video',
        artist_name: 'YouTube',
        tone: null,
        mixer: null,
        style: null,
        performance_type: null,
        youtube_url: url,
        metadata: { title: entry.title },
        source_type: 'youtube',
      };
    });

    const allFavorites = [...versions, ...youtubeFavorites];
    allFavorites.sort((a, b) => {
      const titleA = (a.title_display || '').toLowerCase();
      const titleB = (b.title_display || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    return NextResponse.json({ favorites: allFavorites });
  } catch (error) {
    console.error('[GET favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/users/:userId/favorites
 * Body: { song_id, youtube_url?, title? }
 * song_id may be version UUID, queue UUID, youtube:VIDEO_ID, or raw video id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    const song_id = body.song_id as string | undefined;
    const youtube_url = body.youtube_url as string | undefined;
    const title = body.title as string | undefined;

    if (!song_id && !youtube_url) {
      return NextResponse.json(
        { error: 'song_id or youtube_url is required' },
        { status: 400 }
      );
    }

    let { ids, meta } = await loadPrefs(userId);
    const normalized = await normalizeFavoriteIds(ids, meta);
    ids = normalized.ids;
    meta = normalized.meta;

    let storeId = song_id || '';
    let ytKey =
      (youtube_url && youtubeFavoriteKey(youtube_url)) ||
      (song_id && youtubeFavoriteKey(song_id)) ||
      null;

    // Legacy: song_id is a YouTube queue row UUID
    if (!ytKey && song_id && /^[0-9a-f-]{36}$/i.test(song_id)) {
      const { data: queueItem } = await supabaseAdmin
        .from('kara_queue')
        .select('id, youtube_url, metadata, source_type')
        .eq('id', song_id)
        .maybeSingle();
      if (queueItem?.youtube_url) {
        ytKey = youtubeFavoriteKey(queueItem.youtube_url);
        if (ytKey) {
          meta[ytKey] = {
            title:
              title ||
              queueItem.metadata?.title ||
              meta[ytKey]?.title ||
              'YouTube Video',
            youtube_url: queueItem.youtube_url,
          };
        }
      }
    }

    if (ytKey) {
      storeId = ytKey;
      const vid = videoIdFromFavoriteKey(ytKey);
      meta[ytKey] = {
        title: title || meta[ytKey]?.title || 'YouTube Video',
        youtube_url:
          youtube_url ||
          meta[ytKey]?.youtube_url ||
          (vid ? `https://www.youtube.com/watch?v=${vid}` : undefined),
      };
      if (youtube_url && !meta[ytKey].title) {
        meta[ytKey].title = title || 'YouTube Video';
      }
    }

    if (!storeId) {
      return NextResponse.json({ error: 'Could not resolve favorite id' }, { status: 400 });
    }

    if (ids.includes(storeId)) {
      await savePrefs(userId, ids, meta);
      return NextResponse.json({
        success: true,
        message: 'Already in favorites',
        favorite_id: storeId,
      });
    }

    ids = [...ids, storeId];
    await savePrefs(userId, ids, meta);

    return NextResponse.json({
      success: true,
      message: 'Added to favorites',
      favorite_id: storeId,
    });
  } catch (error) {
    console.error('[POST favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/:userId/favorites?songId=
 * songId may be youtube:VIDEO_ID, version UUID, or legacy queue UUID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get('songId');

    if (!songId) {
      return NextResponse.json(
        { error: 'songId query parameter is required' },
        { status: 400 }
      );
    }

    let { ids, meta } = await loadPrefs(userId);
    const normalized = await normalizeFavoriteIds(ids, meta);
    ids = normalized.ids;
    meta = normalized.meta;

    const ytKey = youtubeFavoriteKey(songId);
    const removeKeys = new Set<string>([songId]);
    if (ytKey) removeKeys.add(ytKey);

    // Also drop legacy queue UUID that maps to same video
    const legacyQueueIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (legacyQueueIds.length && (ytKey || /^[0-9a-f-]{36}$/i.test(songId))) {
      const { data: queueItems } = await supabaseAdmin
        .from('kara_queue')
        .select('id, youtube_url')
        .eq('source_type', 'youtube')
        .in('id', legacyQueueIds);
      for (const row of queueItems || []) {
        const k = row.youtube_url ? youtubeFavoriteKey(row.youtube_url) : null;
        if (k && (k === ytKey || k === songId || row.id === songId)) {
          removeKeys.add(row.id);
          removeKeys.add(k);
        }
      }
    }

    const nextIds = ids.filter((id) => !removeKeys.has(id));
    for (const k of removeKeys) {
      if (meta[k]) delete meta[k];
    }

    await savePrefs(userId, nextIds, meta);
    return NextResponse.json({ success: true, message: 'Removed from favorites' });
  } catch (error) {
    console.error('[DELETE favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
