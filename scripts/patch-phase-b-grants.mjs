import fs from "fs";

const p = "database/phase_b_schema.sql";
let s = fs.readFileSync(p, "utf8");

// Normalize line endings for matching
const before = s;

s = s.replace(
  /GRANT EXECUTE ON FUNCTION ([^\n;]+) TO authenticated, anon, service_role;/g,
  (_m, fn) =>
    [
      `-- Phase B: grant to kara_app (Supabase roles omitted)`,
      `DO $grant$ BEGIN`,
      `  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kara_app') THEN`,
      `    EXECUTE 'GRANT EXECUTE ON FUNCTION ${fn.trim()} TO kara_app';`,
      `  END IF;`,
      `END $grant$;`,
    ].join("\n")
);

// Drop Supabase RLS policies that reference missing roles
s = s.replace(
  /DROP POLICY IF EXISTS "Enable all for authenticated and anon users" ON kara_song_history;\r?\nCREATE POLICY "Enable all for authenticated and anon users"[\s\S]*?;\r?\n/g,
  `-- Phase B: skip Supabase RLS policy on kara_song_history (no authenticated/anon roles)\n`
);

// Disable RLS if enabled for song_history without usable policies
if (!s.includes("ALTER TABLE kara_song_history DISABLE ROW LEVEL SECURITY")) {
  s = s.replace(
    /(CREATE TABLE IF NOT EXISTS kara_song_history[\s\S]*?;)/,
    `$1\nALTER TABLE kara_song_history DISABLE ROW LEVEL SECURITY;`
  );
}

fs.writeFileSync(p, s);
const grants = (before.match(/TO authenticated, anon, service_role;/g) || [])
  .length;
const left = (s.match(/TO authenticated, anon, service_role;/g) || []).length;
console.log("grants_before", grants, "grants_left", left);
console.log("policy_refs_left", (s.match(/\n\s*TO authenticated, anon/g) || []).length);
