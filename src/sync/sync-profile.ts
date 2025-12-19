import type { Scraper } from "@the-convocation/twitter-scraper";
import { DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import {
  DEBUG,
  SYNC_PROFILE_DESCRIPTION,
  SYNC_PROFILE_HEADER,
  SYNC_PROFILE_NAME,
  SYNC_PROFILE_PICTURE,
  TwitterHandle,
} from "env";
import ora from "ora";
import { logError, oraPrefix } from "utils/logs";
import { download } from "utils/medias/download-media";
import { getBlobHash } from "utils/medias/get-blob-hash";
import { shortenedUrlsReplacer } from "utils/url/shortened-urls-replacer";

import { TaggedSynchronizer } from "./synchronizer";

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
  let pfpChanged = false;

  const cPfpUrl = row?.pfpUrl ?? "";
  const cPfpHash = row?.bannerHash ?? "";
  let pfpHash = "";
  let pfpBlob: File | undefined = undefined;

  if (cPfpUrl !== pfpUrl) {
    pfpBlob = await download(pfpUrl);
    const hash = await getBlobHash(pfpBlob);
    pfpHash = hash;
    if (hash !== cPfpHash) {
      pfpChanged = true;
    }
  } else {
    if (DEBUG) {
      console.log("Same pfp url");
    }
  }

  let bannerChanged = false;
  const cBannerUrl = row?.bannerUrl ?? "";
  const cBannerHash = row?.bannerHash ?? "";
  let bannerHash = "";
  let bannerBlob: File | undefined = undefined;

  if (cBannerUrl !== bannerUrl) {
    if (DEBUG) console.log("Banner URL changed");

    bannerBlob = await download(bannerUrl);
    const hash = await getBlobHash(bannerBlob);
    bannerHash = hash;
    if (hash !== cBannerHash) {
      if (DEBUG) console.log("Banner has a different hash");
      bannerChanged = true;
    }
  } else {
    if (DEBUG) console.log("Same banner url");
  }

  // Upsert (insert or update) the cache row
  await db
    .insert(Table)
    .values({
      userId,
      pfpHash,
      bannerHash,
      bannerUrl,
      pfpUrl,
    })
    .onConflictDoUpdate({
      target: Table.userId,
      set: {
        pfpHash,
        bannerHash,
        bannerUrl,
        pfpUrl,
      },
    });
  return {
    pfpChanged,
    bannerChanged,
    pfp: pfpBlob,
    banner: bannerBlob,
  };
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
  const { x: x, synchronizers, db } = args;
  const log = ora({
    color: "cyan",
    prefixText: oraPrefix("profile"),
  }).start();
  log.text = "parsing";

  // --- COMMON LOGIC: FETCH ---
  const profile = await x.getProfile(args.twitterHandle.handle);
  const pfpUrl = profile.avatar?.replace("_normal", "") ?? "";
  const bannerUrl = profile.banner ?? "";

  log.text = "checking media cache...";
  const { pfpChanged, bannerChanged, pfp: pfpBlob, banner: bannerBlob } =
    await upsertProfileCache({
      db,
      userId: args.twitterHandle.handle,
      bannerUrl,
      pfpUrl,
    });

  const jobs: Promise<void>[] = [];

  if (SYNC_PROFILE_PICTURE && pfpChanged && pfpBlob) {
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncProfilePic)
        .map((s) =>
          s.syncProfilePic!({
            log,
            profile,
            pfpFile: pfpBlob,
          }),
        ),
    );
  }

  if (SYNC_PROFILE_HEADER && bannerChanged && bannerBlob) {
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncBanner)
        .map((s) =>
          s.syncBanner!({
            log,
            profile,
            bannerFile: bannerBlob,
          }),
        ),
    );
  }

  if (SYNC_PROFILE_DESCRIPTION && profile.biography) {
    const formattedBio = await shortenedUrlsReplacer(profile.biography);
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncBio)
        .map((s) =>
          s.syncBio!({
            log,
            profile,
            bio: profile.biography!,
            formattedBio,
          }),
        ),
    );
  }

  if (SYNC_PROFILE_NAME && profile.name) {
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncUserName)
        .map((s) =>
          s.syncUserName!({
            log,
            profile,
            name: profile.name!,
          }),
        ),
    );
  }
  // 3. Run all synchronization tasks in parallel
  log.text = "dispatching sync tasks...";
  try {
    await Promise.all(jobs);
    log.succeed("synced");
  } catch (error) {
    logError(log, error)`Error during synchronization: ${error}`
  }
  log.stop();
}
