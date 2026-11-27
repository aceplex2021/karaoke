/**
 * Smoke: local karaoke DB write path (user + room + notify).
 */
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const fingerprint = `smoke-${randomUUID().slice(0, 8)}`;
const roomCode = String(Math.floor(100000 + Math.random() * 900000));

try {
  const user = await pool.query(
    `INSERT INTO kara_users (fingerprint, display_name)
     VALUES ($1, $2) RETURNING id`,
    [fingerprint, "Smoke Test"]
  );
  const userId = user.rows[0].id;

  const room = await pool.query(
    `INSERT INTO kara_rooms (room_code, room_name, host_id, is_active)
     VALUES ($1, $2, $3, true) RETURNING id, room_code`,
    [roomCode, "Smoke Room", userId]
  );
  const roomId = room.rows[0].id;

  await pool.query(`SELECT pg_notify($1, $2)`, [
    "kara_room",
    JSON.stringify({ roomId, event: "smoke", at: Date.now() }),
  ]);

  const rr = await pool.query(
    `SELECT calculate_round_robin_position($1::uuid, $2::uuid) AS sk`,
    [roomId, userId]
  );

  console.log("SMOKE_OK", {
    userId,
    roomId,
    roomCode: room.rows[0].room_code,
    sortKey: rr.rows[0].sk,
  });

  // cleanup
  await pool.query(`DELETE FROM kara_rooms WHERE id = $1`, [roomId]);
  await pool.query(`DELETE FROM kara_users WHERE id = $1`, [userId]);
  console.log("SMOKE_CLEANED");
} catch (e) {
  console.error("SMOKE_FAIL", e.code || "", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
