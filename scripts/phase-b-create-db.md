# Phase B — Create local `karaoke` database

## On Patroni primary (or via VIP as superuser)

```bash
# 1) Create role + DB (edit password first in SQL file)
psql -h 10.0.29.95 -U postgres -f database/phase_b_bootstrap.sql

# 2) Apply schema + functions
psql -h 10.0.29.95 -U kara_app -d karaoke -f database/phase_b_schema.sql

# 3) pg_hba.conf — allow kara_app from kara2 LAN, then reload
# host karaoke kara_app 10.0.19.0/24 scram-sha-256
# host karaoke kara_app 10.0.29.0/24 scram-sha-256

# 4) kara2 .env
# DATABASE_URL=postgresql://kara_app:PASSWORD@10.0.29.95:5432/karaoke

# 5) Redeploy kara2 compose; smoke create room / TV / queue
```

## Data copy from Supabase (cutover)

```bash
# Dump selected tables from Supabase, restore into karaoke
# Prefer logical dump of catalog + users/history; cold-cut live rooms OK
```

## Rollback

Unset `DATABASE_URL` on kara2 and redeploy (falls back to Supabase service role).
