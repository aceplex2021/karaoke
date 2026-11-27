import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const r = await pool.query(`
    SELECT room_code, is_active, expires_at, created_at,
           expires_at < NOW() AS expired_vs_now,
           expires_at::text AS expires_text,
           NOW()::text AS now_text,
           pg_typeof(expires_at)::text AS expires_type
    FROM kara_rooms
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log(JSON.stringify(r.rows, null, 2));

  // Simulate join check
  for (const row of r.rows) {
    const parsed = new Date(row.expires_at);
    const now = new Date();
    console.log(row.room_code, {
      expires_at_raw: row.expires_at,
      parsed: parsed.toISOString(),
      now: now.toISOString(),
      check_expired: !!(row.expires_at && parsed < now),
      invalid: Number.isNaN(parsed.getTime()),
    });
  }
} finally {
  await pool.end();
}
