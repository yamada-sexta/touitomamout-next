import { type Scraper as XScraper } from "@the-convocation/twitter-scraper";
import { type DBType } from "#app/db";
import {
  FORCE_SYNC_POSTS,
  getPostAppend,
  HISTORICAL_SYNC_LIMIT,
  MAX_CONSECUTIVE_CACHED,
  SYNC_RETWEETS,
  type TwitterHandle,
} from "#app/env";
import ora from "#app/utils/logs";
import { debug, logError, oraPrefix } from "#app/utils/logs";
import { isPost, toMetaPost } from "#app/types/post";
import { getPostStore } from "../utils/get-post-store";
import type { TaggedSynchronizer } from "./synchronizer";
import { isShutdownError, throwIfShutdownRequested } from "../shutdown";

const initializedHandles = new Set<string>();

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
  let completedIteration = false;
  try {
    debug("getting", handle);
    const handleKey = `${handle.slot}:${handle.handle}`;
    const maxSync = initializedHandles.has(handleKey)
      ? Infinity
      : HISTORICAL_SYNC_LIMIT;
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

      const synced = db.isTweetSynced(tweet.id);
      if (synced && !FORCE_SYNC_POSTS) {
        log.info("skipping synced tweet");
        cachedCounter++;
        log.info(
          `encounter cached tweet [${cachedCounter}/${MAX_CONSECUTIVE_CACHED}]`,
        );
        continue;
      } else {
        cachedCounter = 0;
      }

      try {
        const metaTweet = toMetaPost(tweet, getPostAppend(handle.postFix));
        let attemptedPlatforms = 0;
        let allPlatformsSucceeded = true;
        for (const s of args.synchronizers) {
          throwIfShutdownRequested();
          // Might have race condition if done in parallel
          if (!s.syncPost) {
            continue;
          }
          attemptedPlatforms += 1;

          const platformLog = ora({
            color: "cyan",
            prefixText: oraPrefix(`${s.emoji} ${s.displayName}`),
          });
          try {
            platformLog.text = `| syncing ${s.emoji} ${s.displayName}...`;
            const store = await getPostStore({
              db,
              tweet,
              platformId: s.platformId,
              s: s.storeSchema,
            });
            throwIfShutdownRequested();
            const syncRes = await s.syncPost({
              log: platformLog,
              tweet: metaTweet,
              store,
            });
            throwIfShutdownRequested();
            const storeString = syncRes ? JSON.stringify(syncRes.store) : "";
            db.insertPostStore(tweet.id, s.platformId, storeString);
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
            allPlatformsSucceeded = false;
          }

          platformLog.stop();
        }

        throwIfShutdownRequested();
        // A global synced marker is only safe once every enabled platform has
        // succeeded. Successful platforms are idempotent through tweet_map and
        // can be skipped on the retry of a partially failed tweet.
        if (attemptedPlatforms > 0 && allPlatformsSucceeded) {
          db.markTweetSynced(tweet.id);
        }
      } catch (error) {
        if (isShutdownError(error)) {
          throw error;
        }

        logError(log, error)`Failed to sync tweet: ${error}`;
        console.error(error);
        console.error(tweet);
      }
    }
    completedIteration = true;
  } catch (error) {
    if (isShutdownError(error)) {
      log.warn("stopped");
      return;
    }

    console.error("Scraper failed with an error:", error);
  }

  log.succeed("synced");

  if (completedIteration) {
    initializedHandles.add(`${handle.slot}:${handle.handle}`);
  }
}
