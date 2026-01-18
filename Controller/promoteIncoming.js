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
  const safeTitle = String(title)
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const ext = path.extname(srcPath) || ".mp4";
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
