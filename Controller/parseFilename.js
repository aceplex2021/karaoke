// parseFilename.js
// Enhanced with title cleanup, artist extraction, performance type detection
import removeAccents from 'remove-accents';
import { 
  IGNORE_TOKENS, 
  NOISE_PATTERNS,
  MIXER_NAMES,
  STYLE_TOKENS,
  TONE_RULES,
  PERFORMANCE_TYPE_PATTERNS,
  VERSION_TOKENS 
} from './rules.js';

// ============================================
// TITLE CLEANUP
// ============================================
function cleanTitle(rawTitle) {
  let cleaned = rawTitle;
  
  // Remove everything after full-width pipe ｜
  const fwPipeIdx = cleaned.indexOf('｜');
  if (fwPipeIdx > 0) {
    cleaned = cleaned.substring(0, fwPipeIdx);
  } else if (fwPipeIdx === 0) {
    // Title starts with pipe, get part after it
    const parts = cleaned.split('｜').filter(p => p.trim());
    cleaned = parts.length > 0 ? parts[0] : cleaned;
  }
  
  // Remove everything after regular pipe |
  const pipeIdx = cleaned.indexOf('|');
  if (pipeIdx > 0) {
    cleaned = cleaned.substring(0, pipeIdx);
  }
  
  // Remove path fragments
  if (cleaned.includes('/')) {
    cleaned = cleaned.replace(/^.+\//, '');
  }
  
  // Remove "karaoke" anywhere (case insensitive)
  cleaned = cleaned.replace(/\bkaraoke\b/gi, ' ');
  
  // Remove "tone nam", "tone nu", "tone nữ" patterns (anywhere, including after dashes)
  cleaned = cleaned.replace(/\s*-\s*tone\s+(nam|nu|nữ|male|female)/gi, ' ');
  cleaned = cleaned.replace(/\btone\s+(nam|nu|nữ|male|female)/gi, ' ');
  cleaned = cleaned.replace(/\s+tone\s+(nam|nu|nữ)/gi, ' '); // Extra pattern for space before
  
  // Remove "nhac song", "nhạc sống" patterns
  cleaned = cleaned.replace(/\bnhac\s+song\b/gi, ' ');
  cleaned = cleaned.replace(/\bnhạc\s+sống\b/gi, ' ');
  
  // Remove "song ca" (performance type, not part of title)
  cleaned = cleaned.replace(/\bsong\s+ca\b/gi, ' ');
  
  // Remove style prefixes like "Bolero - " from beginning
  cleaned = cleaned.replace(/^(bolero|ballad|edm|remix|acoustic|live|rumba|cha\s+cha|tango|valse|slow|bossa\s+nova|jazz|blues|rock|pop|rap)\s*-\s*/i, '');
  
  // Remove style suffixes like " - Boston Ballad" or " - Tone NỮ"
  cleaned = cleaned.replace(/\s*-\s*(bolero|ballad|edm|remix|acoustic|live|rumba|cha\s+cha|tango|valse|slow|bossa\s+nova|jazz|blues|rock|pop|rap|boston\s+ballad)\s*$/i, '');
  cleaned = cleaned.replace(/\s*-\s*-\s*tone\s+(nam|nu|nữ|male|female)\s*$/i, '');
  
  // Remove quality descriptors
  cleaned = cleaned.replace(/\b(hay\s+nhat|hay\s+nhất|chat\s+luong\s+cao|chất\s+lượng\s+cao|de\s+hat|dễ\s+hát|am\s+thanh|âm\s+thanh|beat\s+mới|beat\s+moi|beat\s+chuan|beat\s+chuẩn)\b/gi, ' ');
  
  // Remove decorative Unicode symbols (stars, sparkles, bullets, etc.)
  cleaned = cleaned.replace(/[\u2600-\u27BF\u2B50\u2B55\u2E80-\u2FD5\u3000-\u303F\uFE10-\uFE19\uFE30-\uFE6F\u{1F300}-\u{1F9FF}]/gu, '');
  
  // Remove years (2024, 2025, etc.)
  cleaned = cleaned.replace(/\b(19|20)\d{2}\b/g, ' ');
  
  // Remove " - KARAOKE - " patterns (double dash cleanup)
  cleaned = cleaned.replace(/\s*-\s*KARAOKE\s*-\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*-\s*KARAOKE\s*$/i, '');
  
  // Remove " - Artist/Mixer Name" pattern
  // Check if the name after dash is a known mixer
  const mixerPattern = new RegExp(`\\s+-\\s+(${MIXER_NAMES.join('|')})\\s*$`, 'i');
  cleaned = cleaned.replace(mixerPattern, '');
  
  // Remove "Trầm", "Tram" (low pitch indicator - should be in metadata, not title)
  cleaned = cleaned.replace(/\b(trầm|tram)\b/gi, ' ');
  
  // Remove file suffixes like ".f298", hash suffixes, etc.
  cleaned = cleaned.replace(/\.f\d+$/i, '');
  cleaned = cleaned.replace(/[a-f0-9]{8,}$/i, ''); // Remove hash suffixes like "ce67b638c"
  
  // Remove trailing metadata patterns (__nam, __nu, etc.)
  cleaned = cleaned.replace(/__[a-z_]+$/i, '');
  
  // Remove trailing dots, underscores, and weird patterns
  cleaned = cleaned.replace(/[._]+$/g, '');
  cleaned = cleaned.replace(/\s*-\s*-\s*$/g, ''); // Remove double dashes at end
  
  // Remove noise patterns
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  
  // Clean whitespace and dashes
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\s*-\s*-\s*/g, ' '); // Remove double dashes anywhere
  cleaned = cleaned.replace(/\s+-\s*$/g, ''); // Remove trailing dash
  cleaned = cleaned.trim();
  
  return cleaned || rawTitle;
}

