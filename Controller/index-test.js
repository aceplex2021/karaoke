// index-test.js
// Test enhanced parser on real files (without writing to database)
import { parseFilename } from './parseFilename-enhanced.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

const testDir = process.argv[2] || '/mnt/HomeServer/Media/Music/Karaoke/Videos';
const limit = parseInt(process.argv[3]) || 10;

console.log('🎤 Testing Enhanced Parser on Real Files\n');
console.log('='.repeat(80));
console.log(`Scanning: ${testDir}`);
console.log(`Limit: ${limit} files\n`);

try {
  const files = (await readdir(testDir))
    .filter(f => f.toLowerCase().endsWith('.mp4'))
    .slice(0, limit);

  if (files.length === 0) {
    console.log('❌ No .mp4 files found in directory');
    process.exit(1);
  }

  console.log(`Found ${files.length} files to test\n`);

  let stats = {
    total: 0,
    withArtist: 0,
    withChannel: 0,
    withStyle: 0,
    duets: 0,
    medleys: 0,
    groups: 0,
    solos: 0,
    cleanedTitles: 0
  };

  for (const file of files) {
    const storagePath = `/Videos/${file}`;
    const result = parseFilename(file, storagePath);
    
    stats.total++;
    if (result.artist_name) stats.withArtist++;
    if (result.channel) stats.withChannel++;
    if (result.style) stats.withStyle++;
    
    switch (result.performance_type) {
      case 'duet': stats.duets++; break;
      case 'medley': stats.medleys++; break;
      case 'group': stats.groups++; break;
      default: stats.solos++; break;
    }
    
    if (result.title_clean !== file.replace(/\.mp4$/i, '')) {
      stats.cleanedTitles++;
    }
    
    console.log('━'.repeat(80));
    console.log(`File: ${file}`);
    console.log(`\n✨ Cleaned Output:`);
    console.log(`   Title:       "${result.title_clean}"`);
    console.log(`   Artist:      ${result.artist_name || '(none)'}`);
    console.log(`   Tone:        ${result.tone || '(none)'}`);
    console.log(`   Channel:     ${result.channel || '(none)'}`);
    console.log(`   Style:       ${result.style || '(none)'}`);
    console.log(`   Performance: ${result.performance_type}`);
    console.log(`   Label:       ${result.label}`);
    if (result.key) console.log(`   Key:         ${result.key}`);
    if (result.is_tram) console.log(`   Tram:        yes`);
    console.log();
  }

  console.log('━'.repeat(80));
  console.log('\n📊 Statistics:\n');
  console.log(`Total files:          ${stats.total}`);
  console.log(`Titles cleaned:       ${stats.cleanedTitles} (${Math.round(stats.cleanedTitles/stats.total*100)}%)`);
  console.log(`Artists extracted:    ${stats.withArtist} (${Math.round(stats.withArtist/stats.total*100)}%)`);
  console.log(`Channels identified:  ${stats.withChannel} (${Math.round(stats.withChannel/stats.total*100)}%)`);
  console.log(`Styles detected:      ${stats.withStyle} (${Math.round(stats.withStyle/stats.total*100)}%)`);
  console.log(`\nPerformance types:`);
  console.log(`  Solo:   ${stats.solos}`);
  console.log(`  Duet:   ${stats.duets}`);
  console.log(`  Medley: ${stats.medleys}`);
  console.log(`  Group:  ${stats.groups}`);
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Testing complete! Review the output above.');
  console.log('If results look good, proceed to database integration testing.');

} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error('\nMake sure:');
  console.error('1. Directory exists and is readable');
  console.error('2. Node modules are installed (npm install)');
  console.error('3. You\'re using Node.js with ES modules support\n');
  process.exit(1);
}
