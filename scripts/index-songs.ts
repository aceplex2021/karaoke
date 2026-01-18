/**
 * ENHANCED INDEXING SCRIPT WITH INTELLIGENT CLEANUP
 * 
 * This script handles ALL data cleanup at ingestion time:
 * 1. Clean title (remove pipes, noise words, paths)
 * 2. Extract artist from storage_path patterns
 * 3. Detect performance type (solo/duet/medley/group)
 * 4. Parse version metadata (tone, channel, style)
 * 5. Normalize and deduplicate
 * 
 * Usage:
 *   tsx scripts/index-songs.ts /mnt/HomeServer/Media/Music/Karaoke/Videos
 */

import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { supabaseAdmin } from '../src/server/lib/supabase';
import dotenv from 'dotenv';

dotenv.config();

interface ParsedFile {
  storage_path: string;
  base_title: string;           // Clean title
  base_title_unaccent: string;  // For grouping
  full_title: string;            // Original filename
  tone?: string;                 // "Nam" or "Nữ"
  channel?: string;              // Mixer/channel name
  style?: string;                // Beat, Bolero, Ballad, etc.
  artist_name?: string;          // Extracted artist
  performance_type: string;      // solo, duet, medley, group
  version_label: string;         // Combined label
}

// ============================================
// TITLE CLEANUP
// ============================================
function cleanTitle(rawTitle: string): string {
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
  
  // Remove "karaoke" prefix (case insensitive)
  cleaned = cleaned.replace(/^karaoke\s+/i, '');
  
  // Remove noise words
  cleaned = cleaned.replace(/nhac\s+song/gi, '');
  cleaned = cleaned.replace(/nhạc\s+sống/gi, '');
  cleaned = cleaned.replace(/chat\s+luong\s+cao/gi, '');
  cleaned = cleaned.replace(/chất\s+lượng\s+cao/gi, '');
  cleaned = cleaned.replace(/de\s+hat/gi, '');
  cleaned = cleaned.replace(/dễ\s+hát/gi, '');
  cleaned = cleaned.replace(/\bchuan\b/gi, '');
  cleaned = cleaned.replace(/\bchuẩn\b/gi, '');
  
  // Clean whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  return cleaned || rawTitle;
}

// ============================================
// ARTIST EXTRACTION
// ============================================
function extractArtist(storagePath: string): string | undefined {
  const filename = basename(storagePath, extname(storagePath));
  
  // Common Vietnamese mixers to exclude
  const mixers = /^(Trong Hieu|Trọng Hiếu|Kim Quy|Gia Huy|Nam Tran|Nam Trân|Tas Beat|Công Trình|Cong Trinh|Nhật Nguyễn|Nhat Nguyen|Thanh Tung|Karaoke Công Trình)$/i;
  
  // Pattern 1: English Artist - Song Title
  // Example: "Aespa Whiplash", "Taylor Swift Love Story"
  const englishMatch = filename.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[A-Z]/);
  if (englishMatch) {
    const artist = englishMatch[1].trim();
    if (artist.length >= 3 && artist.length < 50) {
      return artist;
    }
  }
  
  // Pattern 2: Vietnamese Composer in Parentheses
  // Example: "Tinh Don Phuong (Trinh Cong Son)"
  const composerMatch = filename.match(/\(([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){1,3})\)/);
  if (composerMatch) {
    const artist = composerMatch[1].trim();
    if (!mixers.test(artist) && artist.length >= 3 && artist.length < 50) {
      return artist;
    }
  }
  
  // Pattern 3: KARAOKE | Song - Artist
  // Example: "KARAOKE | Dem Lanh - Dan Nguyen"
  if (/^KARAOKE\s*[|｜]/i.test(filename)) {
    const artistMatch = filename.match(/[|｜][^-]+\s*-\s*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){0,2})\s*$/);
    if (artistMatch) {
      const artist = artistMatch[1].trim();
      if (!mixers.test(artist) && artist.length >= 3 && artist.length < 50) {
        return artist;
      }
    }
  }
  
  return undefined;
}

// ============================================
// PERFORMANCE TYPE DETECTION
// ============================================
function detectPerformanceType(title: string, versionLabel: string): string {
  // Check version label for "song ca" (duet)
  if (/song.?ca/i.test(versionLabel)) {
    return 'duet';
  }
  
  // Check title for "lien khuc" (medley)
  if (/lien.?khuc|liên khúc/i.test(title)) {
    return 'medley';
  }
  
  // Check title for "hop ca" (group)
  if (/hop.?ca|hợp ca/i.test(title)) {
    return 'group';
  }
  
  return 'solo';
}

