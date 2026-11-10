import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export * from "./v1";

// Only pins managed by this app may be removed on a later sync.
export const PinnedPost = sqliteTable(
  "pinned_post",
  {
    userHandle: text("user_handle").notNull(),
    platform: text("platform").notNull(),
    tweetId: text("tweet_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userHandle, t.platform] })],
);
