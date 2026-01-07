🎤 Karaoke System — Node Controller + Supabase (AUTHORITATIVE SUMMARY)
Scope of This System

This system is complete and frozen.
The webapp must consume it, not re-implement or replace any part of it.

What this system does:

Deterministic media ingestion

Canonical media storage

Metadata extraction & persistence

Integrity verification & auditing

What this system does NOT do:

UI

Search ranking UX

Queue/room logic

Playback UI

Auth

1️⃣ Node Controller (karaoke-node)
Purpose

Acts as a deterministic ingestion and promotion engine between raw downloads and canonical media.

2️⃣ Filesystem Contract (STRICT)
/Videos/Incoming — Staging (Messy, Transient)

MeTube downloads here

Subfolders allowed (playlists/channels)

Files may be incomplete / growing

NOT used for playback

NOT referenced by webapp

/Videos — Canonical Library (Clean, Permanent)

Flat directory (no subfolders)

Append-only

One file per promoted version

All files are hardlinks from /Incoming

Only directory the webapp may play from

3️⃣ Promotion Logic (Locked)
Discovery

Recursively scans /Videos/Incoming/**

Detects video files by extension

Works with playlist subfolders

Safety

Waits for file size to stabilize before promotion

Per-file promotion (not batch)

Canonical Naming

Normalized, accent-safe filename

Tone / style encoded in filename suffix

Illegal characters removed

Deterministic naming

Hardlinking

Creates hardlinks into /Videos

If canonical name already exists:

Same inode → treated as duplicate

Different inode → collision resolved via deterministic hash suffix

Canonical library always remains flat

Guarantees

No data loss

No duplicate storage

No subfolders in canonical library

4️⃣ Scan Modes
scan

Recursively scans /Videos or /Incoming

Used for backfill / verification

Can run with WRITE_DB=false (dry run)

watch

Live monitoring of /Incoming

Promotes files as they complete

promote

Manual batch promotion

Safe to run anytime

5️⃣ Supabase Data Model (READ-ONLY FOR WEBAPP)
Tables (Stable)
kara_songs

One logical song

Accent-insensitive normalized title fields

Language code

kara_song_groups

Groups songs that share the same base title

Used for clean search results

kara_song_group_members

Song ↔ group mapping

kara_versions

Represents tone/style variants

Example: nam / nu / bolero / tram / remix

kara_files

One row per canonical media file

References flat /Videos/*.mp4

storage_path is relative, flat

Source of truth for playback

6️⃣ DB Write Rules (IMPORTANT)

DB rows are written only after hardlink promotion succeeds

DB rows never reference /Incoming

Webapp must treat Supabase as read-only

No UI logic should infer files from filesystem

7️⃣ Integrity & Auditing (Already in Place)
Weekly Healthcheck

/Videos/*.mp4 count vs kara_files

Detects missing-on-disk rows

Logs only (no auto-fix)

Monthly Orphan Report

DB-only orphans

FS-only orphans

Path drift detection

Logs only

Result:
Supabase and filesystem parity is enforced continuously.

8️⃣ What the Webapp MUST Do
Allowed

Query Supabase tables

Use kara_files.storage_path to build playback URLs

Build search, UI, queue logic on top

Treat /Videos as immutable media source

Forbidden (DO NOT IMPLEMENT)

No filesystem scanning

No ingestion logic

No promotion logic

No filename parsing

No grouping heuristics

No metadata inference

No writes to kara_* tables

9️⃣ Playback Contract

Media is served via HTTP media server

Playback URL is derived as:

PLAY_URL = MEDIA_BASE_URL + "/" + encodeURIComponent(kara_files.storage_path)


Webapp does not care where files live physically

🔒 System Status
Node Controller

✅ Complete
✅ Stable
✅ Handles playlist subfolders correctly
✅ Deterministic
✅ Frozen

Supabase Metadata

✅ Complete
✅ Normalized
✅ Group-aware
✅ Audited
✅ Read-only for UI

🧠 Mental Model (For Webapp)

“Supabase is the truth.
/Videos is the media.
Everything else is presentation.”

🎯 What Cursor Should Build Next

Group-aware search API (read-only)

Version selection UI

Queue / room logic

TV + phone UX

Playback controls

WITHOUT touching ingestion or storage logic.