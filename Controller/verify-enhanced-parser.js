// verify-enhanced-parser.js
// Verify that enhanced parser is working by checking recent database entries
import { getSupabase } from './supabase.js';
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

async function verifyEnhancedParser() {
  console.log('🔍 Verifying Enhanced Parser in Production\n');
  
  try {
    const supabase = getSupabase();
    
    // Get the 10 most recently created songs
    const { data: recentSongs, error } = await supabase
      .from('kara_songs')
      .select('id, title_display, artist_name, performance_type, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw error;
    }
    
    if (!recentSongs || recentSongs.length === 0) {
      console.log('⚠️  No recent songs found in database\n');
      return;
    }
    
    console.log(`📊 Found ${recentSongs.length} recent songs\n`);
    console.log('='.repeat(80));
    
    let withArtist = 0;
    let withPerformanceType = 0;
    let withBoth = 0;
    
    recentSongs.forEach((song, idx) => {
      const hasArtist = song.artist_name !== null && song.artist_name.trim() !== '';
      const hasPerformanceType = song.performance_type !== null && song.performance_type !== 'solo';
      const isDefaultSolo = song.performance_type === 'solo';
      
      if (hasArtist) withArtist++;
      if (hasPerformanceType) withPerformanceType++;
      if (hasArtist && hasPerformanceType) withBoth++;
      
      console.log(`\n${idx + 1}. ${song.title_display || 'N/A'}`);
      console.log(`   Artist:      ${song.artist_name || '(none)'}`);
      console.log(`   Performance: ${song.performance_type || 'N/A'}`);
      console.log(`   Created:     ${new Date(song.created_at).toLocaleString()}`);
      
      if (hasArtist) {
        console.log(`   ✅ Artist extracted!`);
      } else {
        console.log(`   ⚠️  No artist (may be normal if filename has no artist)`);
      }
      
      if (isDefaultSolo) {
        console.log(`   ℹ️  Performance type: solo (default - may be correct)`);
      } else if (hasPerformanceType) {
        console.log(`   ✅ Performance type detected: ${song.performance_type}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📈 Summary:');
    console.log(`   Total songs checked: ${recentSongs.length}`);
    console.log(`   Songs with artist: ${withArtist} (${Math.round(withArtist/recentSongs.length*100)}%)`);
    console.log(`   Songs with non-default performance type: ${withPerformanceType} (${Math.round(withPerformanceType/recentSongs.length*100)}%)`);
    console.log(`   Songs with both: ${withBoth} (${Math.round(withBoth/recentSongs.length*100)}%)`);
    
    // Check for specific test cases from logs
    console.log('\n🔍 Checking for specific test cases from logs...\n');
    
    const testCases = [
      { title: 'LỜI CUỐI', expectedArtist: 'Từ Công Phụng' },
      { title: 'THÁNG SÁU TRỜI MƯA', expectedArtist: 'Hoàng Thanh Tâm' },
      { title: 'Lời Tình Buồn', expectedArtist: 'Hoàng Thanh Tâm' },
    ];
    
    for (const testCase of testCases) {
      const { data: matches } = await supabase
        .from('kara_songs')
        .select('title_display, artist_name, performance_type')
        .ilike('title_display', `%${testCase.title}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (matches && matches.length > 0) {
        const song = matches[0];
        const artistMatch = song.artist_name && song.artist_name.includes(testCase.expectedArtist);
        console.log(`   "${song.title_display}"`);
        console.log(`      Expected artist: ${testCase.expectedArtist}`);
        console.log(`      Found artist: ${song.artist_name || '(none)'}`);
        if (artistMatch) {
          console.log(`      ✅ Artist match!`);
        } else {
          console.log(`      ⚠️  Artist not found or different`);
        }
        console.log(`      Performance type: ${song.performance_type || 'N/A'}`);
        console.log('');
      }
    }
    
    console.log('\n✅ Verification complete!\n');
    
  } catch (error) {
    console.error('❌ Error verifying parser:', error.message);
    process.exit(1);
  }
}

verifyEnhancedParser();
