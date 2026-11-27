-- Phase B: create karaoke DB + role on Patroni (run as postgres superuser)
-- Example: psql -h 10.0.29.95 -U postgres -f database/phase_b_bootstrap.sql
-- Then apply schema: psql -h 10.0.29.95 -U kara_app -d karaoke -f database/phase_b_schema.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kara_app') THEN
    CREATE ROLE kara_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
END
$$;

SELECT 'CREATE DATABASE karaoke OWNER kara_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'karaoke')\gexec

GRANT CONNECT ON DATABASE karaoke TO kara_app;
