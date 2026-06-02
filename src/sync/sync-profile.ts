import type { Scraper } from "@the-convocation/twitter-scraper";
import { type DBType, Schema } from "~/db";
import { eq } from "drizzle-orm";
import {
  FORCE_SYNC_PROFILE_HEADER,
  FORCE_SYNC_PROFILE_PICTURE,
  SYNC_PROFILE_DESCRIPTION,
  SYNC_PROFILE_HEADER,
  SYNC_PROFILE_NAME,
  SYNC_PROFILE_PICTURE,
  type TwitterHandle,
} from "~/env";
import ora from "ora";
import { debug, logError, oraPrefix } from "~/utils/logs";
import { download } from "~/utils/medias/download-media";
import { getBlobHash } from "~/utils/medias/get-blob-hash";
import { shortenedUrlsReplacer } from "~/utils/url/shortened-urls-replacer";
import { type TaggedSynchronizer } from "./synchronizer";
import { sleep } from "bun";
import { isShutdownError, throwIfShutdownRequested } from "../shutdown";

const Table = Schema.TwitterProfileCache;

async function upsertProfileCache(args: {
  db: DBType;
  userId: string;
  pfpUrl?: string;
  bannerUrl?: string;
}): Promise<{
  pfpChanged: boolean;
  bannerChanged: boolean;
  pfp?: File;
  banner?: File;
}> {
  const pfpUrl = args.pfpUrl ?? "";
  const bannerUrl = args.bannerUrl ?? "";
  const { db, userId } = args;

  const [row] = await db
    .select({
      pfpHash: Table.pfpHash,
      bannerHash: Table.bannerHash,
      pfpUrl: Table.pfpUrl,
      bannerUrl: Table.bannerUrl,
    })
    .from(Table)
    .where(eq(Table.userId, userId));

  const cPfpHash = row?.pfpHash ?? "";
  // We have to check the actual content, because Twitter doesn't always change the URL when the image is changed
  const pfpBlob = SYNC_PROFILE_PICTURE ? await download(pfpUrl) : undefined;
  const pfpHash = (await getBlobHash(pfpBlob)) ?? "";

  let pfpChanged = pfpHash !== cPfpHash && SYNC_PROFILE_PICTURE;
  debug(
    "PFP hash:",
    pfpHash,
    "Cached PFP hash:",
    cPfpHash,
    "Changed:",
    pfpChanged,
  );

  const cBannerHash = row?.bannerHash ?? "";

  const bannerBlob = SYNC_PROFILE_HEADER
    ? await download(bannerUrl)
    : undefined;
  const bannerHash = (await getBlobHash(bannerBlob)) ?? "";

  let bannerChanged = bannerHash !== cBannerHash && SYNC_PROFILE_HEADER;

  debug(
    "Banner hash:",
    bannerHash,
    "Cached banner hash:",
    cBannerHash,
    "Changed:",
    bannerChanged,
  );

  return {
    pfpChanged,
    bannerChanged,
    pfp: pfpBlob,
    banner: bannerBlob,
  };
}

async function markProfileCacheSynced(args: {
  db: DBType;
  userId: string;
  pfpHash: string;
  bannerHash: string;
  pfpUrl: string;
  bannerUrl: string;
}) {
  await args.db
    .insert(Table)
    .values({
      userId: args.userId,
      pfpHash: args.pfpHash,
      bannerHash: args.bannerHash,
      bannerUrl: args.bannerUrl,
      pfpUrl: args.pfpUrl,
    })
    .onConflictDoUpdate({
      target: Table.userId,
      set: {
        pfpHash: args.pfpHash,
        bannerHash: args.bannerHash,
        bannerUrl: args.bannerUrl,
        pfpUrl: args.pfpUrl,
      },
    });
}

/**
 * An async method that fetches a Twitter profile and dispatches
 * synchronization tasks to configured platforms.
 */
