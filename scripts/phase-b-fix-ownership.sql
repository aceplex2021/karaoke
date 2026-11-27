-- Run as postgres on karaoke DB (Patroni primary)
ALTER TABLE kara_song_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE kara_user_preferences DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'kara_%'
  LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO kara_app', r.tablename);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER FUNCTION %I(%s) OWNER TO kara_app', r.proname, r.args);
  END LOOP;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO kara_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO kara_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kara_app;
