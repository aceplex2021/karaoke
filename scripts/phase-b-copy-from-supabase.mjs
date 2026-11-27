/**
 * Copy karaoke data Supabase → local Patroni (Phase B).
 * Preserves UUIDs. Cold-cuts live queue/participants (skipped by default).
 *
 * Usage:
 *   node scripts/phase-b-copy-from-supabase.mjs
 *   node scripts/phase-b-copy-from-supabase.mjs --include-live   # also queue + participants
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const includeLive = process.argv.includes("--include-live");

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;

if (!sbUrl || !sbKey || !dbUrl) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL");
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });

const PAGE = 1000;
const BATCH = 200;

/** FK-safe order */
const TABLES = [
  "kara_languages",
  "kara_users",
  "kara_song_groups",
  "kara_versions",
  "kara_files",
  "kara_rooms",
  ...(includeLive ? ["kara_queue", "kara_room_participants"] : []),
  "kara_song_history",
  "kara_user_preferences",
];

async function localColumns(table) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await sb.from(table).select("*").range(from, to);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    process.stdout.write(`\r  fetch ${table}: ${rows.length}`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (rows.length) process.stdout.write("\n");
  return rows;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function upsertRows(table, rows, cols) {
  if (!rows.length) return 0;
  let written = 0;
  const colList = [...cols].filter((c) => rows.some((r) => r[c] !== undefined));

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params = [];
    const valueSql = chunk.map((row) => {
      const placeholders = colList.map((c) => {
        params.push(row[c] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });

    // Prefer conflict on primary key id when present
    const conflict = colList.includes("id") ? "id" : colList[0];
    const updates = colList
      .filter((c) => c !== conflict)
      .map((c) => `${quoteIdent(c)}=EXCLUDED.${quoteIdent(c)}`)
      .join(", ");

    const sql = `
      INSERT INTO ${quoteIdent(table)} (${colList.map(quoteIdent).join(",")})
      VALUES ${valueSql.join(",")}
      ON CONFLICT (${quoteIdent(conflict)}) DO UPDATE SET ${updates || `${quoteIdent(conflict)}=EXCLUDED.${quoteIdent(conflict)}`}
    `;
    await pool.query(sql, params);
    written += chunk.length;
    process.stdout.write(`\r  upsert ${table}: ${written}/${rows.length}`);
  }
  if (rows.length) process.stdout.write("\n");
  return written;
}

async function countLocal(table) {
  const r = await pool.query(`SELECT count(*)::int AS c FROM ${quoteIdent(table)}`);
  return r.rows[0].c;
}

async function main() {
  console.log("Phase B copy Supabase → local", includeLive ? "(with live queue)" : "(cold-cut queue)");
  console.log("tables:", TABLES.join(", "));

  // Clean slate so Supabase UUIDs / unique keys win (avoids seed language id clash)
  console.log("\n=== truncate local kara_* ===");
  await pool.query(`
    TRUNCATE TABLE
      kara_queue,
      kara_room_participants,
      kara_song_history,
      kara_user_preferences,
      kara_files,
      kara_versions,
      kara_rooms,
      kara_song_groups,
      kara_users,
      kara_languages
    RESTART IDENTITY CASCADE
  `);

  const summary = [];

  for (const table of TABLES) {
    console.log(`\n=== ${table} ===`);
    const cols = await localColumns(table);
    let rows = await fetchAll(table);

    if (table === "kara_rooms") {
      rows = rows.map((r) => ({ ...r, current_entry_id: null }));
    }
    if (table === "kara_queue" && !includeLive) {
      // unreachable; kept for clarity
    }

    // Drop columns not in local schema; serialize objects for json/jsonb
    const jsonCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
         AND data_type IN ('json','jsonb')`,
      [table]
    );
    const jsonSet = new Set(jsonCols.rows.map((x) => x.column_name));

    rows = rows.map((r) => {
      const out = {};
      for (const c of cols) {
        if (!Object.prototype.hasOwnProperty.call(r, c)) continue;
        let v = r[c];
        if (jsonSet.has(c) && v != null && typeof v === "object") {
          v = JSON.stringify(v);
        }
        // pg rejects empty string for uuid/json sometimes
        if (v === "") v = null;
        out[c] = v;
      }
      return out;
    });

    const n = await upsertRows(table, rows, cols);
    const local = await countLocal(table);
    summary.push({ table, source: rows.length, upserted: n, local });
  }

  console.log("\n=== SUMMARY ===");
  console.table(summary);

  // Spot-check: versions with files
  const spot = await pool.query(`
    SELECT
      (SELECT count(*) FROM kara_versions) AS versions,
      (SELECT count(*) FROM kara_files) AS files,
      (SELECT count(*) FROM kara_song_groups) AS groups,
      (SELECT count(*) FROM kara_users) AS users,
      (SELECT count(*) FROM kara_rooms) AS rooms
  `);
  console.log("LOCAL_SPOT", spot.rows[0]);
  console.log("COPY_OK");
}

main()
  .catch((e) => {
    console.error("COPY_FAIL", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
