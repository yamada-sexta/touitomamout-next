CREATE TABLE IF NOT EXISTS `tweet_map` (
	`tweet_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_store` text NOT NULL,
	PRIMARY KEY(`tweet_id`, `platform`)
);
CREATE TABLE IF NOT EXISTS `tweet_synced` (
	`tweet_id` text PRIMARY KEY NOT NULL,
	`synced` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `cookies` (
	`user_handle` text NOT NULL,
	`cookie` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `cookies_user_handle_unique` ON `cookies` (`user_handle`);
CREATE TABLE IF NOT EXISTS `profiles` (
	`user_id` text NOT NULL,
	`pfp_hash` text NOT NULL,
	`pfp_url` text NOT NULL,
	`banner_hash` text NOT NULL,
	`banner_url` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `profiles_user_id_unique` ON `profiles` (`user_id`);
CREATE TABLE IF NOT EXISTS `version` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL
);
