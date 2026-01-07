🎤 Karaoke System — Authoritative Project Summary
1. System Architecture (LOCK THIS IN)

The system is intentionally split into three layers. This separation is correct and must not change.

A. Media Layer (KEEP — STABLE ✅)

HTTP media server serves .mp4 karaoke files

Browser/TV plays media directly via URL

No streaming logic, no transcoding

Filesystem = source of truth for media

Media server is reliable and complete

B. Backend Authority Layer (KEEP ✅)

Supabase = single system of record

Backend owns all playback decisions

Frontend never decides what plays next

All playback transitions are atomic + idempotent

Database invariants enforce correctness

C. Web App (REBUILD UI ONLY 🔁)

Concepts are correct

Current UI/state logic is fragile

Stop patching → rebuild frontend cleanly

Backend + DB logic stays authoritative

2. Node Controller (KEEP COMPLETELY — DO NOT TOUCH ✅)

Purpose (final scope):

Watches /Videos (and subfolders)

Indexes & normalizes karaoke files

Extracts metadata from filenames

Inserts/updates kara_songs

Handles deduplication

Explicitly does NOT:

Control playback

Manage queues

Interact with frontend state

Status:
✔ Stable
✔ Finished
✔ Correct boundary

👉 Cursor must not modify Node Controller

3. Supabase Schema (KEEP — PHASE B FINAL ✅)
Core Tables (Authoritative)

kara_users

kara_songs

kara_rooms

kara_queue

kara_song_history

kara_room_participants

Critical Invariants (NON-NEGOTIABLE)

Exactly one playing entry per room

Enforced via partial unique index on kara_queue(room_id) WHERE status='playing'

kara_rooms.current_entry_id always points to the playing entry

Playback transitions are atomic

Backend is playback authority

Queue fairness via last_singer_id

Database Functions (FINAL CONTRACTS)

start_playback(...)

transition_playback(...)

Advisory lock per room

👉 Treat DB functions as immutable contracts

4. Backend QueueManager (KEEP INTENT, SIMPLIFY USAGE ✅)
What Is Correct (KEEP)

Backend owns queue + playback

ensurePlaying() self-healing model

Round-robin fairness

Host override support

Idempotent endpoints

Backend auto-starts next song

Intentional Simplification (KEEP THIS)

Queue insertion = append only

No per-user positional math

Fairness handled at selection time, not insert time

👉 QueueManager logic is sound
👉 Do not reinvent queue mechanics

5. TV Mode (MOSTLY KEEP ✅)
Correct Design (KEEP)

TV is passive

Subscribes to:

kara_rooms.current_entry_id

kara_queue (display only)

Plays media URL

Reports:

playback ended

playback error

TV Never Does

Decide next song

Modify queue

Override backend state

Minor Cleanup Later

Reduce local state

Remove debugging hacks

Trust realtime + backend authority

6. Web App Frontend (FULL REBUILD 🔥)
Decision

❌ Stop patching
❌ Stop layering logic
✅ Rebuild UI from scratch

KEEP

Supabase schema

Backend endpoints

Realtime subscriptions

Media URLs

Room model

THROW AWAY

Local queue logic

Frontend “what plays next” logic

Mixed authority state handling

Defensive hacks

7. Must-Have Product Requirements (NON-NEGOTIABLE)
UX / Quality Bar

YouTube-grade polish

Fast, clean, intuitive

Zero confusion

Core Features

Instant-feeling song search

Clear add-to-queue feedback

Obvious “Now Singing”

Strong host controls

Mobile-first friendly

Personalization

Remember what users sang before

Recently sung

Top songs

One-tap re-add

User feels recognized every session

Design Philosophy

Frontend = presentation + intent

Backend = truth + enforcement

Database = authority

8. Final Instructions for Cursor (COPY VERBATIM)

Rebuild the web app frontend from scratch.

Keep:

Node controller

Supabase schema

Database functions

Backend QueueManager logic

Backend playback authority

Do NOT:

Add queue logic to frontend

Decide next song in UI

Patch existing UI logic

Goal:

YouTube-grade karaoke experience

Clean separation of concerns

Backend-driven playback

Beautiful, fast, professional UI