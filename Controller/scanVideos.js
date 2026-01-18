import fg from 'fast-glob';
import { parseFilename } from './parseFilename.js';

export async function scanVideos() {
  const videoPath = process.env.KARAOKE_VIDEO_PATH;
  if (!videoPath) throw new Error('KARAOKE_VIDEO_PATH not set');

  const files = await fg('**/*.mp4', { cwd: videoPath, onlyFiles: true });

  const writeDb = (process.env.WRITE_DB || 'false').toLowerCase() === 'true';
  const langCode = process.env.DEFAULT_LANGUAGE_CODE || 'vi';

  let upsertSongVersionFile = null;
  if (writeDb) {
    // Lazy import so DRY RUN doesn't require Supabase env vars
    ({ upsertSongVersionFile } = await import('./dbUpsert.js'));
  }

  let total = 0, written = 0, skipped = 0, failed = 0;
  let toneDetected = 0, versionDetected = 0;

  console.log(`🎬 Found ${files.length} video files`);
  console.log(`🧪 Mode: ${writeDb ? 'WRITE_DB=true' : 'DRY RUN'}\n`);

  for (const relativePath of files) {
    total++;

    try {
      const meta = parseFilename(relativePath);

      // tone = voice gender (nam/nu)
      if (meta.tone) toneDetected++;

      // "version" in summary should reflect the final composed label semantics
      // (e.g. tram / bolero / nam_tram / nam_ballad / original ...)
      if (meta.label) versionDetected++;

      if (!writeDb) continue;

      const res = await upsertSongVersionFile({
        meta,
        relativePath,
        defaultLanguageCode: langCode
      });

      if (res === null) skipped++;
      else written++;
    } catch (e) {
      failed++;
      console.error(`❌ ${relativePath}: ${e.message}`);
    }
  }

  console.log('\n==============================');
  console.log('📊 Scan Summary');
  console.log('==============================');
  console.log(`🎥 Total videos seen:      ${total}`);
  console.log(`🎤 Tone detected:          ${toneDetected}`);
  console.log(`🎚️  Version detected:       ${versionDetected}`);
  console.log(`✅ DB rows written:        ${written}`);
  console.log(`⏭️  DB rows skipped:        ${skipped}`);
  console.log(`❌ Failed:                 ${failed}`);
  console.log('==============================\n');
}
