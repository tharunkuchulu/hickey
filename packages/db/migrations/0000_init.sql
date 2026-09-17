CREATE TABLE `addon_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`min_select` integer DEFAULT 0 NOT NULL,
	`max_select` integer DEFAULT 10 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `addons` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `addon_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `addons_group_idx` ON `addons` (`group_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `cash_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`business_date` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text,
	`user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_movements_business_date_idx` ON `cash_movements` (`business_date`);--> statement-breakpoint
CREATE TABLE `cash_register_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`business_date` text NOT NULL,
	`opened_by` text,
	`opened_at` text NOT NULL,
	`opening_cash` integer DEFAULT 0 NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`closing_cash` integer,
	`expected_cash` integer,
	`difference` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_sessions_business_date_idx` ON `cash_register_sessions` (`business_date`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `dining_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`area` text DEFAULT 'Main' NOT NULL,
	`seats` integer DEFAULT 4 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `item_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `item_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_variants_item_idx` ON `item_variants` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`short_code` text,
	`price` integer DEFAULT 0 NOT NULL,
	`food_type` text DEFAULT 'veg' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`addon_group_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_category_idx` ON `items` (`category_id`);--> statement-breakpoint
CREATE INDEX `items_short_code_idx` ON `items` (`short_code`);--> statement-breakpoint
CREATE TABLE `kots` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`order_id` text NOT NULL,
	`kot_no` integer NOT NULL,
	`business_date` text NOT NULL,
	`lines` text NOT NULL,
	`created_at` text NOT NULL,
	`printed_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kots_order_idx` ON `kots` (`order_id`);--> statement-breakpoint
CREATE INDEX `kots_business_date_idx` ON `kots` (`business_date`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text,
	`name` text NOT NULL,
	`variant_name` text,
	`unit_price` integer NOT NULL,
	`qty` integer NOT NULL,
	`addons` text DEFAULT '[]' NOT NULL,
	`addons_total` integer DEFAULT 0 NOT NULL,
	`line_total` integer NOT NULL,
	`notes` text,
	`kot_no` integer,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_item_idx` ON `order_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`bill_no` text,
	`business_date` text NOT NULL,
	`order_type` text NOT NULL,
	`table_id` text,
	`status` text NOT NULL,
	`kot_no` integer,
	`customer_name` text,
	`customer_phone` text,
	`customer_id` text,
	`notes` text,
	`discount_type` text,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`discount_reason` text,
	`charges` integer DEFAULT 0 NOT NULL,
	`tax_percent` integer DEFAULT 0 NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`round_off` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`cancel_reason` text,
	`print_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`printed_at` text,
	`settled_at` text,
	`ready_at` text,
	FOREIGN KEY (`table_id`) REFERENCES `dining_tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_business_date_idx` ON `orders` (`business_date`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_table_idx` ON `orders` (`table_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_bill_no_uidx` ON `orders` (`device_id`,`bill_no`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`order_id` text NOT NULL,
	`mode` text NOT NULL,
	`amount` integer NOT NULL,
	`tendered` integer,
	`reference` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
