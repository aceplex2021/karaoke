import { getSupabase } from "./supabase.js";

const sb = getSupabase();

function normalize(p) {
  const s = String(p || "").trim();
  if (!s) return null;
  if (s.startsWith("/")) return s;

  // remove any leading "/" without regex
  let t = s;
  while (t.startsWith("/")) t = t.slice(1);

  return "/Videos/" + t;
}

async function main() {
  const { data, error } = await sb
    .from("kara_files")
    .select("id,storage_path")
    .eq("type", "video")
    .limit(2000);

  if (error) throw error;

  const updates = [];
  for (const r of data || []) {
    const cur = String(r.storage_path || "");
    const next = normalize(cur);
    if (next && next !== cur && !cur.startsWith("/")) {
      updates.push({ id: r.id, storage_path: next });
    }
  }

  console.log("Fetched:", (data || []).length);
  console.log("To update:", updates.length);

  if (updates.length === 0) return;

  const { error: upErr } = await sb
    .from("kara_files")
    .upsert(updates, { onConflict: "id" });

  if (upErr) throw upErr;

  console.log("OK normalized storage_path for", updates.length, "rows");
}

main().catch((e) => {
  console.error("NORMALIZE FAILED:", e.message || e);
  process.exit(1);
});
