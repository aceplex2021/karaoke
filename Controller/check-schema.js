// check-schema.js
// Check if artist_name and performance_type columns exist
import { getSupabase } from './supabase.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env
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

async function checkSchema() {
  console.log('🔍 Checking Database Schema\n');
  
  try {
    const supabase = getSupabase();
    
    // Query to check columns in kara_songs table
    const { data, error } = await supabase
      .from('kara_songs')
      .select('id, title_display, artist_name, performance_type')
      .limit(1);
    
    if (error) {
      if (error.message.includes('artist_name') || error.message.includes('performance_type')) {
        console.log('❌ SCHEMA CHECK FAILED\n');
        console.log('Missing columns detected in error message:');
        console.log(`   ${error.message}\n`);
        console.log('📝 TO FIX: Run this SQL in Supabase SQL editor:\n');
        console.log('```sql');
        console.log('ALTER TABLE kara_songs');
        console.log('ADD COLUMN IF NOT EXISTS artist_name TEXT,');
        console.log("ADD COLUMN IF NOT EXISTS performance_type TEXT DEFAULT 'solo';");
        console.log('```\n');
        process.exit(1);
      } else {
        throw error;
      }
    }
    
    console.log('✅ SCHEMA CHECK PASSED\n');
    console.log('The following columns exist in kara_songs:');
    console.log('   ✅ id');
    console.log('   ✅ title_display');
    console.log('   ✅ artist_name');
    console.log('   ✅ performance_type\n');
    
    // Check if there's any existing data
    const { data: songs, error: countError } = await supabase
      .from('kara_songs')
      .select('id, artist_name, performance_type', { count: 'exact', head: false })
      .not('artist_name', 'is', null)
      .limit(5);
    
    if (countError) throw countError;
    
    if (songs && songs.length > 0) {
      console.log('📊 Sample data with artist_name:');
      songs.forEach(song => {
        console.log(`   ID ${song.id}: artist="${song.artist_name}", type="${song.performance_type}"`);
      });
      console.log('');
    } else {
      console.log('ℹ️  No songs with artist_name found yet (this is normal for new columns)\n');
    }
    
    console.log('✅ Schema is ready for dbUpsert-enhanced.js!\n');
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
    process.exit(1);
  }
}

checkSchema();
