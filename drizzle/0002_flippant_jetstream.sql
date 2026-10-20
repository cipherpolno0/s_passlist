ALTER TABLE `batches` ADD `visibility` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
CREATE INDEX `batch_public` ON `batches` (`visibility`,`status`);--> statement-breakpoint
ALTER TABLE `records` ADD `jurisdiction` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `school_kind` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `record_school` ON `records` (`jurisdiction`,`school_kind`,`school`);