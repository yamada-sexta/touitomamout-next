import type { Scraper } from "@the-convocation/twitter-scraper";
import { and, eq } from "drizzle-orm";
import ora from "ora";
import type { DBType } from "~/db";
import * as Schema from "~/db/schema/v2";
import {
  getPostAppend,
  SYNC_PINNED_POSTS,
  SYNC_RETWEETS,
  type TwitterHandle,
} from "~/env";
import { isPost, toMetaPost, type MetaPost } from "~/types/post";
import { getPostStore } from "~/utils/get-post-store";
import { logError, oraPrefix } from "~/utils/logs";
import { isShutdownError, throwIfShutdownRequested } from "../shutdown";
import { syncPostToPlatform } from "./sync-posts";
import type { TaggedSynchronizer } from "./synchronizer";

export async function syncPinnedPosts(args: {
  db: DBType;
  handle: TwitterHandle;
  x: Pick<Scraper, "getProfile" | "getTweet">;
  synchronizers: TaggedSynchronizer[];
  enabled?: boolean;
}) {
  if (!(args.enabled ?? SYNC_PINNED_POSTS) || !args.synchronizers.length)
    return;
  const { db, handle, x, synchronizers } = args;
  const log = ora({ prefixText: oraPrefix("pinned posts") });
  const table = Schema.PinnedPost;
  try {
    throwIfShutdownRequested();
    const profile = await x.getProfile(handle.handle);
    // Missing metadata is not evidence that a user removed their pin.
    if (!profile.pinnedTweetIds) return;
    const tweetId = profile.pinnedTweetIds[0];
    let tweet: MetaPost | undefined;

    for (const s of synchronizers) {
      try {
        throwIfShutdownRequested();
        const key = and(
          eq(table.userHandle, handle.handle),
          eq(table.platform, s.platformId),
        );
        const previous = db.select().from(table).where(key).get();
        let store = await getPostStore({
          db,
          tweet: tweetId,
          platformId: s.platformId,
          s: s.storeSchema,
        });
        if (tweetId && !store.success && s.syncPost) {
          if (!tweet) {
            const raw = await x.getTweet(tweetId);
            if (!isPost(raw) || raw.id !== tweetId) {
              throw new Error(`Unable to fetch pinned post ${tweetId}`);
            }
            if (raw.isRetweet && !SYNC_RETWEETS) return;
            tweet = toMetaPost(
              { ...raw, isPin: true },
              getPostAppend(handle.postFix),
            );
          }
          store = await syncPostToPlatform({ db, tweet, synchronizer: s, log });
        }
        if (!s.setPostPinned) continue;
        // Never remove the old pin until the replacement has been mirrored.
        if (tweetId && !store.success) continue;
        // Free the managed pin slot first, including on servers at their pin limit.
        if (previous && previous.tweetId !== tweetId) {
          const oldStore = await getPostStore({
            db,
            tweet: previous.tweetId,
            platformId: s.platformId,
            s: s.storeSchema,
          });
          if (!oldStore.success)
            throw new Error(
              `Missing store for previous pin ${previous.tweetId}`,
            );
          throwIfShutdownRequested();
          await s.setPostPinned({ log, store: oldStore.data, pinned: false });
        }
        if (tweetId && store.success) {
          throwIfShutdownRequested();
          await s.setPostPinned({ log, store: store.data, pinned: true });
        }
        throwIfShutdownRequested();
        if (tweetId) {
          await db
            .insert(table)
            .values({
              userHandle: handle.handle,
              platform: s.platformId,
              tweetId,
            })
            .onConflictDoUpdate({
              target: [table.userHandle, table.platform],
              set: { tweetId },
            })
            .run();
        } else {
          await db.delete(table).where(key).run();
        }
      } catch (error) {
        if (isShutdownError(error)) throw error;
        logError(
          log,
          error,
        )`Failed to sync pinned post to ${s.displayName}: ${error}`;
      }
    }
  } catch (error) {
    if (!isShutdownError(error)) {
      logError(log, error)`Failed to read pinned posts: ${error}`;
    }
  } finally {
    log.stop();
  }
}
