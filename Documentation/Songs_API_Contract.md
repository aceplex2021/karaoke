📌 Cursor Instruction — Build Songs API Contract (Webapp Backend)
Context

You are working inside an existing webapp backend (Express / Node) that already:

Uses Supabase

Has room + queue logic

Serves a TV + phone karaoke UI

Plays media via an existing HTTP media server (already wired)

DO NOT implement ingestion, filesystem scanning, or media indexing.
DO NOT touch /Incoming or /Videos directly.

All data comes from Supabase tables populated by an external ingestion pipeline.

🎯 Goal

Implement read-only, group-aware karaoke song search + version selection APIs that:

Are accent-insensitive

Respect song grouping

Support version selection (tone/style/pitch)

Return a ready-to-play media URL

These APIs will be consumed by both TV and phone UI.

📦 Data Model (Supabase — READ ONLY)

Use these tables only:

kara_songs

kara_song_groups

kara_song_group_members

kara_versions

kara_files

Do not modify schemas.

Assumptions:

kara_files.storage_path is flat and relative (e.g. "Karaoke NẾU XA NHAU.mp4")

Media server URL is derived from storage_path

🔌 API Endpoints to Implement
1️⃣ Search Songs (Group-Aware)

GET /api/songs/search?q=<query>&limit=30

Behavior

Accent-insensitive search using normalized fields (*_norm)

Search against song groups, not raw files

One result per logical song group

Response shape
{
  query: string,
  results: Array<{
    group_id: string,
    display_title: string,
    normalized_title: string,
    artists: string[],

    best_version: {
      version_id: string,
      tone: "nam" | "nu" | null,
      pitch: string | null,
      styles: string[],
      file: {
        file_id: string,
        storage_path: string,
        play_url: string
      }
    },

    available: {
      version_count: number,
      tones: string[],
      styles: string[]
    }
  }>
}

Notes

best_version is chosen server-side (see rules below)

play_url is built from storage_path (no file system access)

2️⃣ List Versions for a Song Group

GET /api/songs/group/:groupId/versions

Behavior

Return all selectable versions for that song group

No deduping in UI — backend handles it

Response shape
{
  group_id: string,
  title: string,
  versions: Array<{
    version_id: string,
    tone: string | null,
    pitch: string | null,
    styles: string[],
    duration_s: number | null,
    file: {
      file_id: string,
      storage_path: string,
      play_url: string
    }
  }>
}

🧠 Version Selection Rules (Server-Side)

When choosing best_version in search results:

Priority:

Prefer tone = "nam" if available

Prefer non-remix over remix

Prefer standard karaoke over medley / liên khúc

Stable fallback: lowest version_id (or earliest created)

These rules must live in backend logic, not UI.

🌐 Playback URL Rules

Base media URL is configurable (env var), e.g.:

MEDIA_BASE_URL=http://media-server/Videos


play_url = MEDIA_BASE_URL + "/" + encodeURIComponent(storage_path)

Do not assume cloud storage or signed URLs yet

🚫 Explicit Non-Goals (Do NOT Implement)

No filesystem scanning

No ingestion logic

No grouping logic creation

No queue logic

No auth

No writes to Supabase

No UI changes

This is pure read-only backend API.

✅ Success Criteria

UI can search once and get clean, grouped results

UI does not need to dedupe, rank, or normalize titles

Same API works for phone, TV, and future voice search

No overlap with ingestion pipeline