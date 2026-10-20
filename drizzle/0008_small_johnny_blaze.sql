ALTER TABLE `batches` ADD `vassa_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `vassa_cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `vassa_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `vassa_lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `vassa_lease_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `vassa_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `records` ADD `vassa` integer;