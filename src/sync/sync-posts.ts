import { type Scraper } from "@the-convocation/twitter-scraper";
import { type DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import {
  FORCE_SYNC_POSTS,
  HISTORICAL_SYNC_LIMIT,
  MAX_CONSECUTIVE_CACHED,
  type TwitterHandle,
} from "env";
import ora from "ora";
import { debug, logError, oraPrefix } from "utils/logs";
import { isPost, toMetaPost } from "types/post";
import { getPostStore } from "../utils/get-post-store";
import type { TaggedSynchronizer } from "./synchronizer";

const { TweetMap } = Schema;
const { TweetSynced } = Schema;

let firstSync = true;

export async function syncPosts(args: {
  db: DBType;
  handle: TwitterHandle;
  x: Scraper;
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

      const metaTweet = toMetaPost(tweet);
      try {
        for (const s of args.synchronizers) {
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
            const store = await getPostStore({
              db,
              tweet,
              platformId: s.platformId,
              s: s.storeSchema,
            });
            const syncRes = await s.syncPost({
              log: platformLog,
              tweet: metaTweet,
              store,
            });
            const storeString = syncRes ? JSON.stringify(syncRes.store) : "";
            await db.insert(TweetMap).values({
              tweetId: tweet.id,
              platform: s.platformId,
              platformStore: storeString,
            });
            platformLog.succeed(`${s.emoji} ${s.displayName} synced`);
          } catch (error) {
            logError(
              platformLog,
              error,
            )`Failed to sync tweet ${tweet.id} to ${s.displayName}: ${error}`;
            console.warn(error);
          }

          platformLog.stop();
        }

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
        logError(log, error)`Failed to sync tweet: ${error}`;
        console.error(error);
        console.error(tweet);
      }
    }
  } catch (error) {
    console.error("Scraper failed with an error:", error);
  }

  log.succeed("synced");

  firstSync = false;
}
