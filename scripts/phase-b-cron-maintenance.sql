-- Run hourly on Patroni (kara_app or postgres) against database karaoke
-- Example crontab on ops host:
-- 15 * * * * psql -h 10.0.29.95 -U kara_app -d karaoke -f /path/to/phase-b-cron-maintenance.sql

SELECT expire_old_rooms();
SELECT cleanup_stale_participations();
