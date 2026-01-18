/**
 * Karaoke Health Check (READ-ONLY)
 *
 * What it does:
 *  - Counts canonical /Videos/*.mp4 (flat only)
 *  - Counts Supabase kara_files rows
 *  - Prints delta (DB - FS)
 *  - Scans kara_files and samples rows whose storage_path does not exist on disk
 *
 * What it does NOT do:
 *  - No deletes
 *  - No DB writes
 *  - No touching /Incoming
 *
 * Expected env:
 *  - KARAOKE_VIDEO_PATH=/karaoke/videos   (inside container)
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY  (recommended)
 *
 * Typical run:
 *   node healthcheck.cjs
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const VIDEOS_DIR = process.env.KARAOKE_VIDEO_PATH || "/karaoke/videos";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function listMp4FlatCount(dir) {
  let n = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".mp4")) n++;
  }
  return n;
}

async function countTableExact(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function sampleMissingOnDisk(supabase, canonicalDir, limitSamples = 25) {
  const pageSize = 1000;
  let from = 0;

  let missing = [];
  let checked = 0;
  let missingCount = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("kara_files")
      .select("id, storage_path")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      checked++;

      if (!row.storage_path) continue;

      // Normalize:
      // - remove leading slashes
      // - allow legacy "Videos/..." by stripping it
      const normalized = String(row.storage_path)
        .replace(/^\/+/, "")
        .replace(/^Videos\//i, "");

      const expected = path.join(canonicalDir, normalized);

      if (!fs.existsSync(expected)) {
        missingCount++;
        if (missing.length < limitSamples) {
          missing.push({
            id: row.id,
            storage_path: row.storage_path,
            expected_path: expected,
          });
        }
      }
    }

    from += pageSize;
  }

  return {
    checked,
    missingCount,
    samples: missing,
    truncated: missingCount > missing.length,
  };
}

(async () => {
  if (!fs.existsSync(VIDEOS_DIR)) die(`KARAOKE_VIDEO_PATH not found: ${VIDEOS_DIR}`);
  if (!SUPABASE_URL) die(`SUPABASE_URL is required`);
  if (!SUPABASE_KEY) die(`SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_KEY is required`);

  const t0 = Date.now();
  console.log("🎤 Karaoke Health Check (READ-ONLY)");
  console.log(`📁 Canonical Videos Dir: ${VIDEOS_DIR}`);

  // 1) Filesystem count (flat mp4 only)
  const fsCount = listMp4FlatCount(VIDEOS_DIR);
  console.log(`✅ /Videos *.mp4 count: ${fmt(fsCount)}`);

  // 2) DB count
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const dbFilesCount = await countTableExact(supabase, "kara_files");
  console.log(`✅ Supabase kara_files count: ${fmt(dbFilesCount)}`);

  // 3) Delta signal
  const delta = dbFilesCount - fsCount;
  console.log(`ℹ️  Count delta (DB - FS): ${delta}`);

  // 4) Missing-on-disk check (sample)
  console.log("🔎 Checking for missing-on-disk rows (scan DB, read-only) ...");
  const miss = await sampleMissingOnDisk(supabase, VIDEOS_DIR, 25);

  if (miss.missingCount === 0) {
    console.log("✅ missing_on_disk: 0");
  } else {
    console.log(`⚠️  missing_on_disk: ${miss.missingCount} (showing up to 25 samples)`);
    for (const m of miss.samples) {
      console.log(`- ${m.id} => ${m.storage_path} (expected: ${m.expected_path})`);
    }
    if (miss.truncated) console.log("…(more missing rows not shown)");
  }

  const ms = Date.now() - t0;
  console.log(`⏱️  Done in ${Math.round(ms / 1000)}s`);
})().catch((e) => {
  console.error("❌ Health check failed:");
  console.error(e?.message || e);
  process.exit(1);
});
