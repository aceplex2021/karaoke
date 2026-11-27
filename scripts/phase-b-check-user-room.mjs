import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const id = "d8ec2e68-fba5-48af-8773-663557a4cfb7";
  const r = await pool.query(
    `SELECT room_code, room_name, is_active, created_at, expires_at,
            expires_at < NOW() AS expired, primary_tv_id
     FROM kara_rooms WHERE id = $1 OR room_code = '7XBV2Q'`,
    [id]
  );
  console.log("ROOM", r.rows);

  const p = await pool.query(
    `SELECT rp.role, rp.status, rp.user_name, u.fingerprint, rp.joined_at
     FROM kara_room_participants rp
     JOIN kara_users u ON u.id = rp.user_id
     WHERE rp.room_id = $1
     ORDER BY rp.joined_at`,
    [r.rows[0]?.id || id]
  );
  console.log("PARTICIPANTS", p.rows);
} finally {
  await pool.end();
}
