// promoteIncoming.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parseFilename } from "./parseFilename.js";

// env
const INCOMING = process.env.KARAOKE_INCOMING_PATH || "/karaoke/Videos/Incoming";
const VIDEOS = process.env.KARAOKE_VIDEO_PATH || "/karaoke/Videos";

// accepted video extensions
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".m4v"]);

function isVideoFile(p) {
  return VIDEO_EXTS.has(path.extname(p).toLowerCase());
}

// --------------------
// filename normalization
// --------------------

// Linux ext4 / most FS max filename bytes is 255.
// Use a safe margin because UTF-8 Vietnamese chars can take multiple bytes.
// Also leave room for suffix + extension.
const MAX_FILENAME_BYTES = 240;

// Collapse repeated "__Nam_Nhạc Sống" / "__Nữ_Nhạc Sống" garbage in titles
// and remove trailing "__<9 hex>" that comes from legacy renames.
function sanitizeBaseName(nameNoExt) {
  let s = String(nameNoExt || "");

  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  // If somebody embedded extension in the title text, remove it here (safety)
  s = s.replace(/\.(mp4|mkv|webm|m4v)$/i, "");

  // Remove any trailing hash-like suffix: "__ca2071e9d" (9 hex) or "__c6014b420" etc.
  // You asked specifically __<9 hex char>
  s = s.replace(/__([a-f0-9]{9})$/i, "");

  // Also remove longer pure-hex suffixes that show up (defensive)
  s = s.replace(/__([a-f0-9]{8,32})$/i, "");

  // Collapse repeated __Nam_Nhạc Sống or __Nữ_Nhạc Sống
  // Example: "__Nam_Nhạc Sống__Nam_Nhạc Sống__Nam_Nhạc Sống" -> "__Nam_Nhạc Sống"
  // Do it for both accented and non-accent variants (best effort).
  const repeatPattern = /__(Nam|Nữ|Nu|NU|Nu)\s*_?\s*(Nhạc\s*Sống|Nhac\s*Song)/gi;
  // Convert any variants to a canonical token so we can dedupe
  // We will dedupe by splitting on "__" later too.
  s = s.replace(repeatPattern, (m) => {
    // Preserve original case minimally; keep Vietnamese accented "Nhạc Sống" in output
    const tone = /nữ|nu/i.test(m) ? "Nữ" : "Nam";
    return `__${tone}_Nhạc Sống`;
  });

  // Now dedupe repeated "__..." chunks, keeping order.
  // This avoids titles ballooning from repeated tokens.
  // Only dedupe the "__<token>" fragments, not the main title text.
  const pieces = s.split("__");
  if (pieces.length > 1) {
    const head = pieces[0].trim(); // title part before first "__"
    const seen = new Set();
    const tail = [];

    for (let i = 1; i < pieces.length; i++) {
      const token = pieces[i].trim();
      if (!token) continue;

      // Deduplicate exact token repeats
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tail.push(token);
    }

    s = head + (tail.length ? `__${tail.join("__")}` : "");
  }

  // Trim again
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// Ensure filename byte-length <= limit (UTF-8 safe-ish using Buffer.byteLength).
function trimToMaxBytes(str, maxBytes) {
  let s = String(str || "");
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;

  // Binary chop by characters until within limit
  // (simple + safe; filenames are short enough)
  while (s.length > 0 && Buffer.byteLength(s, "utf8") > maxBytes) {
    s = s.slice(0, -1);
  }
  return s.trim();
}

function canonicalFilename(srcPath) {
  const base = path.basename(srcPath);
  const meta = parseFilename(base);

  const title =
    meta?.normalizedTitle ||
    meta?.titleNormalized ||
    meta?.title ||
    base.replace(/\.[^.]+$/, "");

  const parts = [];
  if (meta?.tone) parts.push(meta.tone);
  if (meta?.tram) parts.push("tram");
  if (meta?.style) parts.push(meta.style);

  const suffix = parts.length ? `__${parts.join("_")}` : "";

  // 기존 safe title cleanup
  let safeTitle = String(title)
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ✅ NEW: sanitize long/repeated garbage + trailing __<hash>
  safeTitle = sanitizeBaseName(safeTitle);

  // Build ext
  const ext = path.extname(srcPath) || ".mp4";

  // ✅ NEW: enforce max filename bytes (safe margin for UTF-8)
  // Budget includes suffix + ext
  const budget = Math.max(50, MAX_FILENAME_BYTES - Buffer.byteLength(suffix + ext, "utf8"));
  safeTitle = trimToMaxBytes(safeTitle, budget);

  // If trimming made it empty, fall back to hash
  if (!safeTitle) {
    safeTitle = `untitled_${shortHashFromBasename(srcPath)}`;
  }

  return `${safeTitle}${suffix}${ext}`;
}

function canonicalDestPath(srcPath) {
  return path.join(VIDEOS, canonicalFilename(srcPath));
}

function shortHashFromBasename(srcPath) {
  // Deterministic: same incoming basename => same hash
  const base = path.basename(srcPath);
  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 8);
}

