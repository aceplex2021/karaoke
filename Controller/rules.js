// rules.js

// Noise words to ignore when building title_clean / normalized_title
export const IGNORE_TOKENS = [
  'karaoke',
  'official',
  'video',
  'mv',
  'tone',
  'lyrics'
];

// STYLE tokens = genre/arrangement descriptors (independent of tone & pitch)
export const STYLE_TOKENS = [
  'bolero',
  'ballad',
  'edm',
  'cover',
  'remix',
  'acoustic',
  'live',
  'original',
  'beat'
];

// VERSION tokens = legacy bucket (keep for backward compatibility if other code still expects "version")
// IMPORTANT: do NOT include 'tram' or 'bolero' here.
// - tram = low pitch/register
// - bolero = style/genre
export const VERSION_TOKENS = [
  'remix',
  'acoustic',
  'live',
  'cover',
  'edm',
  'ballad',
  'beat',
  'original'
];

// ==========================
// TONE = vocal gender
// ==========================
export const TONE_RULES = [
  { regex: /\bnam\b/i, value: 'nam' },
  { regex: /\b(nu|nữ)\b/i, value: 'nu' }
];

// ==========================
// VERSION_RULES = arrangement / key shift (legacy support)
// NOTE: key shifts like +3/-2 are not the same as musical key (Bm/Ebm/etc).
// Keep as-is for future expansion if you want to store them separately later.
export const VERSION_RULES = [
  // Tone +3, Tone -2
  { regex: /\btone\s*([+-]\d+)\b/i, value: (m) => `key${m[1]}` },

  // +3 / -2 alone
  { regex: /\b([+-]\d+)\b/i, value: (m) => `key${m[1]}` },

  { regex: /\bremix\b/i, value: 'remix' },
  { regex: /\bacoustic\b/i, value: 'acoustic' },
  { regex: /\blive\b/i, value: 'live' },
  { regex: /\bbeat\b/i, value: 'beat' },
  { regex: /\bcover\b/i, value: 'cover' }
];
