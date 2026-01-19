// dbUpsert.js
// Updated for simplified schema: kara_versions is the main table
// No more kara_songs - versions are the atomic unit
import { getSupabase } from "./supabase.js";
import { toTitleCase } from "./titleCase.js";

/**
 * Compute base title for grouping (remove accents, lowercase, trim)
 */
function computeBaseTitleFromNormalized(normalizedTitle) {
  let s = String(normalizedTitle || "").toLowerCase().trim();
  if (!s) return "";

  // Remove pipes and extra whitespace
  while (s.startsWith("｜") || s.startsWith("|")) s = s.slice(1).trim();
  const seg = (s.split("｜")[0] ?? s).trim();
  const seg2 = (seg.split("|")[0] ?? seg).trim();
  const collapsed = seg2.replace(/\s+/g, " ").trim();

  // Remove accents
  const folded = collapsed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  return folded;
}

/**
 * Get language ID by code
 */
async function getLanguageIdByCode(code) {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from("kara_languages")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error(`[getLanguageIdByCode] Supabase error:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    if (!data?.id) {
      throw new Error(`Language code '${code}' not found. Seed kara_languages first.`);
    }

    return data.id;
  } catch (err) {
    console.error(`[getLanguageIdByCode] Fetch/Network error:`, {
      name: err.name,
      message: err.message,
      cause: err.cause,
      stack: err.stack?.split('\n').slice(0, 5).join('\n')
    });
    throw err;
  }
}

/**
 * Create or get song group (for UI grouping only)
 */
async function ensureGroup({ baseTitle, displayTitle }) {
  const supabase = getSupabase();
  
  if (!baseTitle) return null;

  const { data, error } = await supabase
    .from("kara_song_groups")
    .upsert(
      {
        base_title_unaccent: baseTitle,
        base_title_display: displayTitle || null,
      },
      { onConflict: "base_title_unaccent" }
    )
    .select("id")
    .single();

  if (error) {
    console.warn("⚠️  Group creation failed (non-blocking):", error.message);
    return null;
  }

  return data;
}

/**
 * Main upsert function - writes ALL parsed metadata to kara_versions
 * This is the simplified version that writes directly to kara_versions
 * (no more kara_songs table!)
 */
export async function upsertSongVersionFile({
  meta,
  relativePath,
  defaultLanguageCode = "vi",
}) {
  const supabase = getSupabase();

  try {
    console.log(`[upsert] START: ${relativePath}`);
    
    // 1. Get language ID
    const languageId = await getLanguageIdByCode(defaultLanguageCode);
    console.log(`[upsert] languageId: ${languageId}`);

    // 2. Compute base title for grouping
    const baseTitle = computeBaseTitleFromNormalized(meta.normalized_title);
    const displayTitle = toTitleCase(meta.title_clean || meta.title_display);

    // 3. Ensure group exists (optional, for UI)
    let groupId = null;
    try {
      const group = await ensureGroup({ baseTitle, displayTitle });
      groupId = group?.id || null;
      console.log(`[upsert] groupId: ${groupId || 'none'}`);
    } catch (e) {
      console.warn("⚠️  Group creation failed (non-blocking):", e.message);
    }

    // 4. Upsert version with ALL parser fields
    const versionPayload = {
      group_id: groupId,
      
      // Title fields
      title_display: displayTitle,
      title_clean: meta.title_clean || displayTitle,
      normalized_title: meta.normalized_title,
      base_title_unaccent: baseTitle,
      
      // Metadata from parser
      tone: meta.tone || null,
      mixer: meta.mixer || meta.channel || null,  // Parser returns both
      style: meta.style || null,
      artist_name: meta.artist_name || null,
      performance_type: meta.performance_type || 'solo',
      is_tram: meta.is_tram || false,
      
      // Musical metadata
      key: meta.key || null,
      tempo: null,  // Parser doesn't extract this yet
      label: meta.label || 'original',
      
      // System fields
      language_id: languageId,
      is_default: !meta.label || meta.label === 'original',
    };

    const { data: version, error: versionError } = await supabase
      .from("kara_versions")
      .upsert(versionPayload, {
        onConflict: "normalized_title,language_id,label",
      })
      .select("id")
      .single();

    if (versionError) {
      console.error(`[upsert] Version upsert failed:`, {
        message: versionError.message,
        code: versionError.code,
        details: versionError.details
      });
      throw versionError;
    }
    
    console.log(`[upsert] versionId: ${version.id}`);

    // 5. Insert file record
    const { error: fileError } = await supabase
      .from("kara_files")
      .insert({
        version_id: version.id,
        type: "video",
        storage_path: relativePath,
        format: "mp4",
      });

    if (fileError) {
      const msg = (fileError.message || "").toLowerCase();
      // Ignore duplicate errors (file already exists)
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        console.error(`[upsert] File insert failed:`, {
          message: fileError.message,
          code: fileError.code
        });
        throw fileError;
      }
      console.log(`[upsert] File already exists (OK): ${relativePath}`);
    }

    console.log(`[upsert] SUCCESS: ${relativePath}`);
    return version;
  } catch (err) {
    console.error(`[upsert] FAILED: ${relativePath}`, {
      name: err.name,
      message: err.message,
      cause: err.cause?.message || err.cause,
      code: err.code
    });
    throw err;
  }
}