function addCollisionSuffix(dstPath, suffix) {
  const dir = path.dirname(dstPath);
  const ext = path.extname(dstPath);
  const name = path.basename(dstPath, ext);
  return path.join(dir, `${name}__c${suffix}${ext}`);
}

// --------------------
// hardlink logic (collision-aware)
// --------------------
function hardlinkSafe(src, dst) {
  try {
    if (fs.existsSync(dst)) return "exists";
    fs.linkSync(src, dst);
    return "linked";
  } catch (e) {
    if (e?.code === "EEXIST") return "exists";
    throw e;
  }
}

function sameInode(a, b) {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.ino === sb.ino;
  } catch {
    return false;
  }
}

// --------------------
// file stability check
// FIX: must always resolve; otherwise promoteFile can hang forever
// --------------------
function waitForStableSize(file, delayMs = 1500, maxWaitMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    let last = -1;
    const start = Date.now();

    const timer = setInterval(() => {
      // timeout protection
      if (Date.now() - start > maxWaitMs) {
        clearInterval(timer);
        return resolve(false);
      }

      let size;
      try {
        size = fs.statSync(file).size;
      } catch {
        // file vanished mid-download / rename -> don’t hang
        clearInterval(timer);
        return resolve(false);
      }

      if (size === last) {
        clearInterval(timer);
        return resolve(true);
      }

      last = size;
    }, delayMs);
  });
}

// --------------------
// single-file promotion
// returns: { status: "linked"|"exists"|"skip", dst: string|null }
// status === "linked" means a hardlink was created (either normal or collision-resolved)
// --------------------
export async function promoteFile(src) {
  if (!isVideoFile(src)) return { status: "skip", dst: null };

  // If the file disappears quickly (rename/temp), skip safely
  const ok = await waitForStableSize(src);
  if (!ok) return { status: "skip", dst: null };

  let dst = canonicalDestPath(src);
  let status = hardlinkSafe(src, dst);

  if (status === "exists" && dst) {
    // If it already points to same inode, this is fine (duplicate download)
    if (sameInode(src, dst)) {
      return { status: "exists", dst };
    }

    // Collision: canonical name exists but different content.
    // Resolve deterministically by appending stable hash suffix.
    const h = shortHashFromBasename(src);
    const alt = addCollisionSuffix(dst, h);

    const altStatus = hardlinkSafe(src, alt);
    if (altStatus === "linked") {
      return { status: "linked", dst: alt };
    }

    // If alt also exists, check inode; if same inode, treat as exists
    if (altStatus === "exists" && sameInode(src, alt)) {
      return { status: "exists", dst: alt };
    }

    // Could not safely link. Do not delete incoming.
    return { status: "exists", dst };
  }

  return { status, dst };
}

// --------------------
// batch promotion (manual mode)
// NOTE: this does NOT delete incoming files or folders;
// watchVideos.js handles deletion + folder pruning in WATCH mode.
// --------------------
export async function promoteIncoming() {
  console.log("🚚 Promote Incoming → Videos (hardlink)");
  console.log(`INCOMING: ${INCOMING}`);
  console.log(`VIDEOS:   ${VIDEOS}`);

  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : isVideoFile(p) ? [p] : [];
    });

  const files = walk(INCOMING);
  console.log(`Found ${files.length} incoming video files`);

  let linked = 0,
    exists = 0,
    skipped = 0,
    failed = 0;

  for (const src of files) {
    try {
      const { status } = await promoteFile(src);
      if (status === "linked") linked++;
      else if (status === "exists") exists++;
      else if (status === "skip") skipped++;
    } catch (e) {
      failed++;
      console.error("❌ failed:", src);
      console.error(e?.code || "", e?.message || e);
    }
  }

  console.log("\nPromotion summary:");
  console.log("linked:", linked);
  console.log("exists:", exists);
  console.log("skipped:", skipped);
  console.log("failed:", failed);
}
