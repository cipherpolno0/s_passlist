CREATE SCHEMA IF NOT EXISTS passlist;
SET search_path = passlist, pg_catalog;
CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" text NOT NULL
);

CREATE INDEX "audit_owner" ON "audit" ("owner_id","created_at");
CREATE TABLE "batches" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"province" text NOT NULL,
	"year" bigint NOT NULL,
	"filename" text NOT NULL,
	"hash" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total" bigint NOT NULL,
	"valid" bigint NOT NULL,
	"issues" bigint NOT NULL,
	"inserted" bigint DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"created_at" text NOT NULL,
	"committed_at" text
);

CREATE INDEX "batch_owner_status" ON "batches" ("owner_id","status");
CREATE UNIQUE INDEX "batch_file_identity" ON "batches" ("owner_id","hash","province","year");
CREATE TABLE "records" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"province" text NOT NULL,
	"year" bigint NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"title" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"dharma_name" text NOT NULL,
	"temple" text NOT NULL,
	"district" text NOT NULL,
	"source_province" text NOT NULL,
	"school" text NOT NULL,
	"note" text NOT NULL,
	"sheet" text NOT NULL,
	"source_row" bigint NOT NULL,
	"sequence" text NOT NULL,
	"fingerprint" text NOT NULL,
	"updated_at" text,
	FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON UPDATE no action ON DELETE no action
);

CREATE INDEX "record_filter" ON "records" ("owner_id","province","year","category","level");
CREATE INDEX "record_batch" ON "records" ("batch_id");
CREATE INDEX "record_fingerprint" ON "records" ("owner_id","fingerprint");
DROP INDEX "batch_file_identity";
ALTER TABLE "batches" ADD "scope_key" text DEFAULT '' NOT NULL;
CREATE UNIQUE INDEX "batch_file_identity" ON "batches" ("owner_id","hash","province","year","scope_key");
ALTER TABLE "records" ADD "region" text DEFAULT '' NOT NULL;
ALTER TABLE "records" ADD "sect" text DEFAULT '' NOT NULL;
CREATE INDEX "record_scope" ON "records" ("owner_id","region","sect","province","year");
ALTER TABLE "batches" ADD "visibility" text DEFAULT 'internal' NOT NULL;
CREATE INDEX "batch_public" ON "batches" ("visibility","status");
ALTER TABLE "records" ADD "jurisdiction" text DEFAULT '' NOT NULL;
ALTER TABLE "records" ADD "school_kind" text DEFAULT '' NOT NULL;
CREATE INDEX "record_school" ON "records" ("jurisdiction","school_kind","school");
ALTER TABLE "records" ADD "sect_reviewed" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "records" ADD "subdistrict" text DEFAULT '' NOT NULL;
CREATE TABLE "temple_registry" (
	"owner_id" text NOT NULL,
	"dataset_version" text NOT NULL,
	"source_row" bigint NOT NULL,
	"source_order" bigint NOT NULL,
	"name" text NOT NULL,
	"temple_type" text NOT NULL,
	"sect" text NOT NULL,
	"subdistrict" text NOT NULL,
	"district" text NOT NULL,
	"province" text NOT NULL,
	"name_key" text NOT NULL,
	"subdistrict_key" text NOT NULL,
	"district_key" text NOT NULL,
	"province_key" text NOT NULL,
	PRIMARY KEY("owner_id", "dataset_version", "source_row")
);

CREATE INDEX "temple_registry_name_geo" ON "temple_registry" ("owner_id","dataset_version","name_key","province_key","district_key","subdistrict_key");
CREATE TABLE "temple_registry_meta" (
	"owner_id" text NOT NULL,
	"dataset_version" text NOT NULL,
	"source_filename" text NOT NULL,
	"source_hash" text NOT NULL,
	"rows_total" bigint NOT NULL,
	"status" text DEFAULT 'loading' NOT NULL,
	"started_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"imported_at" text,
	PRIMARY KEY("owner_id", "dataset_version")
);

CREATE INDEX "audit_record_state" ON "audit" ("owner_id","target_id","created_at","id");
CREATE TABLE "organization_registry" (
	"dataset_version" text NOT NULL,
	"source_row" bigint NOT NULL,
	"source_order" bigint NOT NULL,
	"name" text NOT NULL,
	"subdistrict" text NOT NULL,
	"district" text NOT NULL,
	"province" text NOT NULL,
	"name_key" text NOT NULL,
	"subdistrict_key" text NOT NULL,
	"district_key" text NOT NULL,
	"province_key" text NOT NULL,
	PRIMARY KEY("dataset_version", "source_row")
);

CREATE INDEX "organization_registry_name_geo" ON "organization_registry" ("dataset_version","name_key","province_key","district_key","subdistrict_key");
CREATE TABLE "organization_registry_meta" (
	"dataset_version" text PRIMARY KEY NOT NULL,
	"source_filename" text NOT NULL,
	"source_hash" text NOT NULL,
	"rows_total" bigint NOT NULL,
	"status" text DEFAULT 'loading' NOT NULL,
	"seed_offset" bigint DEFAULT 0 NOT NULL,
	"backfill_status" text DEFAULT 'pending' NOT NULL,
	"cursor" text DEFAULT '' NOT NULL,
	"scanned" bigint DEFAULT 0 NOT NULL,
	"matched" bigint DEFAULT 0 NOT NULL,
	"updated" bigint DEFAULT 0 NOT NULL,
	"ambiguous" bigint DEFAULT 0 NOT NULL,
	"conflicts" bigint DEFAULT 0 NOT NULL,
	"not_found" bigint DEFAULT 0 NOT NULL,
	"incomplete" bigint DEFAULT 0 NOT NULL,
	"lease_token" text DEFAULT '' NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"started_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"imported_at" text,
	"completed_at" text
);

