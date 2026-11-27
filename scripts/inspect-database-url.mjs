import fs from "fs";
import "dotenv/config";

function inspect(label, raw) {
  console.log("---", label, "---");
  if (!raw) {
    console.log("missing");
    return;
  }
  const masked = raw.replace(/:\/\/([^:/?#]+):([^@]*)@/, (_, u, p) => {
    const codes = [...p].map((c) => c.charCodeAt(0));
    console.log("user", u);
    console.log("passChars", p.length);
    console.log("passCharCodes", codes.join(","));
    console.log("passIsUrlEncoded", /%[0-9A-Fa-f]{2}/.test(p));
    return `://${u}:***@`;
  });
  console.log("masked", masked);
  console.log("totalLen", raw.length);
  try {
    const u = new URL(raw);
    console.log("URL.user", u.username);
    console.log("URL.passChars", u.password.length);
    console.log("URL.passCodes", [...u.password].map((c) => c.charCodeAt(0)).join(","));
    console.log("URL.host", u.hostname, u.port, u.pathname);
  } catch (e) {
    console.log("URL_ERR", e.message);
  }
}

const fileLine = fs
  .readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
const fileRaw = fileLine
  ? fileLine.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "")
  : null;

inspect("file", fileRaw);
inspect("process.env", process.env.DATABASE_URL);

// Also check .env.local
for (const name of [".env.local", ".env.production", ".env.development"]) {
  if (!fs.existsSync(name)) continue;
  const line = fs
    .readFileSync(name, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (line) {
    inspect(
      name,
      line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "")
    );
  }
}
