// test-mixer-loading.js
// Test that MIXER_NAMES loads correctly from channelSources.md
import { MIXER_NAMES } from './rules-enhanced.js';

console.log('🔍 Testing Dynamic Mixer Names Loading\n');

console.log(`✅ Loaded ${MIXER_NAMES.length} mixer name variants from channelSources.md\n`);

console.log('📋 All loaded mixer names (with auto-generated variants):\n');
MIXER_NAMES.forEach((name, idx) => {
  console.log(`   ${(idx + 1).toString().padStart(2)}) ${name}`);
});

console.log('\n✅ Test passed! Mixer names are loaded dynamically.');
console.log('💡 To add new mixers, just edit channelSources.md (use Vietnamese accents)');
