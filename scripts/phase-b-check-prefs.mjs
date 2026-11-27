import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const prefs = await pool.query(`
    SELECT p.user_id, u.display_name, u.fingerprint,
           p.favorite_song_ids, jsonb_typeof(p.favorite_song_ids) AS fav_type,
           jsonb_array_length(COALESCE(p.favorite_song_ids, '[]'::jsonb)) AS fav_len
    FROM kara_user_preferences p
    LEFT JOIN kara_users u ON u.id = p.user_id
    ORDER BY fav_len DESC NULLS LAST
    LIMIT 20
  `);
  console.log("PREFS", prefs.rows);

  const hist = await pool.query(`
    SELECT h.user_id, u.display_name, u.fingerprint, count(*)::int AS n
    FROM kara_song_history h
    LEFT JOIN kara_users u ON u.id = h.user_id
    GROUP BY 1,2,3
    ORDER BY n DESC
    LIMIT 20
  `);
  console.log("HISTORY_BY_USER", hist.rows);

  const users = await pool.query(`
    SELECT id, display_name, fingerprint, created_at, last_seen_at
    FROM kara_users
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 15
  `);
  console.log("RECENT_USERS");
  console.table(
    users.rows.map((u) => ({
      name: u.display_name,
      fp: String(u.fingerprint || "").slice(0, 8),
      last: u.last_seen_at,
    }))
  );
} finally {
  await pool.end();
}
