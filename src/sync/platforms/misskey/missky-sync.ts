import { type SynchronizerFactory } from "sync/synchronizer";
import z from "zod";
import * as Misskey from "misskey-js";
import { DEBUG, HANDLE_RETWEETS } from "env";
import { toStatusEmbLink } from "types/post";
import { getPostStore } from "utils/get-post-store";
import { handleRateLimit } from "./rate-limit";

const KEYS = ["MISSKEY_INSTANCE", "MISSKEY_ACCESS_CODE"];
const MisskeyStoreSchema = z.object({
  id: z.string(),
});

export const MisskeySynchronizerFactory: SynchronizerFactory<
  typeof KEYS,
  typeof MisskeyStoreSchema
> = {
  EMOJI: "Ⓜ️",
  DISPLAY_NAME: "Misskey",
  PLATFORM_ID: "misskey",
  ENV_KEYS: KEYS,
  STORE_SCHEMA: MisskeyStoreSchema,
  async create(args) {
    const { db } = args;
    const api = new Misskey.api.APIClient({
      origin: `https://${args.env.MISSKEY_INSTANCE}`,
      credential: args.env.MISSKEY_ACCESS_CODE,
    });

    async function runWithRateLimitRetry<T = unknown>(
      task: () => Promise<T>,
    ): Promise<T> {
      try {
        return await task();
      } catch (error) {
        if (await handleRateLimit(error)) {
          return task();
        }

        throw error;
      }
    }

    const uploadMedia = async (file: File) =>
      runWithRateLimitRetry(async () =>
        api.request("drive/files/create", {
          file,
        }),
      );

    return {
      async syncBio(args) {
        await runWithRateLimitRetry(async () =>
          api.request("i/update", {
            description: args.formattedBio,
          }),
        );
      },
      async syncBanner(args) {
        await runWithRateLimitRetry(async () => {
          if (DEBUG) {
            console.log("Updating banner for Misskey");
          }

          const res = await uploadMedia(args.bannerFile);
          if (DEBUG) {
            console.log(res);
          }

          await api.request("i/update", { bannerId: res.id });
        });
      },
      async syncUserName(args) {
        await runWithRateLimitRetry(async () =>
          api.request("i/update", {
            name: args.name,
          }),
        );
      },
      async syncProfilePic(args) {
        await runWithRateLimitRetry(async () => {
          const res = await api.request("drive/files/create", {
            file: new File([args.pfpFile], "pfp"),
          });

          if (DEBUG) {
            console.log(res);
          }

          await api.request("i/update", { avatarId: res.id });
        });
      },
      async syncPost(args) {
        if (args.store.success) {
          args.log.info("skipping...");
          return {
            store: args.store.data,
          };
        }

        return runWithRateLimitRetry(async () => {
          const mediaIds: string[] = [];
          const t = args.tweet;
          let text = t.text;
          let replyId: string | undefined;
          let renoteId: string | undefined;

          if (t.inReplyToStatusId) {
            const replyStore = await getPostStore({
              s: MisskeyStoreSchema,
              db,
              tweet: t.inReplyToStatusId,
              platformId: MisskeySynchronizerFactory.PLATFORM_ID,
            });
            if (replyStore.success) {
              replyId = replyStore.data.id;
            } else {
              text =
                `${text ?? ""}\n\n${toStatusEmbLink(t.inReplyToStatusId)}`.trim();
            }
          }

          if (t.quotedStatusId) {
            const quoteStore = await getPostStore({
              s: MisskeyStoreSchema,
              db,
              tweet: t.quotedStatusId,
              platformId: MisskeySynchronizerFactory.PLATFORM_ID,
            });
            if (quoteStore.success) {
              renoteId = quoteStore.data.id;
            } else if (t.quotedStatus?.embLink) {
              text = `${text ?? ""}\n\n${t.quotedStatus.embLink}`.trim();
            }
          }

          if (t.isRetweet && t.retweetedStatus) {
            const renoteStore = await getPostStore({
              s: MisskeyStoreSchema,
              db,
              tweet: t.retweetedStatus.id,
              platformId: MisskeySynchronizerFactory.PLATFORM_ID,
            });

            if (HANDLE_RETWEETS === "none") {
              args.log.info("skipping retweet");
              return;
            }

            if (HANDLE_RETWEETS === "repost" && renoteStore.success) {
              const res = await api.request("notes/create", {
                renoteId: renoteStore.data.id,
              });
              return {
                store: {
                  id: res.createdNote.id,
                },
              };
            }

            if (
              (HANDLE_RETWEETS === "repost" || HANDLE_RETWEETS === "embed") &&
              t.retweetedStatus.embLink
            ) {
              text = t.retweetedStatus.embLink;
            } else {
              return;
            }
          }

          for (const p of await t.getPhotos()) {
            if (p.file) {
              mediaIds.push((await uploadMedia(p.file)).id);
            }
          }

          for (const v of await t.getVideos()) {
            if (v.file) {
              mediaIds.push((await uploadMedia(v.file)).id);
            }
          }
          const res = await api.request("notes/create", {
            text,
            mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
            replyId,
            renoteId,
          });
          if (DEBUG) {
            console.log(res);
          }

          return {
            store: {
              id: res.createdNote.id,
            },
          };
        });
      },
    };
  },
};
