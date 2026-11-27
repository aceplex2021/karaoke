#!/usr/bin/env python3
"""Run on Patroni PRIMARY as root with PW=... env.
Creates kara_app role + karaoke DB and pg_hba LAN rules.
"""
import os
import subprocess
import sys
import tempfile

pw = os.environ.get("PW")
if not pw:
    print("PW required", file=sys.stderr)
    sys.exit(1)

# Common Patroni / Debian PG paths
HBA_CANDIDATES = [
    "/var/lib/postgresql/data/pg_hba.conf",
    "/etc/postgresql/17/main/pg_hba.conf",
]


def run(cmd, check=True):
    print("+", " ".join(cmd) if isinstance(cmd, list) else cmd)
    return subprocess.run(cmd, check=check)


def psql_file(sql: str, database: str = "postgres"):
    fd, path = tempfile.mkstemp(prefix="kara_", suffix=".sql", dir="/var/tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(sql)
        os.chmod(path, 0o644)
        return run(
            [
                "su",
                "-",
                "postgres",
                "-c",
                f"psql -d {database} -v ON_ERROR_STOP=1 -f {path}",
            ]
        )
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def psql_c(sql: str, database: str = "postgres"):
    return run(
        [
            "su",
            "-",
            "postgres",
            "-c",
            f"psql -d {database} -v ON_ERROR_STOP=1 -c {sql!r}",
        ]
    )


# Refuse to run on standby
rec = subprocess.run(
    ["su", "-", "postgres", "-c", "psql -Atc 'SELECT pg_is_in_recovery()'"],
    capture_output=True,
    text=True,
    check=True,
)
if rec.stdout.strip() == "t":
    print("REFUSING: this node is in recovery (standby). Run on Patroni leader.", file=sys.stderr)
    sys.exit(2)

# --- pg_hba ---
hba_path = next((p for p in HBA_CANDIDATES if os.path.exists(p)), None)
if not hba_path:
    print("WARN: pg_hba.conf not found; skipping hba edit", file=sys.stderr)
else:
    with open(hba_path, "r", encoding="utf-8") as f:
        hba = f.read()

    lines_to_add = []
    for cidr in ("10.0.19.0/24", "10.0.29.0/24"):
        needle = f"kara_app    {cidr}"
        if needle not in hba:
            lines_to_add.append(
                f"host    karaoke    kara_app    {cidr}    scram-sha-256\n"
            )
    if "kara_app    127.0.0.1/32" not in hba:
        lines_to_add.append(
            "host    karaoke    kara_app    127.0.0.1/32    scram-sha-256\n"
        )

    if lines_to_add:
        with open(hba_path, "a", encoding="utf-8") as f:
            f.write("\n# karaoke Phase B\n")
            f.writelines(lines_to_add)
        print("pg_hba updated:", hba_path)
        for line in lines_to_add:
            print(" ", line.strip())
        psql_c("SELECT pg_reload_conf();")
    else:
        print("pg_hba already configured for kara_app:", hba_path)

# --- role ---
escaped = pw.replace("'", "''")
role_sql = f"""
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kara_app') THEN
    CREATE ROLE kara_app LOGIN PASSWORD '{escaped}';
  ELSE
    ALTER ROLE kara_app PASSWORD '{escaped}';
  END IF;
END
$$;
"""
psql_file(role_sql)
print("role kara_app ready")

# --- database ---
exists = subprocess.run(
    [
        "su",
        "-",
        "postgres",
        "-c",
        "psql -tc \"SELECT 1 FROM pg_database WHERE datname='karaoke'\"",
    ],
    capture_output=True,
    text=True,
    check=True,
)
if "1" not in exists.stdout:
    run(["su", "-", "postgres", "-c", "createdb -O kara_app karaoke"])
    print("database karaoke created")
else:
    print("database karaoke already exists")

psql_c("GRANT ALL PRIVILEGES ON DATABASE karaoke TO kara_app;")
psql_file(
    """
GRANT USAGE ON SCHEMA public TO kara_app;
GRANT CREATE ON SCHEMA public TO kara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO kara_app;
""",
    database="karaoke",
)

print("VERIFY")
psql_c("SELECT rolname FROM pg_roles WHERE rolname='kara_app';")
psql_c("SELECT datname FROM pg_database WHERE datname='karaoke';")
print("OK")
