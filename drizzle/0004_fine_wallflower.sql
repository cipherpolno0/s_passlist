CREATE TABLE `temple_registry` (
	`owner_id` text NOT NULL,
	`dataset_version` text NOT NULL,
	`source_row` integer NOT NULL,
	`source_order` integer NOT NULL,
	`name` text NOT NULL,
	`temple_type` text NOT NULL,
	`sect` text NOT NULL,
	`subdistrict` text NOT NULL,
	`district` text NOT NULL,
	`province` text NOT NULL,
	`name_key` text NOT NULL,
	`subdistrict_key` text NOT NULL,
	`district_key` text NOT NULL,
	`province_key` text NOT NULL,
	PRIMARY KEY(`owner_id`, `dataset_version`, `source_row`)
);
--> statement-breakpoint
CREATE INDEX `temple_registry_name_geo` ON `temple_registry` (`owner_id`,`dataset_version`,`name_key`,`province_key`,`district_key`,`subdistrict_key`);--> statement-breakpoint
CREATE TABLE `temple_registry_meta` (
	`owner_id` text NOT NULL,
	`dataset_version` text NOT NULL,
	`source_filename` text NOT NULL,
	`source_hash` text NOT NULL,
	`rows_total` integer NOT NULL,
	`status` text DEFAULT 'loading' NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`imported_at` text,
	PRIMARY KEY(`owner_id`, `dataset_version`)
);
