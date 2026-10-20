CREATE TABLE `retained_exam_statistics` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`year` integer NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`province` text NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`sect` text DEFAULT '' NOT NULL,
	`temple` text DEFAULT '' NOT NULL,
	`sent` integer,
	`absent` integer,
	`retained` integer,
	`passed` integer,
	`failed` integer,
	`other` integer,
	`note` text DEFAULT '' NOT NULL,
	`source_file` text NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`source_end_row` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retained_stats_origin` ON `retained_exam_statistics` (`batch_id`,`source_sheet`,`source_row`);--> statement-breakpoint
CREATE INDEX `retained_stats_scope` ON `retained_exam_statistics` (`owner_id`,`year`,`province`,`category`,`level`);--> statement-breakpoint
CREATE TABLE `statistics_sources` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parser_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`issues` text DEFAULT '[]' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `statistics_sources_owner` ON `statistics_sources` (`owner_id`,`status`);