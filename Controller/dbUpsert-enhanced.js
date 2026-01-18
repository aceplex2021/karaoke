// dbUpsert-enhanced.js
// Enhanced with artist_name and performance_type support
import { getSupabase } from "./supabase.js";
import { toTitleCase } from "./titleCase.js";

/**
 * Use parser-computed semantic label for kara_versions.label
 */
function resolveVersionLabel(meta) {
  const label = meta?.label?.trim();
  return label || "original";
}

/**
 * Optional: store musical key if detected (Bm/Ebm/F#m/etc).
 */
function resolveKey(meta) {
  const key = meta?.key?.trim?.() || meta?.key || null;
  return key || null;
}

/**
 * Lookup language_id by code
 */
async function getLanguageIdByCode(code) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("kara_languages")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(
      `Language code '${code}' not found in kara_languages. Seed it first or create it in DB.`
    );
  }

  return data.id;
}

/**
 * Best-effort base key (only used as fallback).
 * DB trigger is the source of truth now.
 */
function computeBaseTitleKeyFromNormalizedTitle(normalizedTitle) {
  let s = String(normalizedTitle || "").toLowerCase().trim();
  if (!s) return "";

  while (s.startsWith("｜") || s.startsWith("|")) s = s.slice(1).trim();
  const seg = (s.split("｜")[0] ?? s).trim();
  const seg2 = (seg.split("|")[0] ?? seg).trim();
  const collapsed = seg2.replace(/\s+/g, " ").trim();

  const folded = collapsed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  return folded;
}

/**
 * Ensure group + membership exists for (songId, base_title_unaccent)
 * - creates group if missing
 * - inserts membership (ignores duplicates)
 */
async function ensureSongGroupMembership({ songId, baseTitleUnaccent, displayTitle }) {
  const supabase = getSupabase();

  const key = String(baseTitleUnaccent || "").trim();
  if (!key) return null;

  // 1) Create or fetch group
  const { data: group, error: gErr } = await supabase
    .from("kara_song_groups")
    .upsert(
      {
        base_title_unaccent: key,
        base_title_display: displayTitle || null,
      },
      { onConflict: "base_title_unaccent" }
    )
    .select("id")
    .single();

  if (gErr) throw gErr;

  // 2) Create membership (ignore duplicates)
  const { error: mErr } = await supabase
    .from("kara_song_group_members")
    .insert({ group_id: group.id, song_id: songId });

  if (mErr) {
    const msg = (mErr.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) return group;
    throw mErr;
  }

  return group;
}

/**
 * Upsert kara_songs using (normalized_title, language_id) uniqueness.
 * NOW INCLUDES: artist_name and performance_type
 * NOTE: DB trigger fills base_title/base_title_unaccent automatically.
 */
async function upsertSong({ meta, languageId }) {
  const supabase = getSupabase();

  const normalized = meta.normalized_title;
  const displayTitle = toTitleCase(meta.title_clean);

  if (!normalized) throw new Error("meta.normalized_title is required");
  if (!displayTitle) throw new Error("meta.title_clean is required");

  // Extract artist and performance type from meta
  const artistName = meta.artist_name || null;
  const performanceType = meta.performance_type || 'solo';

  const payload = {
    title: displayTitle, // legacy column
    title_display: displayTitle,
    normalized_title: normalized,
    language_id: languageId,
    artist_name: artistName,
    performance_type: performanceType,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("kara_songs")
    .upsert(payload, { onConflict: "normalized_title,language_id" })
    // include base_title_unaccent so we can group immediately
    .select("id,normalized_title,title_display,base_title_unaccent,artist_name,performance_type")
    .single();

  if (error) throw error;
  return data; // { id, normalized_title, title_display, base_title_unaccent, artist_name, performance_type }
}

/**
 * Get or create a kara_versions row for (song_id, label)
 * Also patches key if detected and missing.
 */
async function getOrCreateVersion({ songId, label, key }) {
  const supabase = getSupabase();

  const { data: existing, error: selErr } = await supabase
    .from("kara_versions")
    .select("id,key")
    .eq("song_id", songId)
    .eq("label", label)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing?.id) {
    if (key && !existing.key) {
      const { error: updErr } = await supabase
        .from("kara_versions")
        .update({ key })
        .eq("id", existing.id);

      if (updErr) throw updErr;
    }
    return existing; // { id, key }
  }

  const { data: created, error: insErr } = await supabase
    .from("kara_versions")
    .insert({
      song_id: songId,
      label,
      key: key || null,
      is_default: label === "original",
    })
    .select("id")
    .single();

  if (insErr) throw insErr;
  return created; // { id }
}

/**
 * Insert a kara_files row (video asset).
 * If UNIQUE(storage_path) exists, duplicates will be skipped.
 */
async function insertFile({ versionId, relativePath }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("kara_files")
    .insert({
      version_id: versionId,
      type: "video",
      storage_path: relativePath,
      format: "mp4",
    })
    .select("id")
    .single();

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) return null;
    throw error;
  }

  return data; // { id }
}

/**
 * Public API used by scanVideos.js / watchVideos.js when WRITE_DB=true
 * NOW ENHANCED: writes artist_name and performance_type to kara_songs
 */
export async function upsertSongVersionFile({
  meta,
  relativePath,
  defaultLanguageCode = "vi",
}) {
  const languageId = await getLanguageIdByCode(defaultLanguageCode);

  const song = await upsertSong({ meta, languageId });

  // Group membership (should never block ingestion)
  try {
    const baseKey =
      String(song.base_title_unaccent || "").trim() ||
      computeBaseTitleKeyFromNormalizedTitle(song.normalized_title);

    await ensureSongGroupMembership({
      songId: song.id,
      baseTitleUnaccent: baseKey,
      displayTitle: song.title_display,
    });
  } catch (e) {
    console.error("WARN: grouping failed (non-blocking):", e?.message || e);
  }

  const label = resolveVersionLabel(meta);
  const key = resolveKey(meta);

  const version = await getOrCreateVersion({ songId: song.id, label, key });

  return await insertFile({ versionId: version.id, relativePath });
}
