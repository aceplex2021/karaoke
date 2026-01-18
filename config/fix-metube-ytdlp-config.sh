#!/bin/bash
# fix-metube-ytdlp-config.sh
# Fix MeTube yt-dlp config to use android/web clients instead of web_safari

CONTAINER="ix-metube-metube-1"
CONFIG_ENV_VAR="YOUTUBE_DL_CONFIG"

echo "🔧 Fixing MeTube yt-dlp Configuration"
echo ""

# Get current config
CURRENT_CONFIG=$(docker exec "$CONTAINER" printenv "$CONFIG_ENV_VAR" 2>/dev/null)

if [[ -z "$CURRENT_CONFIG" ]]; then
  echo "❌ Could not find YOUTUBE_DL_CONFIG environment variable"
  echo "   Trying alternative method..."
  
  # Check if it's in docker-compose or container env
  docker inspect "$CONTAINER" | grep -i "youtube\|ytdlp" | head -10
  exit 1
fi

echo "📋 Current config:"
echo "$CURRENT_CONFIG" | python3 -m json.tool 2>/dev/null || echo "$CURRENT_CONFIG"
echo ""

# Fix the player_client
FIXED_CONFIG=$(echo "$CURRENT_CONFIG" | python3 -c "
import json
import sys

try:
    config = json.load(sys.stdin)
    # Change player_client from web_safari to android,web
    if 'extractor_args' in config and 'youtube' in config['extractor_args']:
        config['extractor_args']['youtube']['player_client'] = ['android', 'web']
        print(json.dumps(config, separators=(',', ':')))
    else:
        print('ERROR: Could not find extractor_args.youtube.player_client', file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
")

if [[ $? -ne 0 ]]; then
  echo "❌ Failed to parse/fix config"
  exit 1
fi

echo "✅ Fixed config:"
echo "$FIXED_CONFIG" | python3 -m json.tool
echo ""

# Instructions for user
echo "📝 To apply this fix:"
echo ""
echo "1. Stop MeTube container:"
echo "   docker stop $CONTAINER"
echo ""
echo "2. Update the YOUTUBE_DL_CONFIG environment variable in TrueNAS:"
echo "   - Go to Apps → MeTube → Edit"
echo "   - Find 'YOUTUBE_DL_CONFIG' environment variable"
echo "   - Replace the value with:"
echo ""
echo "$FIXED_CONFIG" | python3 -m json.tool
echo ""
echo "3. Or if using docker-compose, update the env file"
echo ""
echo "4. Restart container:"
echo "   docker start $CONTAINER"
echo ""
