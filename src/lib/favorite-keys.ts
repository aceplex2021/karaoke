import { extractYouTubeId } from '@/lib/youtube';

export const YT_FAV_PREFIX = 'youtube:';

export function isYouTubeFavoriteKey(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(YT_FAV_PREFIX));
}

export function youtubeFavoriteKey(videoIdOrUrl: string): string | null {
  if (!videoIdOrUrl) return null;
  if (isYouTubeFavoriteKey(videoIdOrUrl)) return videoIdOrUrl;
  if (/^[a-zA-Z0-9_-]{11}$/.test(videoIdOrUrl)) {
    return `${YT_FAV_PREFIX}${videoIdOrUrl}`;
  }
  const id = extractYouTubeId(videoIdOrUrl);
  return id ? `${YT_FAV_PREFIX}${id}` : null;
}

export function videoIdFromFavoriteKey(key: string): string | null {
  if (!isYouTubeFavoriteKey(key)) return null;
  const id = key.slice(YT_FAV_PREFIX.length);
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

export type FavoriteMetaEntry = {
  title?: string;
  youtube_url?: string;
};

export type FavoriteMetaMap = Record<string, FavoriteMetaEntry>;
