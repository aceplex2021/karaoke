#!/bin/sh
set -eu

# Install yt-dlp + ffmpeg (for merging audio/video into mp4)
apk add --no-cache yt-dlp ffmpeg >/dev/null

# Keep container alive (we will exec /config/run.sh manually)
sleep infinity
