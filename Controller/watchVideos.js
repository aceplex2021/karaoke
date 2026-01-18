// watchVideos.js
import fs from "fs";
import path from "path";
import { promoteFile } from "./promoteIncoming.js";
import { parseFilename } from "./parseFilename.js";

const INCOMING =
  process.env.KARAOKE_INCOMING_PATH || "/karaoke/Videos/Incoming";
const VIDEOS = process.env.KARAOKE_VIDEO_PATH || "/karaoke/Videos";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".m4v"]);

// Optional: delete common download sidecars so folders become empty and can be pruned
const CLEAN_SIDECARS = (process.env.CLEAN_INCOMING_SIDECARS || "true")
  .toLowerCase()
  .trim() === "true";

// What we consider safe-to-delete sidecar files (tweak if you want to keep subtitles)
const SIDECAR_EXTS = new Set([
  ".part",
  ".tmp",
  ".ytdl",
  ".webp",
  ".jpg",
  ".jpeg",
  ".png",
  ".nfo",
  ".json",
  ".description",
  ".srt",
  ".vtt",
  ".m3u",
  ".m3u8",
  ".url",
  ".txt",
]);

function isVideoFile(p) {
  return VIDEO_EXTS.has(path.extname(p).toLowerCase());
}
function isSidecarFile(p) {
  return SIDECAR_EXTS.has(path.extname(p).toLowerCase());
}

// ------------------------------------------------------------
// NEW: filters for yt-dlp/MeTube intermediates + collision names
// ------------------------------------------------------------
const RX_INTERMEDIATE_FMP4 = /\.f\d{3}\.mp4$/i; // e.g. Title.f398.mp4
const RX_COLLISION_CMP4 = /__c[0-9a-f]{6,}\.mp4$/i; // e.g. Title__cbb865dc5.mp4
const RX_TEMP_MP4 = /\.temp\.mp4$/i;

function isBadIntermediateVideo(filePath) {
  const base = path.basename(filePath);
  if (RX_INTERMEDIATE_FMP4.test(base)) return true;
  if (RX_TEMP_MP4.test(base)) return true;
  // Sidecars that sometimes masquerade around video names
  const ext = path.extname(base).toLowerCase();
  if (ext === ".part" || ext === ".tmp" || ext === ".ytdl") return true;
  return false;
}

function isCollisionVideo(filePath) {
  return RX_COLLISION_CMP4.test(path.basename(filePath));
}

function canonicalNameFromCollision(filePath) {
  const base = path.basename(filePath);
  return base.replace(RX_COLLISION_CMP4, ".mp4");
}

// ------------------------------------------------------------
// Debounce: many fs events fire for the same file
// ------------------------------------------------------------
const pending = new Map(); // filePath -> timeout

function safeUnlink(p) {
  try {
    fs.unlinkSync(p);
    return true;
  } catch (e) {
    if (e?.code === "ENOENT") return true;
    console.error(`❌ failed to delete: ${p} ->`, e?.code || "", e?.message || e);
    return false;
  }
}

function safeRmdir(dir) {
  try {
    fs.rmdirSync(dir);
    return true;
  } catch (e) {
    if (
      e?.code === "ENOTEMPTY" ||
      e?.code === "EEXIST" ||
      e?.code === "ENOENT" ||
      e?.code === "EBUSY" ||
      e?.code === "EPERM" ||
      e?.code === "EACCES"
    )
      return false;

    console.error(`❌ failed to delete dir: ${dir} ->`, e?.code || "", e?.message || e);
    return false;
  }
}

/**
 * Prune empty dirs upward until stopDir (INCOMING) - never deletes INCOMING itself
 * Safe + idempotent. Tolerates races: if a new file appears, rmdir fails.
 */
function pruneEmptyDirs(startDir, stopDir, watchedDirs, dirWatchers) {
  try {
    const stop = path.resolve(stopDir);
    let cur = path.resolve(startDir);

    if (!cur.startsWith(stop)) return;

    while (cur && cur.startsWith(stop) && cur !== stop) {
      if (!fs.existsSync(cur)) {
        unwatchDir(cur, watchedDirs, dirWatchers);
        cur = path.dirname(cur);
        continue;
      }

      let entries;
      try {
        entries = fs.readdirSync(cur);
      } catch {
        break;
      }
      if (entries.length > 0) break;

      const removed = safeRmdir(cur);
      if (!removed) break;

      console.log(`🧹 pruned empty dir: ${cur}`);
      unwatchDir(cur, watchedDirs, dirWatchers);

      cur = path.dirname(cur);
    }
  } catch (e) {
    console.error(`❌ prune failed for: ${startDir} ->`, e?.code || "", e?.message || e);
  }
}

