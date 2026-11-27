import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const r = await pool.query(
    `DELETE FROM kara_users WHERE fingerprint LIKE 'smoke-%' RETURNING id`
  );
  console.log("deleted_users", r.rowCount);
} finally {
  await pool.end();
}
