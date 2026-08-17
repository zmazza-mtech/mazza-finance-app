CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`simplefin_id` text,
	`institution` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`last_balance` text,
	`last_synced_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`include_in_view` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_type_check" CHECK("accounts"."type" IN ('checking', 'savings', 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_accounts_household_simplefin` ON `accounts` (`household_id`,`simplefin_id`);--> statement-breakpoint
CREATE INDEX `idx_accounts_household` ON `accounts` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_role_check" CHECK("household_memberships"."role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_membership_household_user` ON `household_memberships` (`household_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `household_settings` (
	`household_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_household_setting` ON `household_settings` (`household_id`,`key`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recurring_transaction_id` text NOT NULL,
	`original_date` text NOT NULL,
	`override_type` text NOT NULL,
	`override_date` text,
	`override_amount` text,
	`override_name` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_transaction_id`) REFERENCES `recurring_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "override_type_check" CHECK("recurring_overrides"."override_type" IN ('modified', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `idx_overrides_recurring` ON `recurring_overrides` (`recurring_transaction_id`);--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` text NOT NULL,
	`frequency` text NOT NULL,
	`next_date` text NOT NULL,
	`end_date` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`category` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_frequency_check" CHECK("recurring_transactions"."frequency" IN ('weekly', 'biweekly', 'monthly', 'yearly')),
	CONSTRAINT "recurring_source_check" CHECK("recurring_transactions"."source" IN ('auto_detected', 'manual')),
	CONSTRAINT "recurring_status_check" CHECK("recurring_transactions"."status" IN ('active', 'disabled', 'pending_review', 'ended'))
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_account` ON `recurring_transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_recurring_household` ON `recurring_transactions` (`household_id`);--> statement-breakpoint
CREATE TABLE `simplefin_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`encrypted_access_url` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`rotated_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `simplefin_connections_household_id_unique` ON `simplefin_connections` (`household_id`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`accounts_synced` integer DEFAULT 0,
	`transactions_fetched` integer DEFAULT 0,
	`transactions_reconciled` integer DEFAULT 0,
	`error_code` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sync_log_household_started` ON `sync_log` (`household_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`simplefin_id` text,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`category` text,
	`category_source` text DEFAULT 'auto' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" IN ('actual', 'manual')),
	CONSTRAINT "transactions_status_check" CHECK("transactions"."status" IN ('posted', 'pending')),
	CONSTRAINT "transactions_category_source_check" CHECK("transactions"."category_source" IN ('auto', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_transactions_household_simplefin` ON `transactions` (`household_id`,`simplefin_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_household` ON `transactions` (`household_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_setting` ON `user_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);