export async function syncProfile(args: {
  twitterHandle: TwitterHandle;
  x: Scraper;
  synchronizers: TaggedSynchronizer[];
  db: DBType;
}): Promise<void> {
  const { x, synchronizers, db } = args;
  const log = ora({
    color: "cyan",
    prefixText: oraPrefix("profile"),
  }).start();

  try {
    log.text = "parsing";
    throwIfShutdownRequested();

    // --- COMMON LOGIC: FETCH ---
    const profile = await x.getProfile(args.twitterHandle.handle);
    throwIfShutdownRequested();

    const pfpUrl = SYNC_PROFILE_PICTURE ? profile.avatar : undefined;
    const bannerUrl = SYNC_PROFILE_HEADER ? profile.banner : undefined;

    debug("Profile fetched:", profile);

    log.text = "checking media cache...";
    const {
      pfpChanged,
      bannerChanged,
      pfp: pfpBlob,
      banner: bannerBlob,
    } = await upsertProfileCache({
      db,
      userId: args.twitterHandle.handle,
      bannerUrl,
      pfpUrl,
    });
    throwIfShutdownRequested();

    debug("Change: ", {
      pfpChanged,
      bannerChanged,
    });

    log.text = "syncing...";

    const wait = async () => {
      throwIfShutdownRequested();
      await sleep(1000); // Sleep for a short time between tasks to fix the stupid bluesky api.
      throwIfShutdownRequested();
    };

    const needSyncPfp = SYNC_PROFILE_PICTURE && pfpChanged;

    if ((needSyncPfp || FORCE_SYNC_PROFILE_PICTURE) && pfpBlob) {
      log.text = "syncing profile picture...";
      for (const s of synchronizers) {
        throwIfShutdownRequested();
        if (!s.syncProfilePic) {
          continue;
        }
        debug(`Syncing profile picture for ${s.displayName}...`);
        try {
          await s.syncProfilePic({
            log,
            profile,
            pfpFile: pfpBlob,
          });
          throwIfShutdownRequested();
        } catch (error) {
          if (isShutdownError(error)) {
            throw error;
          }

          logError(
            log,
            error,
          )`Failed to sync profile picture for ${s.displayName}: ${error}`;
        }
        await wait();
      }
      debug("Profile picture synced");
    }

    const needSyncBanner = SYNC_PROFILE_HEADER && bannerChanged;

    if ((needSyncBanner || FORCE_SYNC_PROFILE_HEADER) && bannerBlob) {
      log.text = "syncing banner...";
      for (const s of synchronizers) {
        throwIfShutdownRequested();
        if (!s.syncBanner) {
          continue;
        }
        debug(`Syncing banner for ${s.displayName}...`);
        try {
          await s.syncBanner({
            log,
            profile,
            bannerFile: bannerBlob,
          });
          throwIfShutdownRequested();
        } catch (error) {
          if (isShutdownError(error)) {
            throw error;
          }

          logError(
            log,
            error,
          )`Failed to sync banner for ${s.displayName}: ${error}`;
        }
        await wait();
      }
      debug("Banner synced");
    }

    await markProfileCacheSynced({
      db,
      userId: args.twitterHandle.handle,
      pfpHash: (await getBlobHash(pfpBlob)) ?? "",
      bannerHash: (await getBlobHash(bannerBlob)) ?? "",
      pfpUrl: pfpUrl ?? "",
      bannerUrl: bannerUrl ?? "",
    });
    throwIfShutdownRequested();

    if (SYNC_PROFILE_DESCRIPTION && profile.biography) {
      const formattedBio = await shortenedUrlsReplacer(profile.biography);
      throwIfShutdownRequested();

      log.text = "syncing bio...";
      for (const s of synchronizers) {
        throwIfShutdownRequested();
        if (!s.syncBio) {
          continue;
        }
        try {
          await s.syncBio({
            log,
            profile,
            bio: profile.biography!,
            formattedBio,
          });
          throwIfShutdownRequested();
        } catch (error) {
          if (isShutdownError(error)) {
            throw error;
          }

          logError(
            log,
            error,
          )`Failed to sync bio for ${s.displayName}: ${error}`;
        }
        await wait();
      }
    }

    if (SYNC_PROFILE_NAME && profile.name) {
      log.text = "syncing name...";
      for (const s of synchronizers) {
        throwIfShutdownRequested();
        if (!s.syncUserName) {
          continue;
        }
        try {
          await s.syncUserName({
            log,
            profile,
            name: profile.name,
          });
          throwIfShutdownRequested();
        } catch (error) {
          if (isShutdownError(error)) {
            throw error;
          }

          logError(
            log,
            error,
          )`Failed to sync name for ${s.displayName}: ${error}`;
        }
        await wait();
      }
    }
  } catch (error) {
    if (isShutdownError(error)) {
      log.warn("stopped");
      return;
    }

    throw error;
  } finally {
    log.stop();
  }
}
