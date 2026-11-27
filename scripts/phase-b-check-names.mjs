import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const roomId = 'd8ec2e68-fba5-48af-8773-663557a4cfb7';
const q = await pool.query(
  `SELECT q.id, q.status, q.user_id, q.metadata->>'title' AS title,
          u.display_name, u.email, u.google_sub
   FROM kara_queue q
   LEFT JOIN kara_users u ON u.id = q.user_id
   WHERE q.room_id = $1
   ORDER BY q.added_at DESC
   LIMIT 12`,
  [roomId]
);
console.log(JSON.stringify(q.rows, null, 2));
const p = await pool.query(
  `SELECT p.user_id, p.user_name, p.role, p.status, u.display_name, u.email
   FROM kara_room_participants p
   LEFT JOIN kara_users u ON u.id = p.user_id
   WHERE p.room_id = $1`,
  [roomId]
);
console.log('participants', JSON.stringify(p.rows, null, 2));
await pool.end();
