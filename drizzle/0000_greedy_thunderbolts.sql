CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_owner` ON `audit` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`province` text NOT NULL,
	`year` integer NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total` integer NOT NULL,
	`valid` integer NOT NULL,
	`issues` integer NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`committed_at` text
);
--> statement-breakpoint
CREATE INDEX `batch_owner_status` ON `batches` (`owner_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `batch_file_identity` ON `batches` (`owner_id`,`hash`,`province`,`year`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`province` text NOT NULL,
	`year` integer NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`dharma_name` text NOT NULL,
	`temple` text NOT NULL,
	`district` text NOT NULL,
	`source_province` text NOT NULL,
	`school` text NOT NULL,
	`note` text NOT NULL,
	`sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`sequence` text NOT NULL,
	`fingerprint` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_filter` ON `records` (`owner_id`,`province`,`year`,`category`,`level`);--> statement-breakpoint
CREATE INDEX `record_batch` ON `records` (`batch_id`);--> statement-breakpoint
CREATE INDEX `record_fingerprint` ON `records` (`owner_id`,`fingerprint`);