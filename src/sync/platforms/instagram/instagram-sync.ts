import {
  IgApiClient,
  IgLoginTwoFactorRequiredError,
} from "instagram-private-api";
import { SYNC_INSTAGRAM, VOID } from "env";
import { type DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import { type SynchronizerFactory } from "sync/synchronizer";
import { type DownloadedPhoto, type DownloadedVideo } from "types/post";
import { download } from "utils/medias/download-media";
import { debug, oraProgress } from "utils/logs";
import { getPostExcerpt } from "utils/post/get-post-excerpt";
import z from "zod";

const KEYS = ["INSTAGRAM_USERNAME", "INSTAGRAM_PASSWORD"] as const;

const INSTAGRAM_CAPTION_MAX_LENGTH = 2200;
const INSTAGRAM_ALBUM_MAX_ITEMS = 10;
const trimInstagramUsername = (username: string): string =>
  username.toLowerCase().trim().replace(/^@+/, "");

const InstagramStoreSchema = z.object({
  mediaId: z.string(),
});

type InstagramPublishResponse = {
  media?: {
    id?: string;
    pk?: string | number;
  };
};

type InstagramAlbumPhotoItem = {
  file: Buffer;
};

type InstagramAlbumVideoItem = {
  video: Buffer;
  coverImage: Buffer;
};

type InstagramAlbumItem = InstagramAlbumPhotoItem | InstagramAlbumVideoItem;

function trimCaption(text: string): string {
  if (text.length <= INSTAGRAM_CAPTION_MAX_LENGTH) {
    return text;
  }

  return text.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH - 1).trimEnd() + "…";
}

async function fileToBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

function getSlotEnv(key: string, slot: number): string {
  const suffix = slot === 0 ? "" : String(slot);
  return process.env[`${key}${suffix}`]?.trim() ?? "";
}

async function getCachedSession(db: DBType, username: string): Promise<string> {
  const cacheKey = `instagram:${username}`;
  const previousSession = await db
    .select()
    .from(Schema.TwitterCookieCache)
    .where(eq(Schema.TwitterCookieCache.userHandle, cacheKey));

  return previousSession[0]?.cookie ?? "";
}

async function cacheSession(
  db: DBType,
  username: string,
  ig: IgApiClient,
): Promise<void> {
  const cacheKey = `instagram:${username}`;
  const state = JSON.stringify(await ig.state.serialize());
  await db
    .insert(Schema.TwitterCookieCache)
    .values({
      userHandle: cacheKey,
      cookie: state,
    })
    .onConflictDoUpdate({
      target: Schema.TwitterCookieCache.userHandle,
      set: {
        cookie: state,
      },
    });
}

function getPublishedMediaId(response: InstagramPublishResponse): string {
  const id = response.media?.id ?? response.media?.pk;
  return id ? String(id) : "";
}

export const InstagramSynchronizerFactory: SynchronizerFactory<
  typeof KEYS,
  typeof InstagramStoreSchema
> = {
  EMOJI: "📸",
  DISPLAY_NAME: "Instagram",
  PLATFORM_ID: "instagram",
  ENV_KEYS: KEYS,
  STORE_SCHEMA: InstagramStoreSchema,
  async create(args) {
    if (!SYNC_INSTAGRAM) {
      throw new Error("Instagram will not be synced");
    }

    const username = trimInstagramUsername(args.env.INSTAGRAM_USERNAME);
    const password = args.env.INSTAGRAM_PASSWORD;
    const sessionState = getSlotEnv("INSTAGRAM_SESSION_STATE", args.slot);
    const twoFactorCode = getSlotEnv("INSTAGRAM_TWO_FACTOR_CODE", args.slot);
    const db = args.db;
    const ig = new IgApiClient();
    ig.state.generateDevice(username);

    const session = sessionState || (await getCachedSession(db, username));
    if (session) {
      await ig.state.deserialize(session);
    }

    try {
      await ig.account.currentUser();
      args.log.text = "connected (session restored)";
    } catch {
      try {
        await ig.simulate.preLoginFlow();
        await ig.account.login(username, password);
        process.nextTick(async () => ig.simulate.postLoginFlow());
        args.log.text = "connected (using credentials)";
        await cacheSession(db, username, ig);
      } catch (error) {
        if (error instanceof IgLoginTwoFactorRequiredError) {
          if (!twoFactorCode) {
            throw new Error(
              "Instagram requires a two-factor code. Set INSTAGRAM_TWO_FACTOR_CODE for this run, then remove it after the session is cached.",
            );
          }

          const twoFactorInfo = error.response.body.two_factor_info;
          await ig.account.twoFactorLogin({
            username,
            verificationCode: twoFactorCode,
            twoFactorIdentifier: twoFactorInfo.two_factor_identifier,
            verificationMethod: twoFactorInfo.totp_two_factor_on ? "3" : "1",
            trustThisDevice: "1",
          });
          args.log.text = "connected (using two-factor code)";
          await cacheSession(db, username, ig);
        } else {
          throw error;
        }
      }
    }

    async function getAlbumItems(
      photos: DownloadedPhoto[],
      videos: DownloadedVideo[],
    ): Promise<InstagramAlbumItem[]> {
      const photoItems: InstagramAlbumPhotoItem[] = [];
      for (const photo of photos) {
        if (!photo.file) {
          continue;
        }

        photoItems.push({ file: await fileToBuffer(photo.file) });
      }

      const videoItems: InstagramAlbumVideoItem[] = [];
      for (const video of videos) {
        if (!video.file) {
          continue;
        }

        const coverImageFile = video.preview
          ? await download(video.preview)
          : undefined;
        if (!coverImageFile) {
          continue;
        }

        videoItems.push({
          video: await fileToBuffer(video.file),
          coverImage: await fileToBuffer(coverImageFile),
        });
      }

      return [...photoItems, ...videoItems].slice(0, INSTAGRAM_ALBUM_MAX_ITEMS);
    }

    return {
      async syncPost(args) {
        const { tweet, log } = args;
        if (args.store.success) {
          args.log.info("skipping...");
          return { store: args.store.data };
        }

        const photos = await tweet.getPhotos();
        const videos = await tweet.getVideos();
        const albumItems = await getAlbumItems(photos, videos);

        if (albumItems.length === 0) {
          log.warn(
            `📸 | post skipped: Instagram requires downloaded image or video media (tweet: ${tweet.id})`,
          );
          return;
        }

        const caption = trimCaption(tweet.text || tweet.permanentUrl || VOID);
        log.text = `📸 | post sending: ${getPostExcerpt(caption)}`;

        let response: InstagramPublishResponse;
        if (albumItems.length === 1) {
          const item = albumItems[0]!;
          response =
            "file" in item
              ? await ig.publish.photo({
                  file: item.file,
                  caption,
                })
              : await ig.publish.video({
                  video: item.video,
                  coverImage: item.coverImage,
                  caption,
                });
        } else {
          response = await ig.publish.album({
            caption,
            items: albumItems,
          });
        }

        await cacheSession(db, username, ig);
        oraProgress(log, { before: "📸 | post sending: " }, 1, 1);
        debug("Published Instagram media:", response);

        return {
          store: {
            mediaId: getPublishedMediaId(response),
          },
        };
      },
    };
  },
};
