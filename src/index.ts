import { db } from "db";
import ora from "ora";
import { BlueskySynchronizerFactory } from "sync/platforms/bluesky";
import { MastodonSynchronizerFactory } from "sync/platforms/mastodon/mastodon-sync";
import { syncPosts } from "sync/sync-posts";
import { syncProfile } from "sync/sync-profile";
import { type TaggedSynchronizer } from "sync/synchronizer";
import { createTwitterClient } from "sync/x-client";
import { logError, oraPrefix } from "utils/logs";
import { MisskeySynchronizerFactory } from "sync/platforms/misskey/missky-sync";
import { DiscordWebhookSynchronizerFactory } from "sync/platforms/discord-webhook/webhook-sync";
import { cycleTLSExit } from "@the-convocation/twitter-scraper/cycletls";
import { CronJob } from "cron";

import {
  CRON_JOB_SCHEDULE,
  DAEMON,
  SYNC_FREQUENCY_MIN,
  SYNC_POSTS,
  TOUITOMAMOUT_VERSION,
  TWITTER_HANDLES,
  TWITTER_PASSWORD,
  TWITTER_USERNAME,
  type TwitterHandle,
} from "./env";

let interval: NodeJS.Timeout | undefined;
process.on("exit", (code) => {
  // Clean up CycleTLS resources
  cycleTLSExit();
  console.log(`Process exited with code ${code}`);
});
// Register event
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT (Ctrl+C). Exiting...");
  if (interval) {
    clearInterval(interval);
  } // Stop daemon loop

  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Exiting...");
  process.exit(0);
});

console.log(`\n
  Touitomamout@v${TOUITOMAMOUT_VERSION}
  `);

const factories = [
  BlueskySynchronizerFactory,
  MastodonSynchronizerFactory,
  MisskeySynchronizerFactory,
  DiscordWebhookSynchronizerFactory,
] as const;

const xClient = await createTwitterClient({
  twitterPassword: TWITTER_PASSWORD,
  twitterUsername: TWITTER_USERNAME,
  db,
});

const users: SyncUser[] = [];
type SyncUser = {
  handle: TwitterHandle;
  synchronizers: TaggedSynchronizer[];
};

for (const handle of TWITTER_HANDLES) {
  console.log(`Connecting @${handle.handle}...`);
  const synchronizers: TaggedSynchronizer[] = [];
  for (const factory of factories) {
    const log = ora({
      color: "gray",
      prefixText: oraPrefix(`${factory.EMOJI} client`),
    }).start(`Connecting to ${factory.DISPLAY_NAME}`);

    const envKeys = factory.ENV_KEYS;
    type K = (typeof factory.ENV_KEYS)[number];
    const fallback = factory.FALLBACK_ENV ?? {};
    type EnvType = Record<K, string>;
    const env: typeof factory.FALLBACK_ENV = {};
    let skip = false;
    for (const key of envKeys) {
      const osKey = key + handle.postFix;
      const value =
        process.env[osKey] ||
        (fallback[key as keyof typeof fallback] as string | undefined);
      if (!value) {
        log.warn(
          `${factory.DISPLAY_NAME} will not be synced because "${osKey}" is not set`
        );
        skip = true;
        break;
      }

      // @ts-expect-error
      env[key] = value;
    }

    if (skip) {
      continue;
    }

    try {
      const s = await factory.create({
        xClient,
        env: env as EnvType,
        db,
        slot: handle.slot,
        log,
      });
      synchronizers.push({
        ...s,
        displayName: factory.DISPLAY_NAME,
        emoji: factory.EMOJI,
        platformId: factory.PLATFORM_ID,
        storeSchema: factory.STORE_SCHEMA,
      });
      log.succeed("connected");
    } catch (error) {
      logError(
        log,
        error
      )`Failed to connect to ${factory.DISPLAY_NAME}: ${error}`;
    } finally {
      log.stop();
    }
  }

  users.push({
    handle,
    synchronizers,
  });
}

/**
 * Main syncing loop
 */
const syncAll = async () => {
  if (!users) {
    throw new Error("Unable to sync anything...");
  }

  for await (const user of users) {
    console.log(
      `\n𝕏 ->  ${user.synchronizers.map((s) => s.emoji).join(" + ")}`
    );
    console.log(`| @${user.handle.handle}`);
    await syncProfile({
      x: xClient,
      twitterHandle: user.handle,
      synchronizers: user.synchronizers,
      db,
    });
    if (!SYNC_POSTS) {
      console.log("Posts will not be synced...");
      continue;
    }

    await syncPosts({
      db,
      handle: user.handle,
      x: xClient,
      synchronizers: user.synchronizers,
    });
    console.log(`| ${user.handle.handle} is up-to-date`);
  }
};

if (CRON_JOB_SCHEDULE) {
  console.log(`Scheduling sync with cron schedule: ${CRON_JOB_SCHEDULE}`);
  const job = new CronJob(CRON_JOB_SCHEDULE, async () => {
    console.log(`\nCron job triggered at ${new Date().toLocaleString()}`);
    await syncAll();
  });
  console.log(
    `Scheduled next run: ${job
      .nextDates(1)
      .map((d) => `${d.toJSDate().toLocaleString()}`)
      .join("")}`
  );
  job.start();
} else if (DAEMON) {
  console.log("Running in daemon mode...");
  await syncAll();
  console.log(`Run daemon every ${SYNC_FREQUENCY_MIN}min`);
  interval = setInterval(
    async () => {
      await syncAll();
    },
    SYNC_FREQUENCY_MIN * 60 * 1000
  );
} else {
  console.log("Running single sync...");
  await syncAll();
}

cycleTLSExit();
