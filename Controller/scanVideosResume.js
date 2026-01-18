import fg from 'fast-glob';
import { parseFilename } from './parseFilename.js';

export async function scanVideosResume() {
  const videoPath = process.env.KARAOKE_VIDEO_PATH;
  if (!videoPath) throw new Error('KARAOKE_VIDEO_PATH not set');

  const writeDb = (process.env.WRITE_DB || 'false').toLowerCase() === 'true';
  if (!writeDb) throw new Error('scanVideosResume requires WRITE_DB=true');

  const langCode = process.env.DEFAULT_LANGUAGE_CODE || 'en';

  const { getSupabase } = await import('./supabase.js');
  const { upsertSongVersionFile } = await import('./dbUpsert.js');

  const supabase = getSupabase();

  // Load existing paths from DB in pages
  const existing = new Set();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('kara_files')
      .select('storage_path')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) existing.add(row.storage_path);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const files = await fg('**/*.mp4', { cwd: videoPath, onlyFiles: true });

  console.log(`🧠 DB knows ${existing.size} files already`);
  console.log(`🎬 Disk has ${files.length} video files`);
  console.log(`🧪 Mode: RESUME (only ingest missing)\n`);

  let total = 0, written = 0, skipped = 0, failed = 0;
  let toneDetected = 0, labelDetected = 0;

  for (const relativePath of files) {
    total++;

    if (existing.has(relativePath)) {
      skipped++;
      continue;
    }

    try {
      const meta = parseFilename(relativePath);

      if (meta.tone) toneDetected++;
      if (meta.label) labelDetected++;

      const res = await upsertSongVersionFile({
        meta,
        relativePath,
        defaultLanguageCode: langCode
      });

      if (res === null) skipped++;
      else written++;
    } catch (e) {
      failed++;
      console.error(`❌ ${relativePath}: ${e?.message || e}`);
    }
  }

  console.log('\n==============================');
  console.log('📊 Resume Scan Summary');
  console.log('==============================');
  console.log(`🎥 Total videos seen:      ${total}`);
  console.log(`🎤 Tone detected:          ${toneDetected}`);
  console.log(`🏷️  Label detected:         ${labelDetected}`);
  console.log(`✅ DB rows written:        ${written}`);
  console.log(`⏭️  Skipped (already in DB): ${skipped}`);
  console.log(`❌ Failed:                 ${failed}`);
  console.log('==============================\n');
}
