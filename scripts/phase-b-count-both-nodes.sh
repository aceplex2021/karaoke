#!/bin/bash
# Run on a host that can pct to the given CT
CT="${1:?ct}"
echo "=== CT $CT on $(hostname) ==="
pct exec "$CT" -- su - postgres -c "psql -d karaoke -Atc \"SELECT pg_is_in_recovery(), inet_server_addr(), count(*) FROM kara_rooms\""
pct exec "$CT" -- su - postgres -c "psql -d karaoke -c \"SELECT room_code, room_name, is_active, created_at FROM kara_rooms ORDER BY created_at DESC NULLS LAST LIMIT 8\""
