import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const userId = process.argv[2];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prefs = await pool.query(
  `SELECT favorite_song_ids, updated_at FROM kara_user_preferences WHERE user_id = $1`,
  [userId]
);
console.log(JSON.stringify(prefs.rows[0] || null, null, 2));
const ids = prefs.rows[0]?.favorite_song_ids || [];
if (ids.length) {
  const q = await pool.query(
    `SELECT id, status, youtube_url, metadata->>'title' AS title FROM kara_queue WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  console.log('resolved:', JSON.stringify(q.rows, null, 2));
}
await pool.end();
