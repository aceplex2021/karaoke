// test-from-database.js
// Test enhanced parser on real filenames from database
import { parseFilename } from './parseFilename-enhanced.js';
import { getSupabase } from './supabase.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory if not already set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const parentEnvPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(parentEnvPath, 'utf-8');
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    });
    
    // Also map NEXT_PUBLIC_SUPABASE_URL to SUPABASE_URL if needed
    if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  } catch (err) {
    // .env file not found, that's okay - user might set env vars directly
  }
}

const limit = parseInt(process.argv[2]) || 20;
const offset = parseInt(process.argv[3]) || 0;

console.log('🎤 Testing Enhanced Parser on Real Database Files\n');
console.log('='.repeat(80));
console.log(`Fetching ${limit} files from database (offset: ${offset})...\n`);

try {
  const supabase = getSupabase();
  
  // Fetch files from database
  const { data: files, error } = await supabase
    .from('kara_files')
    .select('storage_path')
    .eq('type', 'video')
    .limit(limit)
    .range(offset, offset + limit - 1)
    .order('id', { ascending: false }); // Get recent files
  
  if (error) {
    console.error('❌ Error fetching files:', error.message);
    process.exit(1);
  }
  
  if (!files || files.length === 0) {
    console.log('❌ No files found in database');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} files to test\n`);

  let stats = {
    total: 0,
    withArtist: 0,
    withChannel: 0,
    withStyle: 0,
    withTone: 0,
    duets: 0,
    medleys: 0,
    groups: 0,
    solos: 0,
    cleanedTitles: 0,
    titlesWithPipes: 0
  };

  console.log('━'.repeat(80));
  
  for (const file of files) {
    const storagePath = file.storage_path;
    const filename = storagePath.split('/').pop() || storagePath;
    
    if (!filename.endsWith('.mp4')) continue;
    
    stats.total++;
    const result = parseFilename(filename, storagePath);
    
    // Collect statistics
    if (result.artist_name) stats.withArtist++;
    if (result.channel) stats.withChannel++;
    if (result.style) stats.withStyle++;
    if (result.tone) stats.withTone++;
    
    switch (result.performance_type) {
      case 'duet': stats.duets++; break;
      case 'medley': stats.medleys++; break;
      case 'group': stats.groups++; break;
      default: stats.solos++; break;
    }
    
    // Check if title was cleaned
    const originalTitle = filename.replace(/\.mp4$/i, '');
    if (result.title_clean !== originalTitle) {
      stats.cleanedTitles++;
    }
    
    // Check for pipes
    if (originalTitle.includes('｜') || originalTitle.includes('|')) {
      stats.titlesWithPipes++;
    }
    
    // Show all results
    console.log(`\n📁 File: ${filename}`);
    console.log(`   Original:    "${originalTitle}"`);
    console.log(`   Title:       "${result.title_clean}"`);
    if (result.artist_name) console.log(`   Artist:      ${result.artist_name}`);
    if (result.tone) console.log(`   Tone:        ${result.tone}`);
    if (result.channel) console.log(`   Channel:     ${result.channel}`);
    if (result.style) console.log(`   Style:       ${result.style}`);
    console.log(`   Performance: ${result.performance_type}`);
    console.log(`   Label:       ${result.label}`);
  }

  console.log('\n' + '━'.repeat(80));
  console.log('\n📊 Statistics:\n');
  console.log(`Total files tested:     ${stats.total}`);
  console.log(`\n✨ Cleanup Results:`);
  console.log(`   Titles cleaned:      ${stats.cleanedTitles} (${Math.round(stats.cleanedTitles/stats.total*100)}%)`);
  console.log(`   Titles with pipes:   ${stats.titlesWithPipes} (${Math.round(stats.titlesWithPipes/stats.total*100)}%)`);
  console.log(`\n🎤 Extraction Results:`);
  console.log(`   Artists extracted:   ${stats.withArtist} (${Math.round(stats.withArtist/stats.total*100)}%)`);
  console.log(`   Channels found:      ${stats.withChannel} (${Math.round(stats.withChannel/stats.total*100)}%)`);
  console.log(`   Styles detected:     ${stats.withStyle} (${Math.round(stats.withStyle/stats.total*100)}%)`);
  console.log(`   Tones detected:      ${stats.withTone} (${Math.round(stats.withTone/stats.total*100)}%)`);
  console.log(`\n🎭 Performance Types:`);
  console.log(`   Solo:   ${stats.solos}`);
  console.log(`   Duet:   ${stats.duets}`);
  console.log(`   Medley: ${stats.medleys}`);
  console.log(`   Group:  ${stats.groups}`);
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Testing complete! Review the statistics above.');
  console.log('If results look good, the enhanced parser is ready for integration.\n');

} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error('\nMake sure:');
  console.error('1. Supabase connection is configured (.env file)');
  console.error('2. Node modules are installed (npm install)');
  console.error('3. Database has kara_files table with data\n');
  process.exit(1);
}
