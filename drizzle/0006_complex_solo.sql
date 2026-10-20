CREATE TABLE `organization_registry` (
	`dataset_version` text NOT NULL,
	`source_row` integer NOT NULL,
	`source_order` integer NOT NULL,
	`name` text NOT NULL,
	`subdistrict` text NOT NULL,
	`district` text NOT NULL,
	`province` text NOT NULL,
	`name_key` text NOT NULL,
	`subdistrict_key` text NOT NULL,
	`district_key` text NOT NULL,
	`province_key` text NOT NULL,
	PRIMARY KEY(`dataset_version`, `source_row`)
);
--> statement-breakpoint
CREATE INDEX `organization_registry_name_geo` ON `organization_registry` (`dataset_version`,`name_key`,`province_key`,`district_key`,`subdistrict_key`);--> statement-breakpoint
CREATE TABLE `organization_registry_meta` (
	`dataset_version` text PRIMARY KEY NOT NULL,
	`source_filename` text NOT NULL,
	`source_hash` text NOT NULL,
	`rows_total` integer NOT NULL,
	`status` text DEFAULT 'loading' NOT NULL,
	`seed_offset` integer DEFAULT 0 NOT NULL,
	`backfill_status` text DEFAULT 'pending' NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`scanned` integer DEFAULT 0 NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`ambiguous` integer DEFAULT 0 NOT NULL,
	`conflicts` integer DEFAULT 0 NOT NULL,
	`not_found` integer DEFAULT 0 NOT NULL,
	`incomplete` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`imported_at` text,
	`completed_at` text
);
