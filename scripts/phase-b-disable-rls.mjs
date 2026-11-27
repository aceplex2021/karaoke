import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  for (const t of [
    "kara_song_history",
    "kara_user_preferences",
    "kara_rooms",
    "kara_queue",
    "kara_room_participants",
    "kara_users",
    "kara_files",
    "kara_versions",
    "kara_song_groups",
    "kara_languages",
  ]) {
    try {
      await pool.query(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
      console.log("disabled", t);
    } catch (e) {
      console.log("skip", t, e.message);
    }
  }
} finally {
  await pool.end();
}
