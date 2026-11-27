/**
 * Bootstrap karaoke DB on current Patroni LEADER, then apply schema.
 * Leader: pg-d LXC 113 on pvetos (10.0.29.96). Also patches hba on standby pg-b.
 */
import { spawnSync } from "child_process";
import "dotenv/config";

const PRIMARY = {
  host: process.env.PG_PRIMARY_PVE || "root@10.0.29.96",
  ct: process.env.PG_PRIMARY_CT || "113",
};
const STANDBY = {
  host: process.env.PG_STANDBY_PVE || "root@10.0.19.210",
  ct: process.env.PG_STANDBY_CT || "1003",
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const u = new URL(url);
const pw = decodeURIComponent(u.password);
if (!pw || pw.length < 8 || pw === "…") {
  console.error("DATABASE_URL password still placeholder/too short");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]+$/.test(pw)) {
  console.error("Password has unsafe shell chars; regenerate with fix script");
  process.exit(1);
}

function run(cmd, args) {
  const safe = args.map((a) => (String(a).includes(pw) ? "<redacted>" : a));
  console.log("+", cmd, safe.join(" "));
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`${cmd} failed: ${r.status}`);
  }
  return r;
}

function ssh(target, remoteCmd) {
  return run("ssh", ["-o", "BatchMode=yes", target, remoteCmd]);
}

function scp(local, remote) {
  return run("scp", ["-o", "BatchMode=yes", local, remote]);
}

// 1) Primary: create role + DB + hba
scp(
  "scripts/phase-b-setup-inside-pg.py",
  `${PRIMARY.host}:/tmp/phase-b-setup-inside-pg.py`
);
ssh(
  PRIMARY.host,
  [
    `pct push ${PRIMARY.ct} /tmp/phase-b-setup-inside-pg.py /tmp/phase-b-setup-inside-pg.py`,
    `&& pct exec ${PRIMARY.ct} -- env PW='${pw}' python3 /tmp/phase-b-setup-inside-pg.py`,
  ].join(" ")
);
console.log("BOOTSTRAP_ROLE_DB_OK");

// 2) Standby hba so failover still accepts kara_app
scp("scripts/phase-b-patch-hba.py", `${STANDBY.host}:/tmp/phase-b-patch-hba.py`);
ssh(
  STANDBY.host,
  [
    `pct push ${STANDBY.ct} /tmp/phase-b-patch-hba.py /tmp/phase-b-patch-hba.py`,
    `&& pct exec ${STANDBY.ct} -- python3 /tmp/phase-b-patch-hba.py`,
  ].join(" ")
);
console.log("STANDBY_HBA_OK");

// 3) Apply schema on primary
scp("database/phase_b_schema.sql", `${PRIMARY.host}:/tmp/phase_b_schema.sql`);
ssh(
  PRIMARY.host,
  [
    `pct push ${PRIMARY.ct} /tmp/phase_b_schema.sql /tmp/phase_b_schema.sql`,
    `&& pct exec ${PRIMARY.ct} -- chmod 644 /tmp/phase_b_schema.sql`,
    `&& pct exec ${PRIMARY.ct} -- su - postgres -c "psql -d karaoke -v ON_ERROR_STOP=1 -f /tmp/phase_b_schema.sql"`,
  ].join(" ")
);
console.log("SCHEMA_APPLY_OK");
