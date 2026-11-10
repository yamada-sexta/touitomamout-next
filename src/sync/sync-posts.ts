import { type Scraper as XScraper } from "@the-convocation/twitter-scraper";
import type { DBType } from "~/db";
import * as Schema from "~/db/schema/v2";
import { eq } from "drizzle-orm";
import {
  FORCE_SYNC_POSTS,
  getPostAppend,
  HISTORICAL_SYNC_LIMIT,
  MAX_CONSECUTIVE_CACHED,
  SYNC_RETWEETS,
  type TwitterHandle,
} from "~/env";
import ora from "ora";
import { debug, logError, oraPrefix } from "~/utils/logs";
import { isPost, toMetaPost, type MetaPost } from "~/types/post";
import { getPostStore } from "../utils/get-post-store";
import type { TaggedSynchronizer } from "./synchronizer";
import { isShutdownError, throwIfShutdownRequested } from "../shutdown";

const { TweetMap } = Schema;
const { TweetSynced } = Schema;

let firstSync = true;

export async function syncPosts(args: {
  db: DBType;
  handle: TwitterHandle;
  x: XScraper;
  synchronizers: TaggedSynchronizer[];
}) {
  const { db, handle, x, synchronizers } = args;
  if (synchronizers.filter((s) => s.syncPost).length === 0) {
    return;
  }

  const log = ora({
    color: "cyan",
    prefixText: oraPrefix("posts"),
  }).start();
  log.text = "starting...";

  let cachedCounter = 0;
  let counter = 0;
  try {
    debug("getting", handle);
    const maxSync = firstSync ? HISTORICAL_SYNC_LIMIT : Infinity;
    const iter = x.getTweets(handle.handle, maxSync);
    log.text = "Created async iterator";
    for await (const tweet of iter) {
      throwIfShutdownRequested();
      counter++;
      log.text = `syncing [${counter}/${maxSync === Infinity ? "∞" : maxSync}] tweets...`;
      if (cachedCounter >= MAX_CONSECUTIVE_CACHED) {
        log.info("skipping because too many consecutive cached tweets");
        break;
      }

      if (!isPost(tweet)) {
        log.warn(`tweet is not valid...\n${tweet}`);
        continue;
      }

      if (tweet.isRetweet && !SYNC_RETWEETS) {
        log.info("skipping retweet");
        continue;
      }

      const synced = db
        .select()
        .from(TweetSynced)
        .where(eq(TweetSynced.tweetId, tweet.id))
        .get();
      if (synced && synced.synced !== 0 && !FORCE_SYNC_POSTS) {
        log.info("skipping synced tweet");
        cachedCounter++;
        log.info(
          `encounter cached tweet [${cachedCounter}/${MAX_CONSECUTIVE_CACHED}]`,
        );
        continue;
      } else {
        cachedCounter = 0;
      }

      const metaTweet = toMetaPost(tweet, getPostAppend(handle.postFix));
      try {
        for (const s of args.synchronizers) {
          throwIfShutdownRequested();
          // Might have race condition if done in parallel
          if (!s.syncPost) {
            continue;
          }

          const platformLog = ora({
            color: "cyan",
            prefixText: oraPrefix(`${s.emoji} ${s.displayName}`),
          });
          try {
            platformLog.text = `| syncing ${s.emoji} ${s.displayName}...`;
            await syncPostToPlatform({
              db,
              tweet: metaTweet,
              synchronizer: s,
              log: platformLog,
            });
            platformLog.succeed(`${s.emoji} ${s.displayName} synced`);
          } catch (error) {
            if (isShutdownError(error)) {
              platformLog.stop();
              throw error;
            }

            logError(
              platformLog,
              error,
            )`Failed to sync tweet ${tweet.id} to ${s.displayName}: ${error}`;
            console.warn(error);
          }

          platformLog.stop();
        }

        throwIfShutdownRequested();
        // Mark as synced
        await db
          .insert(TweetSynced)
          .values({ tweetId: tweet.id, synced: 1 })
          .onConflictDoUpdate({
            target: TweetSynced.tweetId,
            set: { synced: 1 },
          })
          .run();
      } catch (error) {
        if (isShutdownError(error)) {
          throw error;
        }

        logError(log, error)`Failed to sync tweet: ${error}`;
        console.error(error);
        console.error(tweet);
      }
    }
  } catch (error) {
    if (isShutdownError(error)) {
      log.warn("stopped");
      return;
    }

    console.error("Scraper failed with an error:", error);
  }

  log.succeed("synced");

  firstSync = false;
}

// Persist each destination immediately so retries do not create duplicate posts.
export async function syncPostToPlatform(args: {
  db: DBType;
  tweet: MetaPost;
  synchronizer: TaggedSynchronizer;
  log: import("ora").Ora;
}) {
  const { db, tweet, synchronizer: s, log } = args;
  const store = await getPostStore({
    db,
    tweet: tweet.id,
    platformId: s.platformId,
    s: s.storeSchema,
  });
  if (store.success || !s.syncPost) return store;
  throwIfShutdownRequested();
  const result = await s.syncPost({ log, tweet, store });
  throwIfShutdownRequested();
  if (!result?.store) return store;
  const platformStore = JSON.stringify(result.store);
  await db
    .insert(TweetMap)
    .values({
      tweetId: tweet.id,
      platform: s.platformId,
      platformStore,
    })
    .onConflictDoUpdate({
      target: [TweetMap.tweetId, TweetMap.platform],
      set: { platformStore },
    })
    .run();
  return s.storeSchema.safeParse(result.store);
}