function cleanupSidecarsInDir(dir) {
  if (!CLEAN_SIDECARS) return;

  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const full = path.join(dir, ent.name);
      if (isSidecarFile(full)) {
        const ok = safeUnlink(full);
        if (ok) console.log(`🧽 deleted sidecar: ${full}`);
      }
    }
  } catch (e) {
    console.error(`❌ sidecar cleanup failed: ${dir} ->`, e?.code || "", e?.message || e);
  }
}

function unwatchDir(dir, watchedDirs, dirWatchers) {
  const key = path.resolve(dir);
  const w = dirWatchers.get(key);
  if (w) {
    try {
      w.close();
    } catch {
      // ignore
    }
    dirWatchers.delete(key);
  }
  watchedDirs.delete(key);
}

// Build the meta shape expected by dbUpsert.js from parseFilename() output
function metaForDbFromParsed(p) {
  const normalized =
    p?.normalized_title ||
    p?.normalizedTitle ||
    p?.titleNormalized ||
    p?.normalized ||
    null;

  const titleClean =
    p?.title_clean || p?.titleClean || p?.title_cleaned || p?.title || null;

  // Prefer parser-provided label if present; else derive one
  let label = (p?.label || "").trim();
  if (!label) {
    const tone = p?.tone ? String(p.tone).trim() : "";
    const tram = !!p?.tram;
    const style = p?.style ? String(p.style).trim() : "";

    if (tone && tram) label = `${tone}_tram`;
    else if (tone && style) label = `${tone}_${style}`;
    else if (tone) label = tone;
    else if (tram) label = "tram";
    else if (style) label = style;
    else label = "original";
  }

  const key = (p?.key && String(p.key).trim()) || null;
  
  // Extract artist_name and performance_type from parser
  const artistName = (p?.artist_name || p?.artistName || p?.artist)?.trim() || null;
  const performanceType = (p?.performance_type || p?.performanceType || p?.performance)?.trim() || 'solo';

  return {
    normalized_title: normalized,
    title_clean: titleClean,
    label,
    key,
    artist_name: artistName,
    performance_type: performanceType,
  };
}

// Convert container dst (/karaoke/Videos/...) to storage_path (/Videos/...)
function storagePathFromDst(dst) {
  return `/Videos/${path.basename(dst)}`;
}

// loaded only when WRITE_DB=true
let writeDb = false;
let upsertSongVersionFile = null;

async function ensureDbLoadedOnce() {
  if (upsertSongVersionFile) return;
  writeDb = (process.env.WRITE_DB || "false").toLowerCase() === "true";
  if (!writeDb) return;

  const mod = await import("./dbUpsert.js");
  upsertSongVersionFile = mod.upsertSongVersionFile;
  console.log("🧠 Supabase upsert enabled (WRITE_DB=true)");
}

function postDeleteCleanup(parentDir, watchedDirs, dirWatchers) {
  cleanupSidecarsInDir(parentDir);
  pruneEmptyDirs(parentDir, INCOMING, watchedDirs, dirWatchers);
}

// -----------------------------
// NEW: stable-file guard
// -----------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Consider a file "stable" if:
 * - it exists
 * - size unchanged across N checks
 * - and mtime is older than quietMs (prevents catching a file mid-write)
 */
async function waitForStableFile(filePath, { checks = 3, intervalMs = 1500, quietMs = 8000 } = {}) {
  try {
    if (!fs.existsSync(filePath)) return false;

    let lastSize = null;
    for (let i = 0; i < checks; i++) {
      if (!fs.existsSync(filePath)) return false;

      const st = fs.statSync(filePath);
      const size = st.size;

      // file is still being modified very recently
      const ageMs = Date.now() - st.mtimeMs;
      if (ageMs < quietMs) {
        await sleep(intervalMs);
        continue;
      }

      if (lastSize !== null && size !== lastSize) {
        lastSize = size;
        await sleep(intervalMs);
        continue;
      }

      lastSize = size;
      await sleep(intervalMs);
    }

    // final confirmation
    if (!fs.existsSync(filePath)) return false;
    const st2 = fs.statSync(filePath);
    const age2 = Date.now() - st2.mtimeMs;
    if (age2 < quietMs) return false;

    return true;
  } catch {
    return false;
  }
}