// ============================================
// TONE CLEANING
// ============================================
function cleanTone(rawLabel: string): string | undefined {
  if (!rawLabel) return undefined;
  
  // Extract tone from label
  const toneMatch = rawLabel.match(/\b(nam|nu|nữ|male|female|boy|girl)\b/i);
  if (!toneMatch) return undefined;
  
  const tone = toneMatch[1].toLowerCase();
  if (tone === 'nam' || tone === 'male' || tone === 'boy') return 'Nam';
  if (tone === 'nu' || tone === 'nữ' || tone === 'female' || tone === 'girl') return 'Nữ';
  
  return undefined;
}

// ============================================
// CHANNEL (MIXER) EXTRACTION
// ============================================
function extractChannel(rawLabel: string): string | undefined {
  if (!rawLabel) return undefined;
  
  // Common Vietnamese channel names
  const channelPattern = /(Trọng Hiếu|Trong Hieu|Kim Quy|Gia Huy|Nam Trân|Nam Tran|Công Trình|Cong Trinh|Nhật Nguyễn|Nhat Nguyen|Thanh Tung|Tas Beat)/i;
  const match = rawLabel.match(channelPattern);
  
  return match ? match[1] : undefined;
}

// ============================================
// STYLE EXTRACTION
// ============================================
function extractStyle(rawLabel: string): string | undefined {
  if (!rawLabel) return undefined;
  
  // Common style keywords
  const stylePattern = /\b(beat|bolero|ballad|remix|rumba|cha\s?cha|tango|valse|slow|bossa\s?nova|jazz|blues|rock|pop|rap)\b/i;
  const match = rawLabel.match(stylePattern);
  
  if (match) {
    const style = match[1].toLowerCase().replace(/\s+/g, ' ');
    return style.charAt(0).toUpperCase() + style.slice(1);
  }
  
  return undefined;
}

// ============================================
// FILENAME PARSING
// ============================================
function parseFilename(storagePath: string): ParsedFile {
  const filename = basename(storagePath, extname(storagePath));
  
  // Extract metadata in brackets [...] or parentheses (...)
  const metadataMatch = filename.match(/(.+?)\s*[\[\(](.+?)[\]\)]/);
  
  let rawTitle = filename;
  let rawMetadata = '';
  
  if (metadataMatch) {
    rawTitle = metadataMatch[1].trim();
    rawMetadata = metadataMatch[2];
  }
  
  // Clean the title
  const baseTitle = cleanTitle(rawTitle);
  
  // Create unaccented version for grouping
  const baseUnaccent = baseTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
  
  // Extract metadata
  const tone = cleanTone(rawMetadata);
  const channel = extractChannel(rawMetadata);
  const style = extractStyle(rawMetadata);
  
  // Extract artist from storage path
  const artist = extractArtist(storagePath);
  
  // Create version label
  const labelParts: string[] = [];
  if (tone) labelParts.push(tone);
  if (channel) labelParts.push(channel);
  if (style) labelParts.push(style);
  const versionLabel = labelParts.length > 0 ? labelParts.join('_').toLowerCase() : 'default';
  
  // Detect performance type
  const performanceType = detectPerformanceType(baseTitle, versionLabel);
  
  return {
    storage_path: storagePath,
    base_title: baseTitle,
    base_title_unaccent: baseUnaccent,
    full_title: filename,
    tone,
    channel,
    style,
    artist_name: artist,
    performance_type: performanceType,
    version_label: versionLabel,
  };
}

// ============================================
// DIRECTORY SCANNING
// ============================================
async function scanDirectory(dir: string, baseDir: string): Promise<ParsedFile[]> {
  const files: ParsedFile[] = [];
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
  
  async function scan(currentDir: string, relativePath: string = '') {
    const entries = await readdir(currentDir);
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relativeFilePath = relativePath ? `${relativePath}/${entry}` : entry;
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await scan(fullPath, relativeFilePath);
      } else if (stats.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (videoExtensions.includes(ext)) {
          const storagePath = `/Videos/${relativeFilePath}`;
          files.push(parseFilename(storagePath));
        }
      }
    }
  }
  
  await scan(dir);
  return files;
}

