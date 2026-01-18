/**
 * Orphan / Drift Report (READ-ONLY)
 *
 * Reports:
 *  1) DB-only orphans: kara_files rows whose canonical file is missing on disk
 *  2) FS-only orphans: /Videos/*.mp4 files that have no matching kara_files row
 *  3) Path drift: storage_path not flat / contains slashes / legacy prefixes
 *
 * Output: console (pipe to a log if desired)
 *
 * Required env:
 *  - KARAOKE_VIDEO_PATH=/karaoke/videos  (inside container)
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (recommended)
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

const MAX_SAMPLES = Number(process.env.MAX_SAMPLES || 50);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000);

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function normalizeStoragePath(rel) {
  if (!rel) return null;
  return String(rel)
    .replace(/^\/+/, "")          // drop leading /
    .replace(/^Videos\//i, "")    // drop legacy prefix if present
    .replace(/\\/g, "/");         // normalize slashes
}

function isFlatMp4(p) {
  return p && !p.includes("/") && p.toLowerCase().endsWith(".mp4");
}

function listCanonicalMp4(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".mp4")) out.push(e.name);
  }
  return out;
}

async function fetchAllKaraFiles(supabase) {
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("kara_files")
      .select("id, storage_path, file_name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += PAGE_SIZE;
  }
  return rows;
}

(async () => {
  if (!fs.existsSync(VIDEOS_DIR)) die(`KARAOKE_VIDEO_PATH not found: ${VIDEOS_DIR}`);
  if (!SUPABASE_URL) die(`SUPABASE_URL is required`);
  if (!SUPABASE_KEY) die(`SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_KEY is required`);

  console.log("🧾 Karaoke Orphan / Drift Report (READ-ONLY)");
  console.log(`📁 Canonical Videos Dir: ${VIDEOS_DIR}`);
  console.log(`⚙️  PAGE_SIZE=${PAGE_SIZE}  MAX_SAMPLES=${MAX_SAMPLES}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Canonical FS set
  const fsFiles = listCanonicalMp4(VIDEOS_DIR);
  const fsSet = new Set(fsFiles.map((x) => x));

  // DB rows
  console.log("🔎 Loading kara_files from Supabase ...");
  const dbRows = await fetchAllKaraFiles(supabase);
  console.log(`✅ Loaded kara_files rows: ${fmt(dbRows.length)}`);
  console.log(`✅ /Videos *.mp4 files: ${fmt(fsFiles.length)}`);

  // Build DB path set + drift checks + DB-only orphans
  const dbSet = new Set(); // normalized flat mp4 names (expected in /Videos)
  let dbOnlyOrphans = 0;
  const dbOnlySamples = [];

  let driftCount = 0;
  const driftSamples = [];

  for (const r of dbRows) {
    const rel = normalizeStoragePath(r.storage_path || r.file_name);
    if (!rel) continue;

    // Drift: storage_path not flat mp4
    const drift =
      rel.includes("/") ||
      !rel.toLowerCase().endsWith(".mp4") ||
      rel.trim() !== rel ||
      rel.startsWith(".");
    if (drift) {
      driftCount++;
      if (driftSamples.length < MAX_SAMPLES) {
        driftSamples.push({
          id: r.id,
          storage_path: r.storage_path,
          file_name: r.file_name,
          normalized: rel,
          note: rel.includes("/") ? "contains /" : "non-flat or unusual",
        });
      }
    }

    // Only treat flat mp4 as canonical mapping key
    const base = rel.split("/").pop();
    if (!isFlatMp4(base)) continue;

    dbSet.add(base);

    // DB-only orphan if expected file missing
    const expected = path.join(VIDEOS_DIR, base);
    if (!fs.existsSync(expected)) {
      dbOnlyOrphans++;
      if (dbOnlySamples.length < MAX_SAMPLES) {
        dbOnlySamples.push({
          id: r.id,
          storage_path: r.storage_path,
          file_name: r.file_name,
          expected_path: expected,
        });
      }
    }
  }

  // FS-only orphans (files not referenced in DB)
  let fsOnlyOrphans = 0;
  const fsOnlySamples = [];

  for (const f of fsFiles) {
    if (!dbSet.has(f)) {
      fsOnlyOrphans++;
      if (fsOnlySamples.length < MAX_SAMPLES) fsOnlySamples.push(f);
    }
  }

  // Report
  console.log("");
  console.log("===== RESULTS =====");
  console.log(`DB-only orphans (kara_files → missing file): ${fmt(dbOnlyOrphans)}`);
  if (dbOnlySamples.length) {
    console.log(`Samples (up to ${MAX_SAMPLES}):`);
    for (const s of dbOnlySamples) {
      console.log(`- ${s.id} => ${s.storage_path || s.file_name} (expected: ${s.expected_path})`);
    }
    if (dbOnlyOrphans > dbOnlySamples.length) console.log("…(more not shown)");
  } else {
    console.log("✅ No DB-only orphan samples.");
  }

  console.log("");
  console.log(`FS-only orphans (/Videos file → no kara_files row): ${fmt(fsOnlyOrphans)}`);
  if (fsOnlySamples.length) {
    console.log(`Samples (up to ${MAX_SAMPLES}):`);
    for (const f of fsOnlySamples) console.log(`- ${f}`);
    if (fsOnlyOrphans > fsOnlySamples.length) console.log("…(more not shown)");
  } else {
    console.log("✅ No FS-only orphan samples.");
  }

  console.log("");
  console.log(`Path drift rows (storage_path not flat canonical): ${fmt(driftCount)}`);
  if (driftSamples.length) {
    console.log(`Samples (up to ${MAX_SAMPLES}):`);
    for (const d of driftSamples) {
      console.log(`- ${d.id} => storage_path="${d.storage_path}" file_name="${d.file_name}" normalized="${d.normalized}" (${d.note})`);
    }
    if (driftCount > driftSamples.length) console.log("…(more not shown)");
  } else {
    console.log("✅ No drift samples.");
  }

  console.log("");
  console.log("🛠 Suggested actions (NO auto-fix):");
  if (dbOnlyOrphans > 0) {
    console.log("- DB-only orphans: likely stale rows or legacy paths. Next: generate a confirmed-delete list, then remove only confirmed stale DB rows.");
  } else {
    console.log("- DB-only orphans: OK ✅");
  }
  if (fsOnlyOrphans > 0) {
    console.log("- FS-only orphans: run karaoke-node scan with WRITE_DB=true to backfill metadata for these files.");
  } else {
    console.log("- FS-only orphans: OK ✅");
  }
  if (driftCount > 0) {
    console.log("- Path drift: investigate normalization; ensure all canonical rows have flat relative storage_path.");
  } else {
    console.log("- Path drift: OK ✅");
  }
})().catch((e) => {
  console.error("❌ Orphan report failed:");
  console.error(e?.message || e);
  process.exit(1);
});
