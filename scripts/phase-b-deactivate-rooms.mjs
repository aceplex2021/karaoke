import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const r = await pool.query(`
    UPDATE kara_rooms
    SET is_active = false,
        current_entry_id = NULL,
        primary_tv_id = NULL,
        connected_tv_ids = '[]'::jsonb,
        updated_at = NOW()
  `);
  console.log("rooms_deactivated", r.rowCount);
} finally {
  await pool.end();
}
