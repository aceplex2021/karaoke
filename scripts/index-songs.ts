/**
 * Script to index karaoke videos from filesystem into database
 * 
 * Usage:
 * 1. Update MEDIA_SERVER_URL and scan directory
 * 2. Run: tsx scripts/index-songs.ts
 * 
 * This script scans a directory for video files and indexes them into kara_songs table.
 * You'll need to customize the file parsing logic based on your file naming convention.
 */

import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { supabaseAdmin } from '../src/server/lib/supabase';
import dotenv from 'dotenv';

dotenv.config();

interface SongFile {
  filePath: string;
  title: string;
  artist?: string;
  language?: string;
  youtubeId?: string;
}

/**
 * Parse filename to extract song metadata
 * Customize this based on your file naming convention
 * 
 * Examples:
 * - "Artist - Title.mp4"
 * - "Title - Artist.mp4"
 * - "Title (Language).mp4"
 */
function parseFilename(filename: string): Partial<SongFile> {
  const nameWithoutExt = basename(filename, extname(filename));
  
  // Example: "Artist - Title" or "Title - Artist"
  const parts = nameWithoutExt.split(' - ');
  
  if (parts.length >= 2) {
    return {
      title: parts[1] || parts[0],
      artist: parts[0] || undefined,
    };
  }
  
  return {
    title: nameWithoutExt,
  };
}

/**
 * Get video duration (requires ffprobe or similar)
 * For now, returns null - you can add ffprobe integration if needed
 */
async function getVideoDuration(filePath: string): Promise<number | null> {
  // TODO: Use ffprobe or similar to get actual duration
  // For now, return null
  return null;
}

/**
 * Scan directory for video files
 */
async function scanDirectory(dir: string): Promise<SongFile[]> {
  const songs: SongFile[] = [];
  const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];
  
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
          const parsed = parseFilename(entry);
          songs.push({
            filePath: relativeFilePath,
            title: parsed.title || entry,
            artist: parsed.artist,
            language: parsed.language || 'en',
          });
        }
      }
    }
  }
  
  await scan(dir);
  return songs;
}

/**
 * Index songs into database
 */
async function indexSongs(songs: SongFile[]) {
  console.log(`Indexing ${songs.length} songs...`);
  
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const song of songs) {
    try {
      // Check if song already exists
      const { data: existing } = await supabaseAdmin
        .from('kara_songs')
        .select('id')
        .eq('file_path', song.filePath)
        .single();
      
      if (existing) {
        console.log(`Skipping existing: ${song.filePath}`);
        skipped++;
        continue;
      }
      
      // Get duration if possible
      const duration = await getVideoDuration(song.filePath);
      
      // Insert song
      const { error } = await supabaseAdmin.from('kara_songs').insert({
        title: song.title,
        artist: song.artist || null,
        language: song.language || 'en',
        file_path: song.filePath,
        duration: duration,
        youtube_id: song.youtubeId || null,
      });
      
      if (error) {
        console.error(`Error indexing ${song.filePath}:`, error.message);
        errors++;
      } else {
        indexed++;
        if (indexed % 10 === 0) {
          console.log(`Indexed ${indexed} songs...`);
        }
      }
    } catch (err: any) {
      console.error(`Error processing ${song.filePath}:`, err.message);
      errors++;
    }
  }
  
  console.log(`\nDone!`);
  console.log(`Indexed: ${indexed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

/**
 * Main function
 */
async function main() {
  const scanDir = process.argv[2];
  
  if (!scanDir) {
    console.error('Usage: tsx scripts/index-songs.ts <directory>');
    console.error('Example: tsx scripts/index-songs.ts /path/to/karaoke/videos');
    process.exit(1);
  }
  
  try {
    console.log(`Scanning directory: ${scanDir}`);
    const songs = await scanDirectory(scanDir);
    console.log(`Found ${songs.length} video files`);
    
    if (songs.length === 0) {
      console.log('No video files found. Exiting.');
      return;
    }
    
    await indexSongs(songs);
  } catch (err: any) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

