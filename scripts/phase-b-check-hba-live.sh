#!/bin/bash
set -e
echo "=== DCS show-config pg_hba ==="
pct exec 113 -- bash -lc 'patronictl -c /etc/patroni/patroni.yml show-config' | sed -n '/pg_hba:/,/^[a-z]/p' | head -40
echo "=== live pg_hba.conf ==="
pct exec 113 -- bash -lc 'grep -E "^(host|local)" /var/lib/postgresql/data/pg_hba.conf'
echo "=== trading connect via VIP ==="
pct exec 113 -- bash -lc "su - postgres -c \"psql -d trading -Atc 'SELECT current_database()'\""
echo "=== karaoke connect ==="
pct exec 113 -- bash -lc "su - postgres -c \"psql -d karaoke -Atc 'SELECT current_database()'\""
