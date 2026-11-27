# Phase B — Karaoke DB migration checklist (Supabase → local Patroni)

**Goal:** Run karaoke on the same Postgres infrastructure as trading (`10.0.29.95:5432`), with **no remaining runtime dependency on Supabase** (DB, Realtime, anon/service keys).

**Prerequisite:** Phase A done (sort_key reorder, UP NEXT banner, multi-TV follower sync).

**Related:** Phase A issue doc, TV follower sync issue, trading `Documentation/LOCAL_STORAGE_MIGRATION_PLAN.md` / Patroni runbooks.

**Done when:** Every box in §9 “Definition of done” is checked and Supabase can be decommissioned for karaoke.

---

## 0. Decisions (lock before coding)

- [x] **Target:** new database `karaoke` + role `kara_app` on existing Patroni cluster (HAProxy VIP `10.0.29.95:5432`) — **not** tables inside `trading`
- [x] **Realtime replacement:** A) Postgres `LISTEN/NOTIFY` + Next.js SSE hub (single kara2 instance)
- [x] **Playhead sync (~100ms):** primary POST `/api/realtime/playhead` → SSE fanout (same stream as room events)
- [x] **RPC strategy:** Keep Phase A TS reorder; port/call `advance_playback`, `calculate_round_robin_position`, `set_primary_tv`, `add_connected_tv` via pg admin shim; API for set-primary-tv
- [x] **Dual-run window:** ~3–7 days Supabase rollback possible while `DATABASE_URL` unset
- [x] **kara2** is the only production cutover target: yes

---

## 1. Inventory freeze (source of truth)

Capture **live Supabase** state before writing migration SQL (repo snapshots can drift).

### 1.1 Tables (expect 10 `kara_*`)

- [ ] `kara_languages`
- [ ] `kara_users`
- [ ] `kara_song_groups`
- [ ] `kara_versions`
- [ ] `kara_files`
- [ ] `kara_rooms` (incl. `primary_tv_id`, `connected_tv_ids`, `current_song_started_at`, `expires_at`, …)
- [ ] `kara_queue` (incl. `sort_key`, `position`, YouTube columns, `metadata`)
- [ ] `kara_room_participants`
- [ ] `kara_song_history`
- [ ] `kara_user_preferences`

Dump/check:

- [ ] Row counts per table
- [ ] Indexes / unique / FK / check constraints
- [ ] Extensions used (`pg_trgm` / FTS if any)
- [ ] Confirm **no** Supabase Storage buckets in use
- [ ] Confirm **no** Supabase Auth users required (`fingerprint` identity only)

### 1.2 SQL functions / RPCs to migrate or retire

**Still called from app (must have a local equivalent):**

| Function | Callers | Action |
|----------|---------|--------|
| `advance_playback` | `/api/rooms/.../advance` (+ TS fallback) | [ ] port or delete RPC path |
| `calculate_round_robin_position` | `queue/add`, `queue/add-youtube` | [ ] port |
| `set_primary_tv` | TV + room **browser** `supabase.rpc` | [ ] port **or** move to API-only |
| `add_connected_tv` | `register-tv` | [ ] port |

**Phase A may have made these unused (confirm with grep, then port or drop):**

| Function | Notes |
|----------|-------|
| `host_reorder_queue` | Reorder now via `src/server/lib/queue-order.ts` | [ ] confirm unused → drop or port |
| `user_reorder_queue` | same | [ ] confirm unused → drop or port |
| `rebalance_queue_sort_keys` | optional maintenance | [ ] port if wanted |

**Cron / maintenance (no app `.rpc` today):**

| Function / job | Supabase today | Local replacement |
|----------------|----------------|-------------------|
| `expire_old_rooms` | pg_cron hourly | [ ] system cron / systemd on kara2 or PG host |
| `cleanup_stale_participations` | pg_cron | [ ] same |
| `expire_pending_approvals` | if present in prod | [ ] same |

### 1.3 Client surfaces that must lose Supabase

