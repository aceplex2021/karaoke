import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/phase-b-user-hist-fav.mjs <userId>');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const user = await pool.query(
    `SELECT id, display_name, email, google_sub, fingerprint, created_at, last_seen_at
     FROM kara_users WHERE id = $1`,
    [userId]
  );
  console.log('=== USER ===');
  console.log(JSON.stringify(user.rows[0] || null, null, 2));

  const prefs = await pool.query(
    `SELECT favorite_song_ids, updated_at
     FROM kara_user_preferences WHERE user_id = $1`,
    [userId]
  );
  const favIds = prefs.rows[0]?.favorite_song_ids || [];
  console.log('\n=== FAVORITES (raw ids) ===');
  console.log(JSON.stringify(favIds, null, 2));
  console.log('prefs.updated_at:', prefs.rows[0]?.updated_at || '(no preferences row)');

  if (Array.isArray(favIds) && favIds.length) {
    const versions = await pool.query(
      `SELECT id, title, artist, language
       FROM kara_versions WHERE id = ANY($1::uuid[])`,
      [favIds]
    );
    console.log('\n=== FAVORITES matched as kara_versions ===');
    console.log(JSON.stringify(versions.rows, null, 2));

    const queue = await pool.query(
      `SELECT id, source_type, youtube_url, metadata, status, created_at
       FROM kara_queue WHERE id = ANY($1::uuid[])`,
      [favIds]
    );
    console.log('\n=== FAVORITES matched as kara_queue (YouTube) ===');
    for (const row of queue.rows) {
      const meta = row.metadata || {};
      console.log(
        JSON.stringify(
          {
            id: row.id,
            source_type: row.source_type,
            youtube_url: row.youtube_url,
            title: meta.title || meta.song_title || null,
            artist: meta.artist || meta.channel || null,
            status: row.status,
            created_at: row.created_at,
          },
          null,
          2
        )
      );
    }

    const found = new Set([
      ...versions.rows.map((r) => r.id),
      ...queue.rows.map((r) => r.id),
    ]);
    const orphan = favIds.filter((id) => !found.has(id));
    console.log('\n=== FAVORITES orphaned (id not in versions or queue) ===');
    console.log(JSON.stringify(orphan, null, 2));
  }

  const histCols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'kara_song_history' ORDER BY 1`
  );
  console.log('\n=== kara_song_history columns ===');
  console.log(histCols.rows.map((r) => r.column_name).join(', '));

  const hist = await pool.query(
    `SELECT * FROM kara_song_history WHERE user_id = $1
     ORDER BY sung_at DESC NULLS LAST LIMIT 100`,
    [userId]
  );
  console.log('\n=== HISTORY rows (kara_song_history) ===');
  console.log(JSON.stringify(hist.rows, null, 2));

  const qCols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'kara_queue' ORDER BY 1`
  );
  console.log('\n=== kara_queue columns ===');
  console.log(qCols.rows.map((r) => r.column_name).join(', '));

  const ytHist = await pool.query(
    `SELECT id, youtube_url, metadata, status, added_at, completed_at, room_id, user_id
     FROM kara_queue
     WHERE user_id = $1
     ORDER BY COALESCE(completed_at, added_at) DESC
     LIMIT 50`,
    [userId]
  );
  console.log('\n=== QUEUE rows for this user ===');
  for (const row of ytHist.rows) {
    const meta = row.metadata || {};
    console.log(
      JSON.stringify(
        {
          id: row.id,
          status: row.status,
          title: meta.title || meta.song_title || null,
          artist: meta.artist || meta.channel || null,
          youtube_url: row.youtube_url,
          added_at: row.added_at,
          completed_at: row.completed_at,
          room_id: row.room_id,
        },
        null,
        2
      )
    );
  }
  if (!ytHist.rows.length) console.log('(none)');
} catch (e) {
  console.error('ERR', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
