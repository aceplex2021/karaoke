import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  for (const code of ["7XBC2Q", "7XBV2Q", "7XBC2Q".replace("C", "V")]) {
    const r = await pool.query(
      `SELECT room_code, room_name, is_active FROM kara_rooms WHERE room_code = $1`,
      [code]
    );
    console.log(code, r.rows[0] || "NOT_FOUND");
  }
  const c = await pool.query(`SELECT count(*)::int AS c FROM kara_rooms`);
  console.log("total", c.rows[0].c);
  const similar = await pool.query(
    `SELECT room_code, room_name, is_active FROM kara_rooms
     WHERE room_code LIKE '7XB%' OR room_name ILIKE '%local%'`
  );
  console.log("similar", similar.rows);
} finally {
  await pool.end();
}
