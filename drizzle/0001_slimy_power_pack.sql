DROP INDEX `batch_file_identity`;--> statement-breakpoint
ALTER TABLE `batches` ADD `scope_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `batch_file_identity` ON `batches` (`owner_id`,`hash`,`province`,`year`,`scope_key`);--> statement-breakpoint
ALTER TABLE `records` ADD `region` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `sect` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `record_scope` ON `records` (`owner_id`,`region`,`sect`,`province`,`year`);