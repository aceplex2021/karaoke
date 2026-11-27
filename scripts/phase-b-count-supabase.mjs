import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env missing");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "kara_languages",
  "kara_users",
  "kara_song_groups",
  "kara_versions",
  "kara_files",
  "kara_rooms",
  "kara_queue",
  "kara_room_participants",
  "kara_song_history",
  "kara_user_preferences",
];

for (const t of tables) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) console.log(t, "ERR", error.message);
  else console.log(t, count);
}
