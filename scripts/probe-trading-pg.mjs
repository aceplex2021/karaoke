import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: 'C:/Users/aceon/AI/trading/.env' });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('no trading DATABASE_URL');
  process.exit(1);
}
console.log('trading_url', url.replace(/:([^:@]+)@/, ':***@'));

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 10000, max: 1 });
try {
  const r = await pool.query(
    'select current_database() db, current_user usr, inet_server_addr()::text addr'
  );
  console.log('TRADING_OK', r.rows[0]);

  const dbs = await pool.query(
    "select datname from pg_database where datname in ('karaoke','trading') order by 1"
  );
  console.log('DBS', dbs.rows.map((x) => x.datname));

  const roles = await pool.query(
    "select rolname, rolcanlogin from pg_roles where rolname in ('kara_app','trading','postgres') order by 1"
  );
  console.log('ROLES', roles.rows);
} catch (e) {
  console.error('TRADING_FAIL', e.code, e.message);
  process.exitCode = 2;
} finally {
  await pool.end();
}
