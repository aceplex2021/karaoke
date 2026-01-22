/**
 * YouTube Utility Functions
 * 
 * Handles YouTube URL parsing, validation, and video ID extraction
 */

/**
 * Extract YouTube video ID from various URL formats
 * 
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * 
 * @param url - YouTube URL
 * @returns Video ID or null if not found
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;

  // Regular expressions for different YouTube URL formats
  const patterns = [
    // Standard watch URL: youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    
    // Short URL: youtu.be/VIDEO_ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    
    // Embed URL: youtube.com/embed/VIDEO_ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    
    // V URL: youtube.com/v/VIDEO_ID
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    
    // Mobile URL: m.youtube.com/watch?v=VIDEO_ID
    /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Try to extract from query parameter
  try {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }
  } catch (e) {
    // Invalid URL
  }

  return null;
}

/**
 * Validate if a URL is a YouTube URL
 * 
 * @param url - URL to validate
 * @returns true if valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be'
    );
  } catch (e) {
    return false;
  }
}

/**
 * Build YouTube embed URL from video ID
 * 
 * @param videoId - YouTube video ID
 * @param autoplay - Whether to autoplay (default: false)
 * @param controls - Whether to show controls (default: true)
 * @returns Embed URL
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  options: {
    autoplay?: boolean;
    controls?: boolean;
    modestbranding?: boolean;
    rel?: boolean;
    fs?: boolean;
    playsinline?: boolean;
  } = {}
): string {
  const params = new URLSearchParams({
    // Enable YouTube Iframe API
    enablejsapi: '1',
    
    // Video ID
    // origin is automatically added by iframe
    
    // Options
    autoplay: options.autoplay ? '1' : '0',
    controls: options.controls === false ? '0' : '1',
    modestbranding: options.modestbranding ? '1' : '0',
    rel: options.rel === false ? '0' : '1',
    fs: options.fs === false ? '0' : '1',
    playsinline: options.playsinline ? '1' : '0',
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Get YouTube thumbnail URL
 * 
 * @param videoId - YouTube video ID
 * @param quality - Thumbnail quality (default, mqdefault, hqdefault, sddefault, maxresdefault)
 * @returns Thumbnail URL
 */
export function getYouTubeThumbnail(
  videoId: string,
  quality: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'mqdefault'
): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Convert video ID to standard YouTube URL
 * 
 * @param videoId - YouTube video ID
 * @returns Standard YouTube URL
 */
export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Parse YouTube video info from URL
 * 
 * @param url - YouTube URL
 * @returns Video info or null
 */
export function parseYouTubeUrl(url: string): {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  thumbnailUrl: string;
} | null {
  const videoId = extractYouTubeId(url);
  
  if (!videoId) return null;

  return {
    videoId,
    embedUrl: buildYouTubeEmbedUrl(videoId),
    watchUrl: buildYouTubeWatchUrl(videoId),
    thumbnailUrl: getYouTubeThumbnail(videoId),
  };
}

/**
 * Validate video ID format
 * 
 * @param videoId - Video ID to validate
 * @returns true if valid format
 */
export function isValidVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}
