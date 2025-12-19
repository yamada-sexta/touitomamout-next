import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';
/**
 * Stores the current database schema version.
 * Should only ever contain one row: { id: 1, version: X }
 */
export const Version = sqliteTable('version', {
	id: integer('id').primaryKey(),
	version: integer('version').notNull(),
});

export const TweetMap = sqliteTable(
	'tweet_map',
	{
		tweetId: text('tweet_id').notNull(),
		platform: text('platform').notNull(),
		platformStore: text('platform_store').notNull(),
	},
	t => [primaryKey({columns: [t.tweetId, t.platform]})],
);

export const TwitterCookieCache = sqliteTable('cookies', {
	userHandle: text('user_handle').notNull().unique(),
	cookie: text('cookie').notNull(),
});

export const TwitterProfileCache = sqliteTable('profiles', {
	userId: text('user_id').notNull().unique(),
	pfpHash: text('pfp_hash').notNull(),
	pfpUrl: text('pfp_url').notNull(),
	bannerHash: text('banner_hash').notNull(),
	bannerUrl: text('banner_url').notNull(),
});

export const TweetSynced = sqliteTable('tweet_synced', {
	tweetId: text('tweet_id').primaryKey(),
	synced: integer('synced').notNull(),
});