// ============================================
// ARTIST EXTRACTION
// ============================================
function extractArtist(filename, storagePath) {
  // Build regex for mixer exclusions
  const mixerPattern = new RegExp(`^(${MIXER_NAMES.join('|')})$`, 'i');
  
  // Never extract these as artists
  const neverArtists = ['Karaoke', 'Karaoke Version', 'Official', 'Video', 'Lyrics', 'Version'];
  
  // Pattern 1: Vietnamese Composer in Parentheses (check this FIRST)
  // Example: "Tinh Don Phuong (Trinh Cong Son)"
  const composerMatch = filename.match(/\(([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){1,3})\)/);
  if (composerMatch) {
    const artist = composerMatch[1].trim();
    if (!mixerPattern.test(artist) && 
        !neverArtists.some(na => artist.toLowerCase().includes(na.toLowerCase())) &&
        artist.length >= 3 && artist.length < 50) {
      return artist;
    }
  }
  
  // Pattern 2: KARAOKE | Song - Artist
  // Example: "KARAOKE | Dem Lanh - Dan Nguyen"
  if (/^KARAOKE\s*[|｜]/i.test(filename)) {
    // Get part after pipe, stop at next pipe if present
    const afterPipe = filename.split(/[|｜]/)[1] || '';
    const artistMatch = afterPipe.match(/[^-]+\s*-\s*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){0,2})/);
    if (artistMatch) {
      let artist = artistMatch[1].trim();
      // Remove "Beat Chuẩn", "Beat Chuan" etc. from end
      artist = artist.replace(/\s+(beat\s+chuan|beat\s+chuẩn|beat\s+chuan|beat\s+mới)\s*$/i, '');
      // Stop at pipes
      artist = artist.split(/[|｜]/)[0].trim();
      
      if (!mixerPattern.test(artist) && 
          !neverArtists.some(na => artist.toLowerCase().includes(na.toLowerCase())) &&
          artist.length >= 3 && artist.length < 50) {
        return artist;
      }
    }
  }
  
  // Pattern 3: English Artist - Song Title (only if clear separator like dash)
  // Example: "Sabrina Carpenter - Sugar Talking" or "Taylor Swift - Love Story"
  // Skip common words that are never artists
  const commonWords = ['Hello', 'Good', 'Bad', 'New', 'Old', 'My', 'Your', 'Our', 'Their', 'The', 'This', 'That', 'Karaoke'];
  const dashMatch = filename.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (dashMatch) {
    const artist = dashMatch[1].trim();
    const song = dashMatch[2].trim();
    
    // Exclude if artist is "Karaoke" or contains "Karaoke" or other never-artists
    if (/karaoke/i.test(artist) || neverArtists.some(na => artist.toLowerCase().includes(na.toLowerCase()))) {
      // Skip this pattern
    } else if (!mixerPattern.test(artist) && 
        artist.length >= 3 && artist.length < 30 && 
        artist.split(' ').length <= 3 &&
        !commonWords.includes(artist) &&
        song.length >= 3) { // Make sure there's a real song title after dash
      return artist;
    }
  }
  
  // Pattern 4: Simple English Artist Song (two capitalized words, first is likely artist)
  // Example: "Aespa Whiplash" - only if no brackets/metadata/dash and looks like artist + song
  // Skip if there's a dash (artist would be after dash, not before)
  // Also skip common words that are never artists
  const hasDash = /\s*-\s*/.test(filename);
  if (!filename.includes('[') && !filename.includes('(') && !filename.includes('|') && !hasDash) {
    const simpleMatch = filename.match(/^([A-Z][a-z]+)\s+([A-Z][a-z]+)/);
    if (simpleMatch) {
      const firstWord = simpleMatch[1];
      // Common words that are never artists (adjectives, articles, etc.)
      const commonWords = ['The', 'This', 'That', 'When', 'Where', 'What', 'How', 'Why', 'Hello', 'Good', 'Bad', 'New', 'Old', 'My', 'Your', 'Our', 'Their', 'Romantic', 'Classic', 'Best', 'Top', 'Great', 'Beautiful', 'Amazing', 'Wonderful', 'Happy', 'Sad', 'Love', 'Christmas', 'Holiday', 'Summer', 'Winter', 'Spring', 'Fall'];
      // Only extract if it's a known artist pattern (single word, not too common, not never-artists)
      // Also skip if the second word is a common noun (Song, Music, Video, etc.)
      const secondWord = simpleMatch[2];
      const commonNouns = ['Song', 'Songs', 'Music', 'Video', 'Videos', 'Karaoke', 'Compilation', 'Collection', 'Album', 'Playlist'];
      
      if (firstWord.length >= 3 && firstWord.length < 15 && 
          !commonWords.includes(firstWord) &&
          !commonNouns.includes(secondWord) &&
          !neverArtists.some(na => firstWord.toLowerCase().includes(na.toLowerCase()))) {
        return firstWord;
      }
    }
  }
  
  // Pattern 5: "Song - Artist" format (artist after dash)
  // Example: "Hello - Adele" or "Cứ Ngỡ Hạnh Phúc Thật Gần - Minh Vương M4U ft Ngân Ngân"
  // Skip if "Karaoke" is at start (ambiguous - could be part of title)
  if (!filename.includes('[') && !filename.includes('(') && !/^karaoke/i.test(filename)) {
    // Match artist after dash, stop at pipe or bracket
    // Use simpler regex that matches any characters after dash until pipe
    const beforePipe = filename.split(/[|｜]/)[0];
    const dashArtistMatch = beforePipe.match(/\s+-\s+(.+?)(?:\s*[|｜]|$)/);
    if (dashArtistMatch) {
      let artist = dashArtistMatch[1].trim();
      
      // Remove "Beat Chuẩn", "Song Ca", "Beat Chuan" etc. from end
      artist = artist.replace(/\s+(beat\s+chuan|beat\s+chuẩn|beat\s+mới|song\s+ca)\s*$/i, '');
      artist = artist.trim();
      
      // Only if it looks like an artist name (starts with capital, not too long, not common words, not never-artists)
      const startsWithCapital = /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(artist);
      
      if (startsWithCapital && artist.length >= 3 && artist.length < 50 && 
          !mixerPattern.test(artist) &&
          !neverArtists.some(na => artist.toLowerCase().includes(na.toLowerCase()))) {
        return artist;
      }
    }
  }
  
  return null;
}

