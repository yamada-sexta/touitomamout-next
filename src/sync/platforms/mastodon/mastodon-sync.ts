import { HANDLE_RETWEETS, SYNC_MASTODON, VOID } from "#app/env";
import { createRestAPIClient } from "masto";
import { type MediaAttachment } from "masto/mastodon/entities/v1/index.js";
import { type UpdateCredentialsParams } from "masto/mastodon/rest/v1/accounts.js";
import { splitTextForMastodon } from "#app/sync/platforms/mastodon/text";
import { getPostStore } from "#app/utils/get-post-store";
import { debug, oraProgress } from "#app/utils/logs";
import { getPostExcerpt } from "#app/utils/post/get-post-excerpt";
import {
  encodeMultipart,
  type MultipartField,
} from "#app/utils/http/multipart";
import z from "zod";
import { MASTODON_PLATFORM_ID, MastodonStoreSchema } from "./store";
import {
  defineSynchronizerFactory,
  envString,
  envURLWithDefault,
} from "../../synchronizer";

const MastodonEnvSchema = z.object({
  MASTODON_INSTANCE: envURLWithDefault("mastodon.social"),
  MASTODON_ACCESS_TOKEN: envString,
});

export const MastodonSynchronizerFactory = defineSynchronizerFactory({
  DISPLAY_NAME: "Mastodon",
  PLATFORM_ID: MASTODON_PLATFORM_ID,
  STORE_SCHEMA: MastodonStoreSchema,
  EMOJI: "🦣",
  ENV_SCHEMA: MastodonEnvSchema,
  async create(args) {
    if (!SYNC_MASTODON) {
      throw new Error("Mastodon will not be synced");
    }

    const client = createRestAPIClient({
      url: args.env.MASTODON_INSTANCE.href,
      accessToken: args.env.MASTODON_ACCESS_TOKEN,
    });
    await client.v1.accounts.verifyCredentials();
    const { db, env } = args;

    const multipartRequest = async <T>(
      path: string,
      method: "PATCH" | "POST",
      fields: MultipartField[],
    ): Promise<T> => {
      const { body, contentType } = await encodeMultipart(fields);
      const base = env.MASTODON_INSTANCE.href.replace(/\/$/, "");
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}`,
          "content-type": contentType,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `Mastodon request failed (${response.status}): ${await response.text()}`,
        );
      }

      return (await response.json()) as T;
    };

    const updateCredentials = async (params: UpdateCredentialsParams) => {
      const fields: MultipartField[] = [];
      if (params.note != null) {
        fields.push({ name: "note", value: params.note });
      }
      if (params.displayName != null) {
        fields.push({ name: "display_name", value: params.displayName });
      }
      if (params.avatar != null) {
        fields.push({ name: "avatar", value: params.avatar });
      }
      if (params.header != null) {
        fields.push({ name: "header", value: params.header });
      }

      await multipartRequest(
        "/api/v1/accounts/update_credentials",
        "PATCH",
        fields,
      );
    };

    const uploadMedia = (fields: MultipartField[]) =>
      multipartRequest<MediaAttachment>("/api/v2/media", "POST", fields);

    return {
      async syncBio(args) {
        await updateCredentials({ note: args.formattedBio });
      },
      async syncProfilePic(args) {
        const avatar = new File([args.pfpFile], "profile", {
          type: args.pfpFile.type,
        });
        await updateCredentials({ avatar });
      },
      async syncBanner(args) {
        const header = new File([args.bannerFile], "header", {
          type: args.bannerFile.type,
        });
        await updateCredentials({ header });
      },
      async syncUserName(args) {
        await updateCredentials({ displayName: args.name });
      },

      async syncPost(args) {
        const { tweet, log } = args;
        if (args.store.success) {
          args.log.info("skipping...");
          return {
            store: args.store.data,
          };
        }

        const username = await client.v1.accounts
          .verifyCredentials()
          .then((account) => account.username);

        if (tweet.isRetweet && tweet.retweetedStatus) {
          const store = await getPostStore({
            s: MastodonStoreSchema,
            db,
            tweet: tweet.retweetedStatus.id,
            platformId: MASTODON_PLATFORM_ID,
          });

          if (HANDLE_RETWEETS === "none") {
            log.info("skipping retweet");
            return;
          }

          if (HANDLE_RETWEETS === "repost" && store.success) {
            const tootId = store.data.tootIds.at(-1);
            if (tootId) {
              log.text = `🦣 | reposting: ${getPostExcerpt(tweet.retweetedStatus.text ?? VOID)}`;
              await client.v1.statuses.$select(tootId).reblog();
              return {
                store: store.data,
              };
            }
          }

          if (
            (HANDLE_RETWEETS === "repost" || HANDLE_RETWEETS === "embed") &&
            tweet.retweetedStatus.embLink
          ) {
            log.text = `🦣 | repost fallback: ${getPostExcerpt(tweet.retweetedStatus.text ?? VOID)}`;
            const toot = await client.v1.statuses.create({
              status: tweet.retweetedStatus.embLink,
              visibility: "public",
            });
            return {
              store: {
                tootIds: [toot.id],
              },
            };
          }

          return;
        }

        const mastodonText = await splitTextForMastodon({
          tweet,
          db,
          mastodonInstance: env.MASTODON_INSTANCE,
          mastodonUsername: username,
        });
        const { chunks } = mastodonText;

        // Const dt = await downloadTweet(tweet);
        const attachments: MediaAttachment[] = [];

        for (const p of await tweet.getPhotos()) {
          debug("Uploading photo to Mastodon:", p);

          if (!p.file) {
            continue;
          }

          // This somehow fix it?
          const file = new File([p.file], "upload.jpg", {
            type: p.file.type,
          });
          const fields: MultipartField[] = [{ name: "file", value: file }];
          if (p.alt_text) {
            fields.push({ name: "description", value: p.alt_text });
          }
          const a = await uploadMedia(fields);

          attachments.push(a);
          debug("Uploaded photo to Mastodon:", a);
        }

        for (const v of await tweet.getVideos()) {
          debug("Uploading video to Mastodon:", v);

          if (!v.file) {
            continue;
          }

          const file = new File([v.file], "upload.mp4", {
            type: v.file.type,
          });
          const a = await uploadMedia([{ name: "file", value: file }]);
          attachments.push(a);
          debug("Uploaded video to Mastodon:", a);
        }

        if (attachments.length === 0 && chunks.length === 0) {
          log.warn(
            `🦣️ | post skipped: no compatible media nor text to post (tweet: ${tweet.id})`,
          );
          return;
        }

        log.text = `🦣 | toot sending: ${getPostExcerpt(tweet.text ?? VOID)}`;

        const tootIds: string[] = [];
        for await (const [i, chunk] of chunks.entries()) {
          const first = i === 0;
          debug("Mastodon chunk to post:", {
            chunk,
            index: i,
            total: chunks.length,
          });

          const toot = await client.v1.statuses.create({
            status: chunk,
            visibility: "public",
            mediaIds: first ? attachments.map((m) => m.id) : undefined,
            inReplyToId: first ? mastodonText.inReplyToId : tootIds[i - 1],
            quotedStatusId: first ? mastodonText.quotedStatusId : undefined,
          });
          oraProgress(log, { before: "🦣 | toot sending: " }, i, chunks.length);
          // Save toot ID to be able to reference it while posting the next chunk.
          tootIds.push(toot.id);
          // If this is the last chunk, save the all chunks ID to the cache.
          if (i === chunks.length - 1) {
            debug("Final toot posted:", toot);
          }
        }

        return {
          store: {
            tootIds,
          },
        };
      },
    };
  },
});
