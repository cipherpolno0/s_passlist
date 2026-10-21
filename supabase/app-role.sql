-- Run only after approval. Supply app_password through psql's protected input;
-- never commit the password or paste it into a public SQL history.
BEGIN;
CREATE ROLE passlist_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
GRANT CONNECT ON DATABASE postgres TO passlist_app;
GRANT USAGE ON SCHEMA passlist TO passlist_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA passlist TO passlist_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA passlist TO passlist_app;
DO $policies$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='passlist' LOOP
  EXECUTE format('CREATE POLICY app_server_access ON passlist.%I TO passlist_app USING (true) WITH CHECK (true)',t.tablename);
 END LOOP;
END $policies$;
COMMIT;
