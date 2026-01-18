#!/bin/sh
set -eu

SOURCES_FILE="${SOURCES_FILE:-/config/sources.txt}"
OUT_DIR="${OUT_DIR:-/karaoke/videos}"
ARCHIVE_FILE="${ARCHIVE_FILE:-/state/ytdlp-archive.txt}"
LOG_DIR="${LOG_DIR:-/logs}"

mkdir -p "$OUT_DIR" "$(dirname "$ARCHIVE_FILE")" "$LOG_DIR"
: > "$ARCHIVE_FILE"

STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/run_$STAMP.log"

echo "=== yt-dlp run: $STAMP ===" | tee -a "$LOG_FILE"
echo "Sources: $SOURCES_FILE" | tee -a "$LOG_FILE"
echo "Output:  $OUT_DIR" | tee -a "$LOG_FILE"
echo "Archive: $ARCHIVE_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Build a temporary URL list without comments/blank lines
URLS_TMP="/tmp/ytdlp_urls.txt"
grep -v '^\s*#' "$SOURCES_FILE" | sed '/^\s*$/d' > "$URLS_TMP"

COUNT="$(wc -l < "$URLS_TMP" | tr -d ' ')"
echo "URL count: $COUNT" | tee -a "$LOG_FILE"

if [ "$COUNT" -eq 0 ]; then
  echo "No URLs found. Exiting." | tee -a "$LOG_FILE"
  exit 0
fi

# Common filters (karaoke intent + quality control)
# - avoids shorts/clips
# - avoids junk keywords
# You can tune these later.
MATCH_FILTER='karaoke|beat|instrumental|no vocal|minus one|MR|KTV|卡拉OK|伴奏|노래방|karaoké'
REJECT_FILTER='reaction|live|cover|challenge|shorts|tiktok|dance|vlog|tutorial|how to'

# Run yt-dlp
yt-dlp \
  --extractor-args "youtube:player_client=web" \
  --sleep-interval 3 --max-sleep-interval 8 \
  --ignore-errors \
  --no-abort-on-error \
  --newline \
  --download-archive "$ARCHIVE_FILE" \
  --output "$OUT_DIR/%(title)s [%(id)s].%(ext)s" \
  --format "bv*+ba/b" \
  --merge-output-format mp4 \
  --no-playlist-reverse \
  --yes-playlist \
  --dateafter now-365days \
  --match-title "(?i)($MATCH_FILTER)" \
  --reject-title "(?i)($REJECT_FILTER)" \
  --add-metadata \
  --embed-thumbnail \
  --embed-chapters \
  --console-title \
  --batch-file "$URLS_TMP" \
  2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== done: $STAMP ===" | tee -a "$LOG_FILE"
