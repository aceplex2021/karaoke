import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('FAIL: DATABASE_URL missing');
  process.exit(1);
}

const u = new URL(url);
console.log('host=', u.hostname);
console.log('port=', u.port || '5432');
console.log('db=', u.pathname.replace(/^\//, ''));
console.log('user=', u.username);
console.log('ssl=', u.searchParams.get('sslmode') || '(none)');

const expected = {
  host: '10.0.29.95',
  port: '5432',
  db: 'karaoke',
  user: 'kara_app',
};

let ok = true;
if (u.hostname !== expected.host) {
  console.error('WARN: host expected', expected.host);
  ok = false;
}
if ((u.port || '5432') !== expected.port) {
  console.error('WARN: port expected', expected.port);
  ok = false;
}
if (u.pathname.replace(/^\//, '') !== expected.db) {
  console.error('WARN: database expected', expected.db);
  ok = false;
}
if (u.username !== expected.user) {
  console.error('WARN: user expected', expected.user);
  ok = false;
}

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 10000, max: 1 });
try {
  const r = await pool.query(
    'select current_database() as db, current_user as usr, inet_server_addr()::text as addr, version() as ver'
  );
  console.log('CONNECT_OK', r.rows[0].db, r.rows[0].usr, r.rows[0].addr);
  console.log('VERSION', String(r.rows[0].ver).split(',')[0]);

  const t = await pool.query(
    "select tablename from pg_tables where schemaname='public' and tablename like 'kara_%' order by 1"
  );
  const tables = t.rows.map((x) => x.tablename);
  console.log('TABLES', tables.length ? tables.join(',') : '(none)');

  const needed = [
    'kara_languages',
    'kara_users',
    'kara_song_groups',
    'kara_versions',
    'kara_files',
    'kara_rooms',
    'kara_queue',
    'kara_room_participants',
    'kara_song_history',
    'kara_user_preferences',
  ];
  const missingTables = needed.filter((n) => !tables.includes(n));
  if (missingTables.length) {
    console.log('MISSING_TABLES', missingTables.join(','));
    ok = false;
  } else {
    console.log('TABLES_OK');
  }

  const f = await pool.query(
    `select proname from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and proname = any($1::text[])
     order by 1`,
    [[
      'advance_playback',
      'calculate_round_robin_position',
      'set_primary_tv',
      'add_connected_tv',
      'expire_old_rooms',
      'cleanup_stale_participations',
    ]]
  );
  const funcs = f.rows.map((x) => x.proname);
  console.log('FUNCS', funcs.length ? funcs.join(',') : '(none)');
  const missingFuncs = [
    'advance_playback',
    'calculate_round_robin_position',
    'set_primary_tv',
    'add_connected_tv',
  ].filter((n) => !funcs.includes(n));
  if (missingFuncs.length) {
    console.log('MISSING_FUNCS', missingFuncs.join(','));
    ok = false;
  } else {
    console.log('FUNCS_OK');
  }

  const counts = {};
  for (const table of tables) {
    const c = await pool.query(`select count(*)::int as c from ${table}`);
    counts[table] = c.rows[0].c;
  }
  console.log('COUNTS', JSON.stringify(counts));

  if (!ok) process.exitCode = 3;
  else console.log('VERIFY_PASS');
} catch (e) {
  console.error('CONNECT_FAIL', e.code || '', e.message);
  process.exitCode = 2;
} finally {
  await pool.end();
}
