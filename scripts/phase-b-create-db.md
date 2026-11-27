# Phase B — Create local `karaoke` database

## Topology (current)

| Role | Host | CT | IP |
|------|------|----|----|
| Patroni **leader** (writes) | pvetos `10.0.29.96` | 113 `pg-d` | `10.0.29.240` |
| Sync standby | pve `10.0.19.210` | 1003 `Postgres` | `10.0.19.233` |
| App VIP | HAProxy | — | `10.0.29.95:5432` |

Confirm leader: `patronictl -c /etc/patroni/patroni.yml list` on either node.

## Bootstrap (from karaoke repo)

```bash
# 1) Set a real password in .env (not a placeholder ellipsis)
node scripts/fix-database-url-password.mjs --force

# 2) Create role + DB on leader, patch standby hba, apply schema
node scripts/phase-b-bootstrap-remote.mjs

# 3) Persist full pg_hba in Patroni DCS (trading + replication + karaoke)
#    scp scripts/phase-b-fix-patroni-hba.sh to pvetos and:
#    bash phase-b-fix-patroni-hba.sh 113

# 4) Verify
node scripts/verify-database-url.mjs
node scripts/phase-b-smoke.mjs
```

## Cron (both Proxmox hosts)

```bash
# pvetos (pg-d)
bash scripts/phase-b-install-cron.sh 113

# pve (pg-b)
bash scripts/phase-b-install-cron.sh 1003
```

Only the current primary executes maintenance (`pg_is_in_recovery` guard).

## App env (kara2)

```text
DATABASE_URL=postgresql://kara_app:<pass>@10.0.29.95:5432/karaoke
```

Redeploy compose after setting `.env`. Unset `DATABASE_URL` to roll back to Supabase.

## Data copy from Supabase (cutover)

Dump catalog + users/history from Supabase; restore into `karaoke`. Cold-cut live rooms is OK.

## Rollback

Unset `DATABASE_URL` on kara2 and redeploy (falls back to Supabase service role).
