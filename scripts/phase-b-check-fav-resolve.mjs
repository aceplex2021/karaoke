import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const { rows } = await pool.query(`
    SELECT u.display_name, u.fingerprint, p.favorite_song_ids
    FROM kara_user_preferences p
    JOIN kara_users u ON u.id = p.user_id
    WHERE jsonb_array_length(COALESCE(p.favorite_song_ids,'[]'::jsonb)) > 0
    ORDER BY jsonb_array_length(p.favorite_song_ids) DESC
    LIMIT 5
  `);
  for (const row of rows) {
    const ids = row.favorite_song_ids;
    const v = await pool.query(
      `SELECT count(*)::int AS c FROM kara_versions WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    const q = await pool.query(
      `SELECT count(*)::int AS c FROM kara_queue WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    console.log({
      name: row.display_name,
      fp: String(row.fingerprint).slice(0, 8),
      favs: ids.length,
      resolveVersions: v.rows[0].c,
      resolveQueue: q.rows[0].c,
      orphanIds: ids.length - v.rows[0].c - q.rows[0].c,
    });
  }
} finally {
  await pool.end();
}
