#!/bin/bash
set -e
echo "=== pg-d (113 on 10.0.29.96) recovery ==="
pct exec 113 -- su - postgres -c "psql -Atc 'SELECT pg_is_in_recovery()'"
echo "=== patronictl on pg-d ==="
pct exec 113 -- bash -lc 'for c in /etc/patroni/patroni.yml /etc/patroni.yml /var/lib/postgresql/patroni.yml; do [ -f "$c" ] && echo CONFIG=$c && patronictl -c "$c" list && break; done; ls -la /etc/patroni* 2>/dev/null || true'
