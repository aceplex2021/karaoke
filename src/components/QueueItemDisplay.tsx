/**
 * Queue Item Display Component
 * 
 * Displays queue item with support for both:
 * - Database songs (v3.5)
 * - YouTube videos (v4.0)
 */

'use client';

import type { QueueItem } from '@/shared/types';
import { getYouTubeThumbnail, extractYouTubeId } from '@/lib/youtube';

interface QueueItemDisplayProps {
  item: QueueItem;
  showPosition?: boolean;
  showUser?: boolean;
  compact?: boolean;
}

export function QueueItemDisplay({
  item,
  showPosition = true,
  showUser = true,
  compact = false,
}: QueueItemDisplayProps) {
  const isYouTube = item.source_type === 'youtube' && item.youtube_url;
  const videoId = isYouTube ? extractYouTubeId(item.youtube_url!) : null;
  const thumbnailUrl = videoId ? getYouTubeThumbnail(videoId, 'mqdefault') : null;

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem',
      }}>
        {showPosition && (
          <div style={{
            minWidth: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#667eea',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}>
            {item.position}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.title}
          </div>
          {showUser && (
            <div style={{
              fontSize: '0.85rem',
              color: '#666',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {item.user_name}
              {item.artist && ` • ${item.artist}`}
            </div>
          )}
        </div>

        {isYouTube && (
          <span style={{
            fontSize: '1.25rem',
            flexShrink: 0,
          }}>
            ▶️
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      padding: '1rem',
      background: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #dee2e6',
    }}>
      {/* Position or Thumbnail */}
      {isYouTube && thumbnailUrl ? (
        <div style={{
          position: 'relative',
          width: '120px',
          height: '68px',
          borderRadius: '6px',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <img
            src={thumbnailUrl}
            alt={item.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.7)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
          }}>
            ▶️
          </div>
          {showPosition && (
            <div style={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}>
              #{item.position}
            </div>
          )}
        </div>
      ) : showPosition ? (
        <div style={{
          minWidth: '48px',
          height: '48px',
          borderRadius: '50%',
          background: '#667eea',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: '1.1rem',
          flexShrink: 0,
        }}>
          {item.position}
        </div>
      ) : null}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '1.05rem',
          marginBottom: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.title}
          </span>
          {isYouTube && (
            <span style={{
              fontSize: '0.75rem',
              padding: '2px 6px',
              background: '#ff0000',
              color: 'white',
              borderRadius: '4px',
              fontWeight: 600,
              flexShrink: 0,
            }}>
              YOUTUBE
            </span>
          )}
        </div>

        {item.artist && (
          <div style={{
            fontSize: '0.9rem',
            color: '#666',
            marginBottom: '0.25rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.artist}
          </div>
        )}

        {showUser && (
          <div style={{
            fontSize: '0.85rem',
            color: '#888',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            🎤 {item.user_name}
          </div>
        )}
      </div>
    </div>
  );
}
