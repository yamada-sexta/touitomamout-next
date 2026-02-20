import type { Scraper } from "@the-convocation/twitter-scraper";
import { type DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import {
  SYNC_PROFILE_DESCRIPTION,
  SYNC_PROFILE_HEADER,
  SYNC_PROFILE_NAME,
  SYNC_PROFILE_PICTURE,
  type TwitterHandle,
} from "env";
import ora from "ora";
import { debug, logError, oraPrefix } from "utils/logs";
import { download } from "utils/medias/download-media";
import { getBlobHash } from "utils/medias/get-blob-hash";
import { shortenedUrlsReplacer } from "utils/url/shortened-urls-replacer";
import { type TaggedSynchronizer } from "./synchronizer";

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

  // const cPfpUrl = row?.pfpUrl ?? "";
  const cPfpHash = row?.pfpHash ?? "";
  // let pfpHash = "";
  let pfpBlob: File | undefined;

  // We have to check the actual content, because Twitter doesn't always change the URL when the image is changed

  pfpBlob = await download(pfpUrl);
  const pfpHash = await getBlobHash(pfpBlob);

  if (pfpHash !== cPfpHash) {
    pfpChanged = true;
    debug("PFP has a different hash");
  }
  let bannerChanged = false;
  const cBannerHash = row?.bannerHash ?? "";
  let bannerHash = "";
  let bannerBlob: File | undefined;

  bannerBlob = await download(bannerUrl);
  const hash = await getBlobHash(bannerBlob);
  bannerHash = hash;
  if (hash !== cBannerHash) {
    bannerChanged = true;
    debug("Banner has a different hash");
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
  const { x, synchronizers, db } = args;
  const log = ora({
    color: "cyan",
    prefixText: oraPrefix("profile"),
  }).start();
  log.text = "parsing";

  // --- COMMON LOGIC: FETCH ---
  const profile = await x.getProfile(args.twitterHandle.handle);
  const pfpUrl = profile.avatar ?? "";
  const bannerUrl = profile.banner ?? "";

  debug("Profile fetched:", profile);

  // log.text = "checking media cache...";
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
  debug("Change: ", {
    pfpChanged,
    bannerChanged,
  });

  // const pfpBlob = await download(profile.avatar ?? "");
  // const bannerBlob = await download(profile.banner ?? "");
  const jobs: Array<Promise<void>> = [];

  if (SYNC_PROFILE_PICTURE && pfpBlob && pfpChanged) {
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncProfilePic)
        .map(async (s) =>
          s.syncProfilePic!({
            log,
            profile,
            pfpFile: pfpBlob,
          }),
        ),
    );
  }

  if (SYNC_PROFILE_HEADER && bannerBlob && bannerChanged) {
    jobs.push(
      ...synchronizers
        .filter((s) => s.syncBanner)
        .map(async (s) =>
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
        .map(async (s) =>
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
        .map(async (s) =>
          s.syncUserName!({
            log,
            profile,
            name: profile.name!,
          }),
        ),
    );
  }

  // Run all synchronization tasks in parallel
  log.text = "dispatching sync tasks...";
  try {
    // await Promise.all(jobs);
    for (const job of jobs) {
      await job;
    }
    log.succeed("synced");
  } catch (error) {
    logError(log, error)`Error during synchronization: ${error}`;
  }

  log.stop();
}
