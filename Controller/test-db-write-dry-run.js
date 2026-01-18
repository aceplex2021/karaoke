// test-db-write-dry-run.js
// DRY RUN: Test parsing only, NO database writes
import { parseFilename } from './parseFilename-enhanced.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory
if (!process.env.SUPABASE_URL) {
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
    
    if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  } catch (err) {
    console.error('Failed to load .env:', err.message);
  }
}

async function testParsingOnly() {
  console.log('🧪 DRY RUN: Testing Parser Only (NO DATABASE WRITES)\n');
  
  // Test cases with different patterns
  const testFiles = [
    {
      name: 'English Artist - Song',
      filename: 'Sabrina Carpenter - Sugar Talking (Karaoke Version).mp4',
      expectedArtist: 'Sabrina Carpenter',
      expectedPerformance: 'solo',
      expectedTone: null
    },
    {
      name: 'Song Ca (Duet) with Artist',
      filename: 'ACV Karaoke ｜ Cứ Ngỡ Hạnh Phúc Thật Gần - Minh Vương M4U ft Ngân Ngân ｜ Beat Chuẩn Song Ca__song_ca.mp4',
      expectedArtist: 'Minh Vương M4U ft Ngân Ngân',
      expectedPerformance: 'duet',
      expectedTone: null
    },
    {
      name: 'Medley (Liên Khúc)',
      filename: 'Karaoke Liên Khúc Tone Nam Nhạc Sống Hay Nhất 2025 ｜ Chuyện Đêm Mưa & Dấu Chân Kỷ Niệm.f298__nam.mp4',
      expectedArtist: null,
      expectedPerformance: 'medley',
      expectedTone: 'Nam'
    },
    {
      name: 'With Channel/Mixer',
      filename: 'Bến Sông Chờ Karaoke Tone Nam ( F#m ) Cha Cha Cha Nhạc Sống ｜ Trọng Hiếu__nam.mp4',
      expectedArtist: null,
      expectedPerformance: 'solo',
      expectedTone: 'Nam',
      expectedChannel: 'Trọng Hiếu'
    },
    {
      name: 'Tone Nữ with Style',
      filename: 'Vùng Lá Me Bay Karaoke Tone Nữ Nhạc Sống ｜ Style Rumba Pro TH 3 ｜ Trọng Hiếu__nu.mp4',
      expectedArtist: null,
      expectedPerformance: 'solo',
      expectedTone: 'Nữ',
      expectedChannel: 'Trọng Hiếu'
    }
  ];
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of testFiles) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📁 ${test.name}`);
    console.log(`   File: ${test.filename}`);
    console.log('='.repeat(80));
    
    try {
      // Parse filename
      const meta = parseFilename(test.filename, `/test/${test.filename}`);
      
      console.log('\n📊 PARSED METADATA:');
      console.log(`   Title:       "${meta.title_clean}"`);
      console.log(`   Artist:      ${meta.artist_name || '(none)'}`);
      console.log(`   Performance: ${meta.performance_type}`);
      console.log(`   Tone:        ${meta.tone || '(none)'}`);
      console.log(`   Style:       ${meta.style || '(none)'}`);
      console.log(`   Channel:     ${meta.channel || '(none)'}`);
      console.log(`   Label:       ${meta.label}`);
      
      // Verify expectations
      console.log('\n✅ VERIFICATION:');
      let testPassed = true;
      
      // Check artist
      const artistMatch = meta.artist_name === test.expectedArtist;
      const artistIcon = artistMatch ? '✅' : '❌';
      console.log(`   ${artistIcon} Artist:      expected "${test.expectedArtist || 'null'}", got "${meta.artist_name || 'null'}"`);
      if (!artistMatch) testPassed = false;
      
      // Check performance type
      const perfMatch = meta.performance_type === test.expectedPerformance;
      const perfIcon = perfMatch ? '✅' : '❌';
      console.log(`   ${perfIcon} Performance: expected "${test.expectedPerformance}", got "${meta.performance_type}"`);
      if (!perfMatch) testPassed = false;
      
      // Check tone
      const toneMatch = meta.tone === test.expectedTone;
      const toneIcon = toneMatch ? '✅' : '❌';
      console.log(`   ${toneIcon} Tone:        expected "${test.expectedTone || 'null'}", got "${meta.tone || 'null'}"`);
      if (!toneMatch) testPassed = false;
      
      // Check channel (if expected)
      if (test.expectedChannel !== undefined) {
        const channelMatch = meta.channel === test.expectedChannel;
        const channelIcon = channelMatch ? '✅' : '❌';
        console.log(`   ${channelIcon} Channel:     expected "${test.expectedChannel || 'null'}", got "${meta.channel || 'null'}"`);
        if (!channelMatch) testPassed = false;
      }
      
      if (testPassed) {
        console.log('\n✅ TEST PASSED');
        passedTests++;
      } else {
        console.log('\n❌ TEST FAILED');
        failedTests++;
      }
      
    } catch (error) {
      console.error('\n❌ TEST FAILED WITH ERROR:', error.message);
      console.error('Stack:', error.stack);
      failedTests++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL RESULTS:');
  console.log('='.repeat(80));
  console.log(`   Total Tests:  ${testFiles.length}`);
  console.log(`   ✅ Passed:     ${passedTests}`);
  console.log(`   ❌ Failed:     ${failedTests}`);
  console.log('='.repeat(80));
  
  if (failedTests === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Parser is working correctly.\n');
    console.log('💡 Next step: Run with DB writes to test dbUpsert-enhanced.js');
    console.log('   (Requires your approval before writing to database)\n');
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above.\n');
    process.exit(1);
  }
}

testParsingOnly().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