ALTER TABLE "batches" ADD "age_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "batches" ADD "age_cursor" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "age_updated" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "age_lease_until" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "age_lease_token" text DEFAULT '' NOT NULL;
ALTER TABLE "batches" ADD "age_error" text DEFAULT '' NOT NULL;
ALTER TABLE "records" ADD "birth_year" bigint;
ALTER TABLE "records" ADD "age_at_exam" bigint;
ALTER TABLE "records" ADD "birth_year_estimated" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "records" ADD "age_estimated" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "vassa_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "batches" ADD "vassa_cursor" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "vassa_updated" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "vassa_lease_until" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "batches" ADD "vassa_lease_token" text DEFAULT '' NOT NULL;
ALTER TABLE "batches" ADD "vassa_error" text DEFAULT '' NOT NULL;
ALTER TABLE "records" ADD "vassa" bigint;
CREATE TABLE "province_region_meta" (
	"version" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filled" bigint DEFAULT 0 NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"lease_token" text DEFAULT '' NOT NULL,
	"updated_at" text NOT NULL
);

CREATE TABLE "exam_statistics" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"year" bigint NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"province" text NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"sect" text DEFAULT '' NOT NULL,
	"temple" text DEFAULT '' NOT NULL,
	"sent" bigint DEFAULT 0 NOT NULL,
	"absent" bigint DEFAULT 0 NOT NULL,
	"retained" bigint DEFAULT 0 NOT NULL,
	"passed" bigint DEFAULT 0 NOT NULL,
	"failed" bigint DEFAULT 0 NOT NULL,
	"other" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" bigint NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);

CREATE UNIQUE INDEX "exam_stats_scope" ON "exam_statistics" ("owner_id","year","region","province","category","level","sect","temple");
CREATE INDEX "exam_stats_filters" ON "exam_statistics" ("owner_id","year","category","level","region","province");
CREATE TABLE "retained_exam_statistics" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"year" bigint NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"province" text NOT NULL,
	"category" text NOT NULL,
	"level" text NOT NULL,
	"sect" text DEFAULT '' NOT NULL,
	"temple" text DEFAULT '' NOT NULL,
	"sent" bigint,
	"absent" bigint,
	"retained" bigint,
	"passed" bigint,
	"failed" bigint,
	"other" bigint,
	"note" text DEFAULT '' NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" bigint NOT NULL,
	"source_end_row" bigint NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX "retained_stats_origin" ON "retained_exam_statistics" ("batch_id","source_sheet","source_row");
CREATE INDEX "retained_stats_scope" ON "retained_exam_statistics" ("owner_id","year","province","category","level");
CREATE TABLE "statistics_sources" (
	"batch_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"parser_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" bigint DEFAULT 0 NOT NULL,
	"issues" text DEFAULT '[]' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"lease_token" text DEFAULT '' NOT NULL,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX "statistics_sources_owner" ON "statistics_sources" ("owner_id","status");
ALTER TABLE exam_statistics ALTER COLUMN sent DROP NOT NULL, ALTER COLUMN absent DROP NOT NULL, ALTER COLUMN retained DROP NOT NULL, ALTER COLUMN passed DROP NOT NULL, ALTER COLUMN failed DROP NOT NULL, ALTER COLUMN other DROP NOT NULL;
CREATE TABLE source_files(key text PRIMARY KEY,content bytea NOT NULL,content_type text NOT NULL);
CREATE FUNCTION passlist.json_each(input text) RETURNS TABLE(key text,value text) LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
SELECT (n-1)::text, CASE WHEN jsonb_typeof(v) IN ('string','null') THEN v#>>'{}' ELSE v::text END
FROM jsonb_array_elements(CASE WHEN jsonb_typeof(input::jsonb)='array' THEN input::jsonb ELSE '[]'::jsonb END) WITH ORDINALITY AS a(v,n)
UNION ALL
SELECT k, CASE WHEN jsonb_typeof(v) IN ('string','null') THEN v#>>'{}' ELSE v::text END
FROM jsonb_each(CASE WHEN jsonb_typeof(input::jsonb)='object' THEN input::jsonb ELSE '{}'::jsonb END) AS o(k,v);
$fn$;
CREATE FUNCTION passlist.json_extract(input text,path text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
SELECT CASE WHEN left(path,2)='$.' THEN input::jsonb->>substr(path,3) WHEN left(path,2)='$[' THEN input::jsonb->>(substr(path,3,length(path)-3)::integer) END;
$fn$;
CREATE FUNCTION passlist.sequence_number(input text) RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
SELECT COALESCE(substring(ltrim(input) from '^[+-]?[0-9]+(?:[.][0-9]+)?')::double precision,0);
$fn$;
REVOKE ALL ON SCHEMA passlist FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA passlist FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA passlist FROM PUBLIC,anon,authenticated;
DO $rls$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='passlist' LOOP EXECUTE format('ALTER TABLE passlist.%I ENABLE ROW LEVEL SECURITY',t.tablename); END LOOP; END $rls$;
