CREATE TABLE `exam_statistics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`year` integer NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`province` text NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`sect` text DEFAULT '' NOT NULL,
	`temple` text DEFAULT '' NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`absent` integer DEFAULT 0 NOT NULL,
	`retained` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`other` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source_file` text NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_stats_scope` ON `exam_statistics` (`owner_id`,`year`,`region`,`province`,`category`,`level`,`sect`,`temple`);--> statement-breakpoint
CREATE INDEX `exam_stats_filters` ON `exam_statistics` (`owner_id`,`year`,`category`,`level`,`region`,`province`);