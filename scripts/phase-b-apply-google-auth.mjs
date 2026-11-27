import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '../database/phase_b_google_auth.sql'),
  'utf8'
);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
try {
  await pool.query(sql);
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='kara_users' ORDER BY 1`
  );
  console.log('OK columns:', r.rows.map((x) => x.column_name).join(', '));
} catch (e) {
  console.error('ERR', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
