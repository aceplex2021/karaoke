import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const r = await pool.query(`
    SELECT room_code, room_name, is_active, created_at, expires_at,
           inet_server_addr()::text AS server
    FROM kara_rooms
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log("server", r.rows[0]?.server || "(none)");
  console.log("count_recent", r.rowCount);
  console.table(
    r.rows.map((x) => ({
      code: x.room_code,
      name: x.room_name,
      active: x.is_active,
      created: x.created_at,
    }))
  );
  const c = await pool.query(`SELECT count(*)::int AS c FROM kara_rooms`);
  console.log("total_rooms", c.rows[0].c);
} finally {
  await pool.end();
}
