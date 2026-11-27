/**
 * Set DATABASE_URL password. Use --force to rotate even if already set.
 * Does not print the password.
 */
import fs from "fs";
import crypto from "crypto";

const force = process.argv.includes("--force");
const envPath = ".env";
const text = fs.readFileSync(envPath, "utf8");
const lines = text.split(/\r?\n/);
const idx = lines.findIndex((l) => l.startsWith("DATABASE_URL="));
if (idx < 0) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

let raw = lines[idx].slice("DATABASE_URL=".length).trim();
if (
  (raw.startsWith('"') && raw.endsWith('"')) ||
  (raw.startsWith("'") && raw.endsWith("'"))
) {
  raw = raw.slice(1, -1);
}

let u;
try {
  u = new URL(raw);
} catch (e) {
  console.error("Invalid DATABASE_URL", e.message);
  process.exit(1);
}

const current = u.password;
const isPlaceholder =
  !current ||
  current === "…" ||
  current === "..." ||
  current === "CHANGE_ME" ||
  current === "password" ||
  current.charCodeAt(0) === 8230;

if (!force && !isPlaceholder && current.length >= 16) {
  console.log("PASSWORD_ALREADY_SET len=", current.length);
  process.exit(0);
}

const pw = crypto.randomBytes(24).toString("base64url");
const next = `postgresql://${encodeURIComponent(u.username)}:${encodeURIComponent(pw)}@${u.hostname}:${u.port || "5432"}${u.pathname}`;
lines[idx] = `DATABASE_URL=${next}`;
fs.writeFileSync(envPath, lines.join("\n"), "utf8");
console.log(
  force ? "PASSWORD_ROTATED" : "PASSWORD_SET",
  "len=",
  pw.length,
  "host=",
  u.hostname,
  "db=",
  u.pathname.slice(1)
);