async function handleCollisionInIncoming(filePath, watchedDirs, dirWatchers) {
  // If this is a MeTube collision output (Title__cXXXX.mp4),
  // we only keep it if the canonical title does NOT exist in /Videos.
  // If canonical exists, delete collision from Incoming to prevent duplicates.
  const canonicalName = canonicalNameFromCollision(filePath);
  const canonicalDst = path.join(VIDEOS, canonicalName);

  if (fs.existsSync(canonicalDst)) {
    const stable = await waitForStableFile(filePath);
    if (!stable) {
      console.log(`⏳ collision not stable yet, will retry later: ${path.basename(filePath)}`);
      return { action: "retry" };
    }

    // Delete collision file from Incoming (do NOT promote)
    const ok = safeUnlink(filePath);
    if (ok) {
      console.log(`🧹 deleted collision (canonical exists): ${path.basename(filePath)}`);
      const parentDir = path.dirname(filePath);
      postDeleteCleanup(parentDir, watchedDirs, dirWatchers);
      return { action: "deleted" };
    }
    return { action: "error" };
  }

  // If canonical does NOT exist, let normal promote happen (rare)
  return { action: "promote" };
}

function schedulePromote(filePath, watchedDirs, dirWatchers) {
  // Only process video files
  if (!isVideoFile(filePath)) return;

  // Skip intermediates (never promote these)
  if (isBadIntermediateVideo(filePath)) {
    // Do NOT delete: could be mid-download; just ignore.
    return;
  }

  // clear prior timer
  if (pending.has(filePath)) clearTimeout(pending.get(filePath));

  const t = setTimeout(async () => {
    pending.delete(filePath);

    if (!fs.existsSync(filePath)) return;

    // Handle MeTube collision files
    if (isCollisionVideo(filePath)) {
      try {
        const res = await handleCollisionInIncoming(filePath, watchedDirs, dirWatchers);
        if (res.action === "retry") {
          // re-schedule a bit later
          schedulePromote(filePath, watchedDirs, dirWatchers);
        }
      } catch (e) {
        console.error(`❌ collision handling failed: ${path.basename(filePath)} ->`, e?.message || e);
      }
      return;
    }

    // Wait until the file looks finished (prevents promoting mid-write)
    const stable = await waitForStableFile(filePath);
    if (!stable) {
      // Try again later; MeTube may still be merging/writing
      schedulePromote(filePath, watchedDirs, dirWatchers);
      return;
    }

    try {
      const { status, dst } = await promoteFile(filePath);
      const parentDir = path.dirname(filePath);

      if (status === "linked") {
        // DB upsert happens ONLY here (post-hardlink), and uses canonical /Videos path
        if (writeDb && upsertSongVersionFile && dst) {
          try {
            const parsed = parseFilename(path.basename(filePath));
            const meta = metaForDbFromParsed(parsed);
            const relativePath = storagePathFromDst(dst);

            await upsertSongVersionFile({
              meta,
              relativePath,
              defaultLanguageCode: "vi",
            });

            console.log(`🗄️  upserted metadata: ${path.basename(dst)}`);
          } catch (e) {
            console.error(
              `❌ DB upsert failed (will NOT block ingestion): ${path.basename(dst || filePath)} ->`,
              e?.message || e
            );
          }
        }

        // Delete incoming file
        safeUnlink(filePath);
        console.log(`✅ promoted+deleted incoming: ${path.basename(filePath)}`);

        // Cleanup + prune
        postDeleteCleanup(parentDir, watchedDirs, dirWatchers);
        return;
      }

      if (status === "exists" && dst) {
        // If exists, we only delete incoming if same inode
        try {
          const a = fs.statSync(filePath);
          const b = fs.statSync(dst);

          if (a.ino === b.ino) {
            safeUnlink(filePath);
            console.log(`↩️  already promoted; deleted incoming: ${path.basename(filePath)}`);

            postDeleteCleanup(parentDir, watchedDirs, dirWatchers);
          } else {
            // canonical exists but different inode
            // This can happen when MeTube redownloads same title.
            // Since canonical already exists, keep Incoming for manual inspection OR delete:
            // Here we choose to delete ONLY if incoming filename matches canonical basename exactly.
            const incomingBase = path.basename(filePath);
            const dstBase = path.basename(dst);

            if (incomingBase === dstBase) {
              // same logical title -> delete incoming duplicate
              safeUnlink(filePath);
              console.log(`🧹 deleted incoming duplicate (canonical exists): ${incomingBase}`);
              postDeleteCleanup(parentDir, watchedDirs, dirWatchers);
            } else {
              console.log(
                `⚠️  canonical exists but inode differs; NOT deleting incoming: ${incomingBase}`
              );
              console.log(`    incoming: ${filePath}`);
              console.log(`    canonical: ${dst}`);
            }
          }
        } catch (e) {
          console.error(
            `❌ inode check failed; NOT deleting incoming: ${path.basename(filePath)} ->`,
            e?.code || "",
            e?.message || e
          );
        }
        return;
      }

      console.log(`⏭️  skipped: ${path.basename(filePath)}`);
    } catch (e) {
      console.error(`❌ promote failed: ${path.basename(filePath)} ->`, e?.code || "", e?.message || e);
    }
  }, 2000);

  pending.set(filePath, t);
}