// ============================================
// PERFORMANCE TYPE DETECTION
// ============================================
function detectPerformanceType(title, rawFilename) {
  const combined = `${title} ${rawFilename}`.toLowerCase();
  
  // Check medley FIRST (lien khuc takes priority)
  for (const pattern of PERFORMANCE_TYPE_PATTERNS.medley) {
    if (pattern.test(combined)) return 'medley';
  }
  
  // Check duet
  for (const pattern of PERFORMANCE_TYPE_PATTERNS.duet) {
    if (pattern.test(combined)) return 'duet';
  }
  
  // Check group
  for (const pattern of PERFORMANCE_TYPE_PATTERNS.group) {
    if (pattern.test(combined)) return 'group';
  }
  
  return 'solo';
}

// ============================================
// TONE CLEANING
// ============================================
function cleanTone(tokens) {
  const joined = ` ${tokens.join(' ')} `;
  
  for (const rule of TONE_RULES) {
    if (rule.regex.test(joined)) {
      return rule.value;
    }
  }
  
  return null;
}

// ============================================
// CHANNEL (MIXER) EXTRACTION
// ============================================
function extractChannel(rawFilename, metadata = '') {
  // Combine filename and metadata for comprehensive search
  const searchText = `${rawFilename} ${metadata}`;
  
  // Normalize search text (remove accents) for accent-insensitive matching
  // Also replace underscores with spaces to handle "__nam", "__song_ca" suffixes
  const normalizedSearchText = removeAccents(searchText.toLowerCase()).replace(/_/g, ' ');
  
  for (const mixerName of MIXER_NAMES) {
    // Normalize mixer name (remove accents) for accent-insensitive matching
    const normalizedMixerName = removeAccents(mixerName.toLowerCase());
    
    // Use word boundaries to match complete names
    // Escape special regex characters in normalized mixer name
    const escapedName = normalizedMixerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedName}\\b`, 'i');
    
    if (pattern.test(normalizedSearchText)) {
      // Return the original mixer name (with accents if it had them)
      return mixerName;
    }
  }
  return null;
}

// ============================================
// STYLE EXTRACTION
// ============================================
function extractStyle(tokens) {
  const joined = tokens.join(' ').toLowerCase();
  
  // Check multi-word styles first (like "nhac song", "cha cha")
  const multiWordStyles = ['nhac song', 'nhạc sống', 'cha cha', 'cha cha cha', 'bossa nova', 'beat chuan', 'beat chuẩn'];
  for (const style of multiWordStyles) {
    if (joined.includes(style.toLowerCase())) {
      // Return formatted style name
      if (style === 'nhac song' || style === 'nhạc sống') return 'Nhạc Sống';
      if (style === 'cha cha') return 'Cha Cha';
      if (style === 'cha cha cha') return 'Cha Cha Cha';
      if (style === 'bossa nova') return 'Bossa Nova';
      return style.charAt(0).toUpperCase() + style.slice(1);
    }
  }
  
  // Then check single-word styles
  for (const style of STYLE_TOKENS) {
    if (style.includes(' ') || multiWordStyles.includes(style)) continue; // Skip multi-word, already checked
    if (joined.includes(style.toLowerCase())) {
      // Capitalize first letter
      return style.charAt(0).toUpperCase() + style.slice(1).toLowerCase();
    }
  }
  
  return null;
}

// ============================================
// HELPER FUNCTIONS (from original)
// ============================================
function stripDecorations(raw) {
  return raw
    .replace(/\([^)]*\)/g, '')   // remove (Dm / Re Thu)
    .replace(/\[[^\]]*\]/g, '')  // remove [anything]
    .replace(/[-_.]/g, ' ');
}

function tokenize(raw) {
  return removeAccents(raw)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function buildLabel({ tone, isTram, style, version }) {
  const resolvedStyle = style || version || null;

  const parts = [];
  if (tone) parts.push(tone.toLowerCase());
  if (resolvedStyle) parts.push(resolvedStyle.toLowerCase());
  if (isTram) parts.push('tram');

  return parts.length ? parts.join('_') : 'original';
}

function detectKeyFromTokens(tokens) {
  const re = /^([a-g])(#)?(m)?$/i;
  for (const t of tokens) {
    const m = t.match(re);
    if (!m) continue;

    const letter = m[1].toUpperCase();
    const sharp = m[2] ? '#' : '';
    const minor = m[3] ? 'm' : '';

    if (!sharp && !minor && letter.length === 1) continue;

    return `${letter}${sharp}${minor}`;
  }
  return null;
}

// ============================================
// MAIN PARSE FUNCTION (Enhanced)
// ============================================
export function parseFilename(filename, storagePath = '') {
  const original = filename;

  // Remove .mp4 extension
  const base = filename.replace(/\.mp4$/i, '');

  // STEP 1: Handle KARAOKE format: "KARAOKE | Song - Artist" or "ACV Karaoke | Song - Artist"
  let processedBase = base;
  let extractedArtistFromKaraoke = null;
  
  // Match "KARAOKE ｜" or "ACV Karaoke ｜" or similar patterns
  if (/^(ACV\s+)?KARAOKE\s*[|｜]/i.test(base)) {
    // Extract: Title - Artist (before the second pipe or end)
    const karaokeMatch = base.match(/^(?:ACV\s+)?KARAOKE\s*[|｜]\s*([^｜|]+?)(?:\s*[|｜]|$)/i);
    if (karaokeMatch) {
      const titleArtistPart = karaokeMatch[1].trim();
      
      // Split "Title - Artist" format
      const dashMatch = titleArtistPart.match(/^(.+?)\s*-\s*(.+?)$/);
      if (dashMatch) {
        processedBase = dashMatch[1].trim() + (base.match(/[\[\(]/) ? base.substring(base.indexOf('[') || base.indexOf('(')) : '');
        extractedArtistFromKaraoke = dashMatch[2].trim();
      } else {
        // No artist, just use the title part
        processedBase = titleArtistPart + (base.match(/[\[\(]/) ? base.substring(base.indexOf('[') || base.indexOf('(')) : '');
      }
    }
  }

  // STEP 2: Extract metadata from brackets [...] or parentheses (...)
  // Prioritize brackets over parentheses (brackets usually contain tone/style)
  let rawTitle = processedBase;
  let rawMetadata = '';
  
  // First try brackets [...]
  const bracketMatch = processedBase.match(/(.+?)\s*\[(.+?)\]/);
  if (bracketMatch) {
    rawTitle = bracketMatch[1].trim();
    rawMetadata = bracketMatch[2];
  } else {
    // Fallback to parentheses (...)
    const parenMatch = processedBase.match(/(.+?)\s*\((.+?)\)/);
    if (parenMatch) {
      rawTitle = parenMatch[1].trim();
      rawMetadata = parenMatch[2];
    }
  }

  // STEP 3: Handle pipes - prefer part AFTER pipe if it looks like a song title
  let titleWithoutPipes = rawTitle;
  
  // Check if there's a pipe and the part after it looks like a song title
  const fwPipeIdx = rawTitle.indexOf('｜');
  const pipeIdx = rawTitle.indexOf('|');
  const pipePos = fwPipeIdx > 0 ? fwPipeIdx : (pipeIdx > 0 ? pipeIdx : -1);
  
  if (pipePos > 0) {
    const beforePipe = rawTitle.substring(0, pipePos).trim();
    let afterPipe = rawTitle.substring(pipePos + 1).trim();
    
    // Remove file suffixes like ".f298", hash suffixes, etc.
    afterPipe = afterPipe.replace(/\.f\d+$/i, '');
    afterPipe = afterPipe.replace(/__[a-z_]+$/i, '');
    afterPipe = afterPipe.replace(/[._]+$/g, '');
    
    // Check if afterPipe is JUST a mixer name (common Vietnamese mixers)
    const isJustMixer = MIXER_NAMES.some(mixer => {
      const normalized = afterPipe.toLowerCase().trim();
      const mixerLower = mixer.toLowerCase();
      // Check if it's exactly the mixer, or mixer + "SX900", or mixer + short suffix
      return normalized === mixerLower || 
             normalized === mixerLower + ' sx900' ||
             normalized === mixerLower + '__nam' ||
             normalized === mixerLower + '__nu' ||
             (normalized.startsWith(mixerLower) && normalized.length < mixer.length + 20 && 
              !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(normalized));
    });
    
    // Check if beforePipe looks like a song title (has Vietnamese chars)
    const beforeHasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(beforePipe);
    const beforeIsJustKaraoke = /^karaoke\s+/i.test(beforePipe);
    
    // Check if afterPipe is metadata/descriptors (not a real song title)
    const afterIsMetadata = /\b(style|beat|pro|th\s+\d|sx\d+|mới|moi|chuan|chuẩn|dễ\s+hát|de\s+hat|âm\s+thanh|am\s+thanh|chất\s+lượng|chat\s+luong|hay\s+nhất|hay\s+nhat|siêu\s+hay|sieu\s+hay|đẳng\s+cấp|dang\s+cap)\b/i.test(afterPipe);
    
    // If part after pipe looks like a song title (has Vietnamese chars or proper capitalization)
    // and is not just a mixer name, prefer it
    const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(afterPipe);
    const looksLikeTitle = afterPipe.length > 3 && 
                           !isJustMixer && 
                           !afterIsMetadata &&
                           (hasVietnameseChars || /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(afterPipe));
    
    // Decision logic - PREFER beforePipe if it has Vietnamese chars
    // This avoids picking metadata after pipes as titles
    if (beforeHasVietnamese && !beforeIsJustKaraoke) {
      // Use part before pipe (e.g., "Vùng Lá Me Bay ... ｜ Style Rumba" → "Vùng Lá Me Bay")
      titleWithoutPipes = beforePipe.trim();
    } else if (isJustMixer || afterIsMetadata) {
      // After pipe is just mixer or metadata, use before pipe
      titleWithoutPipes = beforePipe.trim();
    } else if (looksLikeTitle && !isJustMixer && !afterIsMetadata) {
      // Use part after pipe as title
      titleWithoutPipes = afterPipe.split('｜')[0].split('|')[0].trim();
    } else {
      // Use part before pipe
      titleWithoutPipes = beforePipe.trim();
    }
  } else {
    // No pipe, just clean up
    titleWithoutPipes = rawTitle.replace(/^[｜|\s]+/, '').trim();
  }
  
  // Remove any remaining pipes
  titleWithoutPipes = titleWithoutPipes.replace(/[｜|]/g, '').trim();

  // STEP 4: Extract artist from full filename FIRST (before title cleanup)
  // This allows us to remove artist from title during cleanup
  const artist = extractedArtistFromKaraoke || extractArtist(base, storagePath);
  
  // STEP 5: Clean the title (remove paths, noise words, etc.)
  let cleanedTitle = cleanTitle(titleWithoutPipes);
  
  // STEP 5a: If cleaned title is empty, too short, or just a mixer, try alternatives
  if (!cleanedTitle || cleanedTitle.length < 3) {
    if (pipePos > 0) {
      const beforePipe = rawTitle.substring(0, pipePos).trim();
      const cleanedBefore = cleanTitle(beforePipe);
      if (cleanedBefore && cleanedBefore.length >= 3) {
        cleanedTitle = cleanedBefore;
      }
    }
  }
  
  // Check if title is just a mixer name - if so, use beforePipe
  const isJustMixer = MIXER_NAMES.some(mixer => {
    const titleLower = cleanedTitle.toLowerCase();
    const mixerLower = mixer.toLowerCase();
    return titleLower === mixerLower || 
           titleLower === mixerLower + ' sx900' ||
           (titleLower.startsWith(mixerLower + ' ') && titleLower.length < mixer.length + 15);
  });
  
  if (isJustMixer && pipePos > 0) {
    const beforePipe = rawTitle.substring(0, pipePos).trim();
    const cleanedBefore = cleanTitle(beforePipe);
    if (cleanedBefore && cleanedBefore.length >= 3) {
      cleanedTitle = cleanedBefore;
    }
  }
  
  // If title is still a mixer or too short, try the full rawTitle before pipe
  if ((isJustMixer || cleanedTitle.length < 3) && pipePos > 0) {
    const beforePipe = rawTitle.substring(0, pipePos).trim();
    // Clean it but preserve more of the title
    let tempTitle = beforePipe
      .replace(/\bkaraoke\b/gi, ' ')
      .replace(/\btone\s+(nam|nu|nữ)\b/gi, ' ')
      .replace(/\bnhac\s+song\b/gi, ' ')
      .replace(/\bnhạc\s+sống\b/gi, ' ')
      .replace(/\b(hay\s+nhat|hay\s+nhất|chat\s+luong\s+cao|chất\s+lượng\s+cao|de\s+hat|dễ\s+hát)\b/gi, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    if (tempTitle && tempTitle.length >= 3 && !MIXER_NAMES.some(m => tempTitle.toLowerCase() === m.toLowerCase())) {
      cleanedTitle = tempTitle;
    }
  }
  
  // STEP 5b: Remove artist from title if it was extracted
  if (artist) {
    // Escape special regex characters in artist name
    const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Remove "Artist - " pattern from beginning
    const artistPattern = new RegExp(`^${escapedArtist}\\s*-\\s*`, 'i');
    cleanedTitle = cleanedTitle.replace(artistPattern, '');
    
    // Remove " - Artist" pattern from end (more flexible matching)
    const artistPatternEnd = new RegExp(`\\s*-\\s*${escapedArtist}\\s*$`, 'i');
    cleanedTitle = cleanedTitle.replace(artistPatternEnd, '');
    
    // Also try partial match if full match doesn't work (for cases like "Minh Vương M4U ft Ngân Ngân")
    if (cleanedTitle.includes(artist)) {
      // Try to remove artist and everything after it if it's at the end
      const artistIndex = cleanedTitle.toLowerCase().indexOf(artist.toLowerCase());
      if (artistIndex > 0 && artistIndex > cleanedTitle.length - artist.length - 10) {
        // Artist is near the end, remove it and everything after
        cleanedTitle = cleanedTitle.substring(0, artistIndex).replace(/\s*-\s*$/, '').trim();
      }
    }
    
    // Remove parentheses if artist was extracted from them
    if (cleanedTitle.includes(`(${artist})`)) {
      cleanedTitle = cleanedTitle.replace(/\s*\([^)]*\)\s*/g, '').trim();
    }
  }
  
  // Remove " - Artist" pattern from title if KARAOKE artist was extracted
  if (extractedArtistFromKaraoke) {
    cleanedTitle = cleanedTitle.replace(/\s+-\s+[^-]+$/, '').trim();
  }
  
  // Final fallback - if still empty or too short, try different strategies
  if (!cleanedTitle || cleanedTitle.length < 2) {
    // Try the full base filename (before metadata extraction)
    const fallbackTitle = base
      .replace(/[\[\(].*?[\]\)]/g, '') // Remove brackets/parentheses
      .replace(/[｜|]/g, ' ') // Replace pipes with space
      .replace(/\bkaraoke\b/gi, ' ')
      .replace(/\btone\s+(nam|nu|nữ)\b/gi, ' ')
      .replace(/\bnhac\s+song\b/gi, ' ')
      .replace(/\bnhạc\s+sống\b/gi, ' ')
      .replace(/\b(hay\s+nhat|hay\s+nhất|chat\s+luong\s+cao|chất\s+lượng\s+cao)\b/gi, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\.f\d+$/i, '')
      .replace(/__[a-z_]+$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    if (fallbackTitle && fallbackTitle.length >= 2) {
      cleanedTitle = fallbackTitle;
    } else {
      cleanedTitle = rawTitle.replace(/[｜|]/g, '').trim();
    }
  }
  
  // Final cleanup - remove any remaining noise
  cleanedTitle = cleanedTitle
    .replace(/\bkaraoke\b/gi, ' ')
    .replace(/\btone\s+(nam|nu|nữ)/gi, ' ')  // Remove "Tone Nam/Nữ"
    .replace(/\s+tone\s+(nam|nu|nữ)/gi, ' ') // Remove " Tone Nam/Nữ" (with space before)
    .replace(/\bsong\s+ca\b/gi, ' ')
    .replace(/\s*-\s*tone\s+(nam|nu|nữ)/gi, ' ')
    .replace(/\s*-\s*(bolero|ballad|nhạc\s+xuân|nhac\s+xuan|ất\s+tỵ|at\s+ty)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[._]+$/g, '') // Remove trailing dots and underscores
    .replace(/\s*-\s*$/g, '') // Remove trailing dash
    .trim();

  // STEP 6: Tokenize metadata AND title AND full filename for tone/style extraction
  // Tone can be in title, metadata, or filename
  const metadataCleaned = stripDecorations(rawMetadata || '');
  const titleCleaned = stripDecorations(cleanedTitle);
  const baseCleaned = stripDecorations(base);
  const allText = `${baseCleaned} ${metadataCleaned} ${titleCleaned}`;
  const tokens = tokenize(allText);

  let tone = null;
  let version = null;
  let mixer = null;

  let isTram = false;
  let style = null;
  const titleTokens = [];

  const joined = ` ${tokens.join(' ')} `;

  // Detect song ca (duet) from tokens AND base filename
  const isSongCa = /\bsong\s+ca\b/i.test(joined) || 
                   /\bduet\b/i.test(joined) || 
                   /\bsong\s+ca\b/i.test(base) ||
                   /__song_ca\b/i.test(base); // Also check __song_ca suffix
  if (isSongCa) style = 'song_ca';

  // Parse tokens for metadata
  // First, check for explicit "tone nam/nu" patterns in base filename (these take priority)
  const explicitToneMatch = base.match(/\btone\s+(nam|nu|nữ|male|female)\b/i);
  if (explicitToneMatch) {
    const toneValue = explicitToneMatch[1].toLowerCase();
    if (toneValue === 'nam' || toneValue === 'male') {
      tone = 'nam';
    } else {
      tone = 'nu';
    }
  }
  
  for (const t of tokens) {
    // Handle "nam" and "nu" tokens - distinguish between metadata and title content
    if (['nam', 'male'].includes(t)) {
      // Check if this "nam" is near "tone" keyword (metadata context)
      const namIndex = joined.indexOf(` ${t} `);
      const toneIndex = joined.indexOf(' tone ');
      const isToneContext = toneIndex > 0 && namIndex > 0 && Math.abs(namIndex - toneIndex) < 20;
      
      // If it's in tone context, set tone (if not already set) and skip titleTokens
      if (isToneContext) {
        if (!tone && !(isSongCa && joined.includes('nu'))) {
          tone = 'nam';
        }
        continue; // Skip adding to titleTokens (it's metadata)
      }
      // Otherwise, fall through to add to titleTokens (it's part of title like "năm")
    }
    
    if (['nu', 'female', 'nữ'].includes(t)) {
      // Check if this "nu" appears near "tone" (metadata context)
      const nuIndex = joined.indexOf(` ${t} `);
      const toneIndex = joined.indexOf(' tone ');
      const isToneContext = nuIndex > 0 && toneIndex > 0 && Math.abs(nuIndex - toneIndex) < 20;
      
      // If it's in tone context, set tone (if not already set) and skip titleTokens
      if (isToneContext) {
        if (!tone && !(isSongCa && joined.includes('nam'))) {
          tone = 'nu';
        }
        continue; // Skip adding to titleTokens (it's metadata)
      }
      // Otherwise, fall through to add to titleTokens (it's part of title)
    }

    if (t === 'tram' || t === 'trầm') {
      isTram = true;
      continue;
    }

    // Style detection
    if (STYLE_TOKENS.map(s => s.toLowerCase()).includes(t)) {
      style = style || t;
      continue;
    }

    if (VERSION_TOKENS.includes(t)) {
      version = t;
      continue;
    }

    if (IGNORE_TOKENS.includes(t)) {
      continue;
    }

    titleTokens.push(t);
  }

  const key = detectKeyFromTokens(tokens);

  // Build normalized title from cleaned title tokens
  const cleanedTitleTokens = tokenize(cleanedTitle);
  const normalized_title = cleanedTitleTokens.join(' ').trim();

  // Clean tone (normalize to Nam/Nữ)
  // Check filename directly for "tone nam/nu" patterns - check thoroughly
  if (!tone) {
    // Check in base filename (full filename)
    const toneMatch = base.match(/\btone\s+(nam|nu|nữ|male|female)\b/i);
    if (toneMatch) {
      const toneValue = toneMatch[1].toLowerCase();
      tone = (toneValue === 'nam' || toneValue === 'male') ? 'nam' : 'nu';
    } else {
      // Check in raw metadata
      const metadataToneMatch = rawMetadata.match(/\btone\s+(nam|nu|nữ|male|female)\b/i);
      if (metadataToneMatch) {
        const toneValue = metadataToneMatch[1].toLowerCase();
        tone = (toneValue === 'nam' || toneValue === 'male') ? 'nam' : 'nu';
      } else {
        // Check in original filename (storage path)
        if (storagePath) {
          const storageToneMatch = storagePath.match(/\btone\s+(nam|nu|nữ|male|female)\b/i);
          if (storageToneMatch) {
            const toneValue = storageToneMatch[1].toLowerCase();
            tone = (toneValue === 'nam' || toneValue === 'male') ? 'nam' : 'nu';
          }
        }
      }
    }
  }
  const cleanedTone = tone ? (tone === 'nam' ? 'Nam' : 'Nữ') : null;
  
  // Extract channel from full filename AND metadata (check both locations)
  let channel = extractChannel(base, rawMetadata || '');
  
  // Also check storage path if channel not found
  if (!channel && storagePath) {
    channel = extractChannel(storagePath, '');
  }
  
  // Extract style from tokens AND base filename (nhac song might be in filename)
  let extractedStyle = extractStyle(tokens);
  
  // Also check base filename directly for "nhac song" if not found in tokens
  if (!extractedStyle && /nhac\s+song|nhạc\s+sống/i.test(base)) {
    extractedStyle = 'Nhạc Sống';
  }
  
  // Final style (use extractedStyle if available, otherwise use style from token parsing)
  const finalStyle = extractedStyle || style;
  
  // Detect performance type - check full filename including metadata AND underscore suffixes
  const fullTextForPerformance = `${base} ${rawMetadata || ''} ${storagePath || ''}`.toLowerCase();
  const performanceType = detectPerformanceType(cleanedTitle, fullTextForPerformance);

  const label = buildLabel({ tone, isTram, style: finalStyle, version });

  return {
    original,
    title_display: cleanedTitle,
    title_clean: cleanedTitle,
    normalized_title,
    tone: cleanedTone,
    version,
    label,
    key,
    mixer: channel,
    is_tram: isTram,
    style: finalStyle,
    artist_name: artist,
    performance_type: performanceType,
    channel: channel
  };
}