// ============================================
// DATABASE INDEXING
// ============================================
async function indexFiles(files: ParsedFile[]) {
  console.log(`\nIndexing ${files.length} files...`);
  
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      // Check if file already indexed
      const { data: existingFile } = await supabaseAdmin
        .from('kara_files')
        .select('id')
        .eq('storage_path', file.storage_path)
        .maybeSingle();
      
      if (existingFile) {
        skipped++;
        if (skipped % 100 === 0) {
          console.log(`Skipped ${skipped} existing files...`);
        }
        continue;
      }
      
      // Step 1: Find or create song group
      let { data: group } = await supabaseAdmin
        .from('kara_song_groups')
        .select('id, base_title_display')
        .eq('base_title_unaccent', file.base_title_unaccent)
        .maybeSingle();
      
      if (!group) {
        const { data: newGroup, error: groupError } = await supabaseAdmin
          .from('kara_song_groups')
          .insert({
            base_title_unaccent: file.base_title_unaccent,
            base_title_display: file.base_title,
          })
          .select('id, base_title_display')
          .single();
        
        if (groupError) throw groupError;
        group = newGroup;
      }
      
      // Step 2: Find or create song with artist and performance type
      let { data: song } = await supabaseAdmin
        .from('kara_songs')
        .select('id')
        .eq('title', file.base_title)
        .maybeSingle();
      
      if (!song) {
        const { data: newSong, error: songError } = await supabaseAdmin
          .from('kara_songs')
          .insert({
            title: file.base_title,
            base_title_unaccent: file.base_title_unaccent,
            artist_name: file.artist_name,
            performance_type: file.performance_type,
          })
          .select('id')
          .single();
        
        if (songError) throw songError;
        song = newSong;
        
        // Link song to group
        await supabaseAdmin
          .from('kara_song_group_members')
          .insert({
            group_id: group.id,
            song_id: song.id,
          });
      } else {
        // Update existing song with artist and performance type if missing
        await supabaseAdmin
          .from('kara_songs')
          .update({
            artist_name: file.artist_name || undefined,
            performance_type: file.performance_type,
          })
          .eq('id', song.id);
        
        // Ensure song is in group
        const { data: membership } = await supabaseAdmin
          .from('kara_song_group_members')
          .select('group_id')
          .eq('song_id', song.id)
          .eq('group_id', group.id)
          .maybeSingle();
        
        if (!membership) {
          await supabaseAdmin
            .from('kara_song_group_members')
            .insert({
              group_id: group.id,
              song_id: song.id,
            });
        }
      }
      
      // Step 3: Find or create version
      let { data: version } = await supabaseAdmin
        .from('kara_versions')
        .select('id')
        .eq('song_id', song.id)
        .eq('label', file.version_label)
        .maybeSingle();
      
      if (!version) {
        const { data: newVersion, error: versionError } = await supabaseAdmin
          .from('kara_versions')
          .insert({
            song_id: song.id,
            label: file.version_label,
            is_default: file.version_label === 'default',
          })
          .select('id')
          .single();
        
        if (versionError) throw versionError;
        version = newVersion;
      }
      
      // Step 4: Create file entry
      const { error: fileError } = await supabaseAdmin
        .from('kara_files')
        .insert({
          version_id: version.id,
          storage_path: file.storage_path,
          type: 'video',
          format: extname(file.storage_path).substring(1),
        });
      
      if (fileError) throw fileError;
      
      indexed++;
      if (indexed % 10 === 0) {
        console.log(`Indexed ${indexed}/${files.length} files...`);
      }
      
    } catch (err: any) {
      console.error(`Error indexing ${file.storage_path}:`, err.message);
      errors++;
    }
  }
  
  console.log(`\n============================================`);
  console.log(`INDEXING COMPLETE`);
  console.log(`Indexed: ${indexed}`);
  console.log(`Skipped: ${skipped} (already in database)`);
  console.log(`Errors: ${errors}`);
  console.log(`============================================`);
}

// ============================================
// MAIN
// ============================================
async function main() {
  const scanDir = process.argv[2];
  
  if (!scanDir) {
    console.error('Usage: tsx scripts/index-songs.ts <directory>');
    console.error('Example: tsx scripts/index-songs.ts /mnt/HomeServer/Media/Music/Karaoke/Videos');
    process.exit(1);
  }
  
  try {
    console.log(`Scanning directory: ${scanDir}`);
    const files = await scanDirectory(scanDir, scanDir);
    console.log(`Found ${files.length} video files`);
    
    if (files.length === 0) {
      console.log('No video files found. Exiting.');
      return;
    }
    
    // Show sample parsed files
    console.log(`\n========== SAMPLE PARSED FILES ==========`);
    files.slice(0, 5).forEach((f, i) => {
      console.log(`\n${i + 1}. ${f.storage_path}`);
      console.log(`   Title: "${f.base_title}"`);
      console.log(`   Label: ${f.version_label}`);
      console.log(`   Performance: ${f.performance_type}`);
      if (f.artist_name) console.log(`   Artist: ${f.artist_name}`);
      if (f.tone) console.log(`   Tone: ${f.tone}`);
      if (f.channel) console.log(`   Channel: ${f.channel}`);
      if (f.style) console.log(`   Style: ${f.style}`);
    });
    console.log(`\n========================================`);
    
    console.log(`\nProceed with indexing? (Press Ctrl+C to cancel)`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await indexFiles(files);
  } catch (err: any) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