- [ ] `src/server/lib/supabase.ts` (service role) → `DATABASE_URL` pool
- [ ] `src/lib/supabase.ts` (browser anon) → remove or stub
- [ ] TV/room Realtime `postgres_changes` (`kara_rooms`, `kara_queue`, participants)
- [ ] TV playhead **broadcast** channel `tv-sync-{roomId}` (Phase A follower sync)
- [ ] Browser `supabase.rpc('set_primary_tv')` on TV + room pages
- [ ] Any browser `.from('kara_users')` direct reads
- [ ] Controller ingest (`Controller/supabase.js`, `dbUpsert`, scanners) when `WRITE_DB=true`
- [ ] Scripts (`scripts/index-songs.ts` etc.) if still used
- [ ] Env: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` removed from kara2 compose/CI

### 1.4 Explicitly out of scope

- [ ] Stripe / `tournaments` / `members` edge leftovers — do not migrate
- [ ] Media files — stay on `media.4voice.ai` / `MEDIA_SERVER_URL`
- [ ] Mixing karaoke tables into `trading` database

---

## 2. Infrastructure

- [x] Create role `kara_app` (login, strong password in secret store)
- [x] `CREATE DATABASE karaoke OWNER kara_app;` (or owned by postgres, grant to `kara_app`)
- [x] Grants: CONNECT, USAGE on schema, CRUD on `kara_*`, EXECUTE on needed functions
- [x] `pg_hba`: allow `kara_app` from kara2 subnet (`10.0.19.0/24` and/or `10.0.29.0/24`) via VIP
- [x] Apps connect only via **HAProxy VIP** `10.0.29.95:5432` (not raw primary IP)
- [x] Connectivity test from kara2 LXC: `psql` / Node `pg` smoke query
- [x] Add `karaoke` to TrueNAS / nightly `pg_dump` job (or dedicated dump script + retention)
- [ ] Document restore drill path
- [x] Optional: separate connection pooler limits so karaoke cannot starve trading (`PG_POOL_MAX`)

**Env contract (kara2):**

```text
DATABASE_URL=postgresql://kara_app:<pass>@10.0.29.95:5432/karaoke
# Realtime (example — adjust to chosen design)
KARA_REALTIME_URL=...   # or in-process WS on same Next server
MEDIA_SERVER_URL=https://media.4voice.ai
```

- [ ] Secrets in deploy workflow / host env — never commit

---

## 3. Schema + functions on local PG

- [x] Produce **one** apply script from live dump (prefer `pg_dump --schema-only`) + Phase A deltas
- [x] Apply empty schema to `karaoke`
- [x] Port / create all required functions (§1.2)
- [x] Ensure `advance_playback` orders by **`sort_key`**, sets `current_song_started_at`, uses advisory lock
- [x] Ensure `calculate_round_robin_position` returns sort_key spacing compatible with adds
- [ ] FTS / unaccent / indexes for song search match prod
- [x] Seed `kara_languages` if needed
- [x] Schema verification query checklist (table list, function list, index list) saved in `database/` or runbook

**Repo anchors (may be incomplete vs prod):**

- `database/v5.0_complete_schema.sql`
- `database/v5.1_phase_a_sort_key_tv_sync.sql`
- `database/v4.7.0_sort_key_optimization.sql` (`calculate_round_robin_position`)
- `database/v4.9_cleanup_stale_participations.sql` / room expiry scripts

---

## 4. Application data layer

- [ ] Add DB client module (`pg` Pool or postgres.js) with server-only usage
- [ ] Feature flag / env: `DB_BACKEND=supabase|postgres` **or** hard cutover on branch
- [ ] Migrate all API routes under `src/app/api/**` off `supabaseAdmin`
- [ ] Migrate server libs: `queue.ts`, `media-url-resolver.ts`, `queue-order.ts`
- [ ] Move `set_primary_tv` + any browser DB reads behind API routes
- [x] Controller write path uses `DATABASE_URL`
- [ ] Remove `@supabase/supabase-js` from browser bundle for TV/room (or entire app when unused)
- [ ] Typecheck + build green
- [ ] Docker / kara2 image builds with new env (no required Supabase build args unless leftover)

---

## 5. Realtime replacement (queue + playhead)

Must replace **both**:

| Current | Purpose | Replacement checklist |
|---------|---------|------------------------|
| `postgres_changes` on `kara_rooms` / `kara_queue` / `kara_room_participants` | refetch room state | [ ] notify on change → SSE/WS → client refetch or push payload |
| Broadcast `tv-sync-{roomId}` playhead ~100ms | secondary follower | [ ] primary publishes; secondary seeks; no Supabase channel |

- [ ] Auth/authorization on realtime channel (room membership / tv_id)
- [ ] Fallback if WS drops (short poll) documented
- [ ] Secondary remains view-only (no `/advance`)
- [ ] Load test: 2–4 TVs + several phones, add/remove/reorder feels instant
- [ ] Playhead: secondary within ~100ms under normal LAN (document YT iframe limits)

---

## 6. Cron / maintenance

- [x] `expire_old_rooms` scheduled locally
- [x] `cleanup_stale_participations` scheduled locally
- [ ] Approval expiry if used
- [x] Cron inventory entry (host, schedule, log path) — mirror trading style (`/etc/cron.d/karaoke-phase-b-maintenance` on pve + pvetos; log `/var/log/karaoke-cron.log`)
- [ ] Alert or log on cron failure

---

## 7. Data migration

### 7.1 What to copy

| Data | Migrate? |
|------|----------|
| Catalog (`kara_versions`, `kara_files`, groups, languages) | [x] yes |
| Users / prefs / history | [x] yes |
| Active rooms / live queue | [x] optional — cold cut (rooms deactivated; queue/participants skipped) |
| Completed queue rows | [x] optional / truncate |

### 7.2 Steps

- [x] Maintenance window announced
- [x] Final `pg_dump` / logical copy from Supabase (or table sync tool)
- [x] Restore into local `karaoke`
- [x] Row-count + spot-check checksums (sample IDs)
- [x] Recompute / verify `sort_key` sanity on pending queues if any live rooms migrated
- [ ] Controller can upsert a test song end-to-end on local DB

### 7.3 Dual-run (recommended)

- [x] Local DB writable; Supabase set read-only or app writes only local
- [ ] Keep Supabase dump for rollback for N days: _____
- [x] Rollback procedure written (point `DATABASE_URL` back / redeploy previous image)

---

## 8. Cutover (kara2)

- [x] Checkpoint / git tag before cutover deploy
- [x] Deploy build with `DATABASE_URL` + new Realtime
- [x] Flip DNS/tunnel unchanged (`kara2.4voice.ai`) — only backend env changes
- [ ] Smoke on production URL (see §9)
- [ ] Monitor logs 24–48h (advance races, sync channel, cron)
- [ ] Remove Supabase keys from kara2 env
- [ ] Remove Supabase from CI secrets if unused
- [ ] Cancel Supabase project **only after** dual-run ends

---

## 9. Definition of done / acceptance tests

### 9.1 Runtime independence

- [ ] No `supabase.co` network calls from kara2 app containers in steady state
- [ ] No `NEXT_PUBLIC_SUPABASE_URL` / service role required to boot
- [ ] `grep` / dependency audit: no required runtime `@supabase/supabase-js` (or only dead code removed)

### 9.2 Functional smoke (local DB)

- [ ] Create room / join / QR
- [ ] Search + add local song; add YouTube (commercial mode)
- [ ] Queue reorder up/down (host + user) — order matches TV
- [ ] TV primary plays with audio; secondary muted follower ~100ms
- [ ] Add/remove song appears on all devices/TVs without long poll lag
- [ ] Song end / skip advances once (primary or host only)
- [ ] UP NEXT banner last ~90s with queued next
- [ ] Approval flow (if enabled)
- [ ] Favorites / history
- [ ] Room expiry / stale participant cleanup (manual trigger or wait for cron)
- [ ] Register TV / switch primary — mute + advance authority flip
- [ ] Controller catalog write (if used in prod)

### 9.3 Ops

- [x] Nightly backup includes `karaoke`
- [ ] Restore tested once (even to scratch DB)
- [ ] Runbook updated: connection VIP, role, cron, rollback

### 9.4 Explicit “functions migrated” sign-off

- [ ] Every function in §1.2 marked **ported**, **replaced in TS**, or **retired with grep proof**
- [ ] No dangling `.rpc('...')` pointing at Supabase-only functions
- [ ] pg_cron jobs on Supabase disabled after local cron verified

---

## 10. Phase C (after B — do not block B “done”)

- [ ] Tighten follower sync if YT still drifts beyond 100ms on new channel
- [ ] Final Supabase project teardown / billing cancel
- [ ] Optional: Auth later via `kara_users.auth_user_id` (not required for B)

---

## 11. Effort reminder (planning only)

| Workstream | Ballpark |
|------------|----------|
| Infra + schema + RPC port | 1–1.5 d |
| API/Controller off Supabase | 2–4 d |
| Realtime + playhead channel | 2–3.5 d |
| Data cutover + soak + docs | 1–2 d |
| **Phase B total** | **~6–11 person-days** |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Implementer | | | |
| Reviewer | | | |
| Prod cutover | | | |
