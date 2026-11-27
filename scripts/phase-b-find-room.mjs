import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const code = process.argv[2];
if (!code) {
  console.error("usage: node phase-b-find-room.mjs ROOMCODE");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const local = await pool.query(
    `SELECT room_code, room_name, is_active, created_at, id
     FROM kara_rooms WHERE room_code = $1`,
    [code.toUpperCase()]
  );
  console.log("LOCAL", local.rows[0] || null);

  const recent = await pool.query(
    `SELECT room_code, room_name, is_active, created_at
     FROM kara_rooms ORDER BY created_at DESC NULLS LAST LIMIT 8`
  );
  console.log("LOCAL_RECENT");
  console.table(recent.rows);
} finally {
  await pool.end();
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const { data, error } = await sb
  .from("kara_rooms")
  .select("room_code, room_name, is_active, created_at, id")
  .eq("room_code", code.toUpperCase())
  .maybeSingle();
console.log("SUPABASE", error ? error.message : data);

const { data: recentSb } = await sb
  .from("kara_rooms")
  .select("room_code, room_name, is_active, created_at")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("SUPABASE_RECENT");
console.table(recentSb || []);
