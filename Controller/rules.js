// rules.js
// Enhanced rules with all cleanup patterns
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================
// TITLE CLEANUP PATTERNS
// ============================================

// Noise words to remove completely
export const IGNORE_TOKENS = [
  'karaoke',
  'official',
  'video',
  'mv',
  'tone',
  'lyrics',
  'nhac',
  'song',
  'nha',
  'chat',
  'luong',
  'cao',
  'de',
  'hat',
  'chuan',
  'am',
  'thanh',
  'beat',
  'hay',
  'moi'
];

// Words that indicate quality/production (remove these)
export const NOISE_PATTERNS = [
  /nhac\s+song/gi,
  /nhạc\s+sống/gi,
  /chat\s+luong\s+cao/gi,
  /chất\s+lượng\s+cao/gi,
  /de\s+hat/gi,
  /dễ\s+hát/gi,
  /am\s+thanh\s+chuan/gi,
  /âm\s+thanh\s+chuẩn/gi,
  /beat\s+chuan/gi,
  /beat\s+chuẩn/gi,
  /ca\s+si\s+giau\s+mat/gi,
  /ca\s+sĩ\s+giấu\s+mặt/gi
];

// ============================================
// VIETNAMESE MIXER/CHANNEL NAMES
// ============================================
// Dynamically load mixer names from channelSources.md
function loadMixerNames() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const channelSourcesPath = join(__dirname, 'channelSources.md');
    const content = readFileSync(channelSourcesPath, 'utf-8');
    
    // Parse each line, trim whitespace, filter out empty lines
    const mixerNames = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Create array with both accented and unaccented versions
    const allVariants = new Set();
    mixerNames.forEach(name => {
      allVariants.add(name); // Original (may have accents)
      
      // Add common accent variations for Vietnamese names
      const variants = generateAccentVariants(name);
      variants.forEach(v => allVariants.add(v));
    });
    
    return Array.from(allVariants);
  } catch (err) {
    console.warn('Warning: Could not load channelSources.md, using empty mixer list:', err.message);
    return [];
  }
}

// Generate common Vietnamese accent variants for a name
function generateAccentVariants(name) {
  const variants = [];
  
  // Common Vietnamese character mappings
  const accentMap = {
    'ă': 'a', 'â': 'a', 'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e', 'ê': 'e', 'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ô': 'o', 'ơ': 'o', 'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'đ': 'd', 'Đ': 'D',
    'Ă': 'A', 'Â': 'A', 'Á': 'A', 'À': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
    'Ế': 'E', 'Ề': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E', 'Ê': 'E', 'É': 'E', 'È': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
    'Í': 'I', 'Ì': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
    'Ô': 'O', 'Ơ': 'O', 'Ó': 'O', 'Ò': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
    'Ớ': 'O', 'Ờ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
    'Ố': 'O', 'Ồ': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
    'Ú': 'U', 'Ù': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
    'Ư': 'U', 'Ứ': 'U', 'Ừ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
    'Ý': 'Y', 'Ỳ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y'
  };
  
  // Generate unaccented version
  let unaccented = name;
  for (const [accented, plain] of Object.entries(accentMap)) {
    unaccented = unaccented.replace(new RegExp(accented, 'g'), plain);
  }
  
  if (unaccented !== name) {
    variants.push(unaccented);
  }
  
  return variants;
}

export const MIXER_NAMES = loadMixerNames();

// ============================================
// STYLE/GENRE TOKENS
// ============================================
export const STYLE_TOKENS = [
  'bolero',
  'ballad',
  'edm',
  'cover',
  'remix',
  'acoustic',
  'live',
  'original',
  'beat',
  'rumba',
  'cha cha',
  'cha cha cha',
  'tango',
  'valse',
  'slow',
  'bossa nova',
  'bossanova',
  'jazz',
  'blues',
  'rock',
  'pop',
  'rap',
  'nhac song',
  'nhạc sống'
];

// ============================================
// TONE (VOICE GENDER)
// ============================================
export const TONE_RULES = [
  { regex: /\b(nam|male|boy)\b/i, value: 'Nam' },
  { regex: /\b(nu|nữ|female|girl)\b/i, value: 'Nữ' }
];

// ============================================
// PERFORMANCE TYPE PATTERNS
// ============================================
export const PERFORMANCE_TYPE_PATTERNS = {
  duet: [
    /\bsong\s*ca\b/i,
    /__song_ca\b/i,  // Also match __song_ca suffix
    /\bduet\b/i
  ],
  medley: [
    /\blien\s*khuc\b/i,
    /\bliên\s*khúc\b/i
  ],
  group: [
    /\bhop\s*ca\b/i,
    /\bhợp\s*ca\b/i
  ]
};

// ============================================
// VERSION TOKENS (Legacy)
// ============================================
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
