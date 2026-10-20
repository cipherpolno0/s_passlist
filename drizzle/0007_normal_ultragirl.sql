ALTER TABLE `batches` ADD `age_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `age_cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `age_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `age_lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `age_lease_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `age_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `birth_year` integer;--> statement-breakpoint
ALTER TABLE `records` ADD `age_at_exam` integer;--> statement-breakpoint
ALTER TABLE `records` ADD `birth_year_estimated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `age_estimated` integer DEFAULT 0 NOT NULL;