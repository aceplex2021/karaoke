#!/bin/bash
# find-metube-config.sh
# Find MeTube configuration directory and yt-dlp settings

CONTAINER="ix-metube-metube-1"

echo "🔍 Finding MeTube Configuration..."
echo ""

# Check common config locations
echo "1. Checking /config directory:"
docker exec "$CONTAINER" ls -la /config 2>/dev/null || echo "   /config not found"

echo ""
echo "2. Checking /app directory:"
docker exec "$CONTAINER" ls -la /app 2>/dev/null | head -20 || echo "   /app not found"

echo ""
echo "3. Checking for yt-dlp config files:"
docker exec "$CONTAINER" find /config /app -name "*ytdlp*" -o -name "*yt-dlp*" -o -name "*.conf" -o -name "*.txt" 2>/dev/null | grep -v ".pyc" | head -20

echo ""
echo "4. Checking environment variables:"
docker exec "$CONTAINER" env | grep -i "ytdlp\|config\|download" | head -10

echo ""
echo "5. Checking MeTube process arguments:"
docker exec "$CONTAINER" ps aux | grep -i "ytdlp\|metube" | head -5

echo ""
echo "6. Checking mounted volumes:"
docker inspect "$CONTAINER" | grep -A 10 "Mounts" | head -30
