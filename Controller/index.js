// index.js
import { scanVideos } from './scanVideos.js';
import { scanVideosResume } from './scanVideosResume.js';
import { watchVideos } from './watchVideos.js';
import { promoteIncoming } from './promoteIncoming.js';
import { parseFilename } from './parseFilename.js';

console.log('🎤 karaoke-node started');

const mode = (process.env.MODE || 'test').toLowerCase();

if (mode === 'test') {
  const samples = [
    // tone + tram => nam_tram
    'AO ANH - KARAOKE - Tone NAM Trầm ( Dm /Re Thứ ).mp4',

    // song ca + tram => song_ca_tram
    'QUA CƠN MÊ - KARAOKE - SONG CA Trầm ( Cm/Đô thứ ).mp4',

    // bolero only => bolero
    'Nhạc Chế - NỖI ĐAU NGHẸN NGÀO - Trọng Hiếu Bolero ｜ Tưởng Niệm 56 Người CHUNG CƯ MINI HÀ NỘI.mp4',

    // tone only => nu
    'Cơn Mưa Ngang Qua - Karaoke Tone Nữ.mp4',

    // tone + bolero => nam_bolero
    'DỪNG YÊU TÔI - Karaoke Tone Nam Bolero ( Ebm ).mp4',

    // nothing special => original
    'Hello - Adele Karaoke.mp4'
  ];

  for (const f of samples) {
    console.log('-----');
    console.log(f);
    console.log(parseFilename(f));
  }
} else if (mode === 'scan') {
  await scanVideos();
} else if (mode === 'resume') {
  await scanVideosResume();
} else if (mode === 'watch') {
  await watchVideos();
} else if (mode === 'promote') {
  await promoteIncoming();
} else {
  console.error(
    `❌ Unknown MODE='${process.env.MODE}'. Use MODE=test|scan|resume|watch|promote`
  );
  process.exit(1);
}
