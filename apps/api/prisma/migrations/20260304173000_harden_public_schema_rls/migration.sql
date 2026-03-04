-- Harden Supabase PostgREST exposure for deployments that use the API backend as the only access layer.
-- This migration is idempotent and safe when anon/authenticated roles do not exist.

DO $$
DECLARE
    role_name text;
    table_rec record;
BEGIN
    -- Block direct PostgREST access for client-facing roles on public schema objects.
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', role_name);
            EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
            EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
            EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);

            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
        END IF;
    END LOOP;

    -- Ensure every table in public has RLS enabled to satisfy Supabase security linter.
    FOR table_rec IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND pg_get_userbyid(c.relowner) = current_user
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
            table_rec.schema_name,
            table_rec.table_name
        );
    END LOOP;
END
$$;