// Walk directory tree and return all directories (including root)
function listDirs(root) {
  const out = [root];
  const stack = [root];

  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const full = path.join(cur, ent.name);
      out.push(full);
      stack.push(full);
    }
  }
  return out;
}

// Walk directory tree and return all files (absolute paths)
function listFiles(root) {
  const out = [];
  const stack = [root];

  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

export async function watchVideos() {
  await ensureDbLoadedOnce();

  console.log(`👀 Watching Incoming for new/changed video files: ${INCOMING}`);

  if (!fs.existsSync(INCOMING)) {
    console.error(`❌ Incoming path not found: ${INCOMING}`);
    process.exit(1);
  }

  // Normalize to resolved paths to avoid duplicates
  const watchedDirs = new Set(); // resolved dir paths
  const dirWatchers = new Map(); // resolved dir -> fs.FSWatcher

  const addWatcher = (dir) => {
    const resolved = path.resolve(dir);
    if (watchedDirs.has(resolved)) return;
    watchedDirs.add(resolved);

    try {
      const watcher = fs.watch(resolved, { persistent: true }, (event, filename) => {
        if (!filename) return;

        const full = path.join(resolved, filename);

        // If a new subdir appears, start watching it too
        try {
          if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
            addWatcher(full);

            // If MeTube creates a folder with already-present files fast, do a scan
            try {
              for (const f of listFiles(full)) {
                if (isVideoFile(f)) schedulePromote(f, watchedDirs, dirWatchers);
              }
            } catch {
              // ignore
            }

            return;
          }
        } catch {
          // ignore
        }

        // schedule promote on files
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            if (isVideoFile(full)) schedulePromote(full, watchedDirs, dirWatchers);
          }
        } catch {
          // ignore
        }
      });

      dirWatchers.set(resolved, watcher);
    } catch (e) {
      console.error(`❌ failed to watch dir: ${resolved}`, e?.message || e);
      watchedDirs.delete(resolved);
    }
  };

  // 1) Watch existing tree first
  for (const d of listDirs(INCOMING)) addWatcher(d);

  console.log(`✅ Watchers active: ${watchedDirs.size}`);

  // 2) Startup sweep: process everything already sitting in /Incoming
  try {
    const allFiles = listFiles(INCOMING);

    for (const f of allFiles) {
      if (isVideoFile(f)) schedulePromote(f, watchedDirs, dirWatchers);
    }

    if (CLEAN_SIDECARS) {
      for (const d of listDirs(INCOMING)) cleanupSidecarsInDir(d);
    }

    const dirsDeepFirst = listDirs(INCOMING).sort(
      (a, b) => path.resolve(b).length - path.resolve(a).length
    );
    for (const d of dirsDeepFirst) {
      if (path.resolve(d) === path.resolve(INCOMING)) continue;
      pruneEmptyDirs(d, INCOMING, watchedDirs, dirWatchers);
    }

    console.log(
      `🧹 Startup sweep scheduled: ${allFiles.filter(isVideoFile).length} video(s) queued for promotion`
    );
  } catch (e) {
    console.error(`❌ startup sweep failed:`, e?.code || "", e?.message || e);
  }

  console.log(
    `Mode: WATCH+AUTO-PROMOTE+AUTO-DELETE-INCOMING+STARTUP_SWEEP${
      writeDb ? "+WRITE_DB" : ""
    }${CLEAN_SIDECARS ? "+CLEAN_SIDECARS" : ""}`
  );
}
