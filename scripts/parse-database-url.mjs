import fs from "fs";

const line = fs
  .readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));

if (!line) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

let raw = line.slice("DATABASE_URL=".length).trim();
if (
  (raw.startsWith('"') && raw.endsWith('"')) ||
  (raw.startsWith("'") && raw.endsWith("'"))
) {
  raw = raw.slice(1, -1);
}

console.log("rawLen", raw.length);
console.log("hasQuotes", false);
console.log("atCount", (raw.match(/@/g) || []).length);

const m = raw.match(/^postgresql:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/([^?]+)/);
if (!m) {
  console.log("REGEX_FAIL");
  // Show structure without secrets: replace password area
  const masked = raw.replace(/:\/\/([^:]+):.+@/, "://$1:***@");
  console.log("masked", masked);
  process.exit(1);
}

const pass = m[2];
console.log("user", m[1]);
console.log("passLen", pass.length);
console.log("host", m[3]);
console.log("port", m[4]);
console.log("db", m[5]);
console.log("passHasPct", /%/.test(pass));
try {
  console.log("decodedPassLen", decodeURIComponent(pass).length);
} catch (e) {
  console.log("decodeError", String(e));
}

// Also try URL parser
try {
  const u = new URL(raw);
  console.log("urlUser", u.username);
  console.log("urlPassLen", u.password.length);
  console.log("urlDecodedPassLen", decodeURIComponent(u.password).length);
  console.log("urlHost", u.hostname);
  console.log("urlDb", u.pathname.slice(1));
} catch (e) {
  console.log("urlParseError", String(e));
}
