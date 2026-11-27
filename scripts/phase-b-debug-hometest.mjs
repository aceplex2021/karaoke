import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const r = await pool.query(`
    SELECT room_code, room_name, is_active,
           created_at, created_at::text AS created_text,
           expires_at, expires_at::text AS expires_text,
           expires_at < NOW() AS expired,
           updated_at
    FROM kara_rooms
    WHERE room_code IN ('9LR7WA','SMD849','YTEEM9')
       OR room_name ILIKE '%home%'
       OR created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at DESC
  `);
  console.log(JSON.stringify(r.rows, null, 2));

  const defs = await pool.query(`
    SELECT column_name, column_default, data_type
    FROM information_schema.columns
    WHERE table_name='kara_rooms'
      AND column_name IN ('created_at','expires_at','is_active','updated_at')
  `);
  console.log("defaults", defs.rows);
} finally {
  await pool.end();
}
