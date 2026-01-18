// test-enhanced.js
// Test the enhanced parseFilename function
import { parseFilename } from './parseFilename-enhanced.js';

console.log('🎤 Testing Enhanced Node Controller\n');
console.log('='.repeat(80));

const testCases = [
  {
    name: 'Full-width pipe cleanup',
    filename: '｜ Khi Nao Chau Duong ｜ Chuan [Nam - Trong Hieu].mp4',
    expect: {
      title: 'Khi Nao Chau Duong',
      tone: 'Nam',
      channel: 'Trong Hieu',
      artist: null,
      performance_type: 'solo'
    }
  },
  {
    name: 'English artist extraction',
    filename: 'Aespa Whiplash.mp4',
    expect: {
      title: 'Aespa Whiplash',
      artist: 'Aespa',
      tone: null,
      performance_type: 'solo'
    }
  },
  {
    name: 'Vietnamese composer in parentheses',
    filename: 'Tinh Don Phuong (Trinh Cong Son) [Nam].mp4',
    expect: {
      title: 'Tinh Don Phuong',
      artist: 'Trinh Cong Son',
      tone: 'Nam',
      performance_type: 'solo'
    }
  },
  {
    name: 'Mixer should NOT be artist',
    filename: 'Cu Ngo La Anh - Trọng Hiếu [Nam Bolero].mp4',
    expect: {
      title: 'Cu Ngo La Anh',
      artist: null, // Trọng Hiếu is mixer, not artist
      channel: 'Trọng Hiếu',
      tone: 'Nam',
      style: 'Bolero',
      performance_type: 'solo'
    }
  },
  {
    name: 'Song ca (duet) detection',
    filename: 'Yeu Nhau Di [Song Ca Nam Nu - Beat].mp4',
    expect: {
      title: 'Yeu Nhau Di',
      performance_type: 'duet',
      style: 'song_ca',
      tone: null
    }
  },
  {
    name: 'Lien khuc (medley) detection',
    filename: 'Lien Khuc Nhac Tre [Nam - Bolero].mp4',
    expect: {
      title: 'Lien Khuc Nhac Tre',
      performance_type: 'medley',
      tone: 'Nam',
      style: 'Bolero'
    }
  },
  {
    name: 'Nhac song noise removal',
    filename: 'Mua Chieu Nhac Song Chat Luong Cao [Nam].mp4',
    expect: {
      title: 'Mua Chieu', // "Nhac Song Chat Luong Cao" removed
      tone: 'Nam',
      performance_type: 'solo'
    }
  },
  {
    name: 'KARAOKE format artist extraction',
    filename: 'KARAOKE | Dem Lanh - Dan Nguyen [Nam].mp4',
    expect: {
      title: 'Dem Lanh',
      artist: 'Dan Nguyen',
      tone: 'Nam',
      performance_type: 'solo'
    }
  },
  {
    name: 'Tone + tram + style combo',
    filename: 'AO ANH - KARAOKE - Tone NAM Trầm Bolero ( Dm ).mp4',
    expect: {
      tone: 'Nam',
      is_tram: true,
      style: 'Bolero',
      key: 'Dm'
    }
  },
  {
    name: 'Simple English song',
    filename: 'Hello - Adele Karaoke.mp4',
    expect: {
      title: 'Hello',
      artist: null, // "Adele" after dash might not match pattern
      performance_type: 'solo'
    }
  }
];

console.log('\\nRunning test cases...\\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\\nTest: ${test.name}`);
  console.log(`File: ${test.filename}`);
  
  const result = parseFilename(test.filename, `/Videos/${test.filename}`);
  
  console.log('\\nParsed result:');
  console.log(JSON.stringify({
    title: result.title_clean,
    artist: result.artist_name,
    tone: result.tone,
    channel: result.channel,
    style: result.style,
    performance_type: result.performance_type,
    key: result.key,
    is_tram: result.is_tram,
    label: result.label
  }, null, 2));
  
  // Simple validation
  let testPassed = true;
  if (test.expect.title && result.title_clean !== test.expect.title) {
    console.log(`❌ Title mismatch: expected "${test.expect.title}", got "${result.title_clean}"`);
    testPassed = false;
  }
  if (test.expect.artist !== undefined && result.artist_name !== test.expect.artist) {
    console.log(`❌ Artist mismatch: expected "${test.expect.artist}", got "${result.artist_name}"`);
    testPassed = false;
  }
  if (test.expect.tone !== undefined && result.tone !== test.expect.tone) {
    console.log(`❌ Tone mismatch: expected "${test.expect.tone}", got "${result.tone}"`);
    testPassed = false;
  }
  if (test.expect.performance_type && result.performance_type !== test.expect.performance_type) {
    console.log(`❌ Performance type mismatch: expected "${test.expect.performance_type}", got "${result.performance_type}"`);
    testPassed = false;
  }
  if (test.expect.channel !== undefined && result.channel !== test.expect.channel) {
    console.log(`❌ Channel mismatch: expected "${test.expect.channel}", got "${result.channel}"`);
    testPassed = false;
  }
  
  if (testPassed) {
    console.log('✅ PASS');
    passed++;
  } else {
    failed++;
  }
  
  console.log('−'.repeat(80));
}

console.log(`\\n\\n${'='.repeat(80)}`);
console.log(`\\nTest Summary: ${passed} passed, ${failed} failed out of ${testCases.length} total`);
console.log('\\n' + '='.repeat(80));

if (failed > 0) {
  process.exit(1);
}
