import {
  $Typed,
  Agent,
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedVideo,
  AppBskyFeedPost,
  BskyAgent,
  ComAtprotoRepoUploadBlob,
  CredentialSession,
  RichText,
} from "@atproto/api";
import { Image as BlueskyImage } from "@atproto/api/dist/client/types/app/bsky/embed/images";
import { Photo } from "@the-convocation/twitter-scraper";
import { BACKDATE_BLUESKY_POSTS, DEBUG, VOID } from "env";
import {
  buildReplyEntry,
  getBlueskyChunkLinkMetadata,
} from "sync/platforms/bluesky/utils";
import { parseBlobForBluesky } from "sync/platforms/bluesky/utils/parse-blob-for-bluesky";
import { splitTextForBluesky } from "sync/platforms/bluesky/utils/split-text";

import { getPostStore, getPostStoreStr } from "utils/get-post-store";
import { logError, oraProgress } from "utils/logs";
import { getPostExcerpt } from "utils/post/get-post-excerpt";
// import { downloadTweet } from "utils/tweet/download-tweet";
import z from "zod";

import { SynchronizerFactory } from "../../synchronizer";
import { syncProfile } from "./sync-profile";
import { BLUESKY_KEYS, BlueskyPlatformStore, BlueskyPost } from "./types";

export const PostRefArraySchema = z.array(BlueskyPlatformStore);
export type PostRefArray = z.infer<typeof PostRefArraySchema>;

const BLUESKY_MEDIA_IMAGES_MAX_COUNT = 4;
const RKEY_REGEX = /\/(?<rkey>\w+)$/;

export async function getExternalEmbedding(
  richText: RichText,
  agent: Agent,
): Promise<$Typed<AppBskyEmbedExternal.Main> | undefined> {
  try {
    const card = await getBlueskyChunkLinkMetadata(richText, agent);
    if (!card) {
      return;
    }
    if (!card.url) {
      if (DEBUG) console.warn("Card has no URL", card);
      return;
    }
    const externalRecord: $Typed<AppBskyEmbedExternal.Main> = {
      $type: "app.bsky.embed.external",
      external: {
        uri: card.url,
        title: card.title,
        description: card.description,
        thumb: card.image?.data.blob,
        $type: "app.bsky.embed.external#external",
      },
    };
    return externalRecord;
  } catch (e) {
    return undefined;
  }
}

export const BlueskySynchronizerFactory: SynchronizerFactory<
  typeof BLUESKY_KEYS,
  typeof BlueskyPlatformStore
> = {
  DISPLAY_NAME: "Bluesky",
  PLATFORM_ID: "bluesky",
  EMOJI: "☁️",
  ENV_KEYS: BLUESKY_KEYS,
  FALLBACK_ENV: {
    BLUESKY_INSTANCE: "bsky.social",
  },
  STORE_SCHEMA: BlueskyPlatformStore,

  create: async (args) => {
    const blueskyInstance = args.env.BLUESKY_INSTANCE;

    const session = new CredentialSession(
      new URL(`https://${blueskyInstance}`),
    );

    // ? there is literally no documentation on the alternative
    const agent = new BskyAgent(session);
    const identifier = args.env.BLUESKY_IDENTIFIER;
    const password = args.env.BLUESKY_PASSWORD;
    const platformId = BlueskySynchronizerFactory.PLATFORM_ID;
    const env = args.env;
    const db = args.db;

    await agent.login({
      identifier,
      password,
    });

    async function getPostFromTid(
      tid?: string,
    ): Promise<ReturnType<typeof agent.getPost> | void> {
      if (!tid) return;
      const storeRes = await getPostStore({
        db,
        platformId,
        tweet: tid,
        s: BlueskyPlatformStore,
      });
      if (!storeRes.success) return;
      const store = storeRes.data;
      const post = await agent.getPost({
        cid: store.cid,
        rkey: store.rkey,
        repo: env.BLUESKY_IDENTIFIER,
      });
      return post;
    }

    return {
      ...syncProfile({ agent }),
      syncPost: async (args) => {
        const { tweet, log } = args;
        if (args.store.success) {
          args.log.info("skipping...");
          return {
            store: args.store.data,
          };
        }
        const username = await agent
          .getProfile({ actor: env.BLUESKY_IDENTIFIER })
          .then((account) => account.data.handle);

        const quotePost =
          (await getPostFromTid(tweet?.quotedStatus?.id)) ?? undefined;
        const replyPost =
          (await getPostFromTid(tweet.inReplyToStatusId)) ?? undefined;

        const richText = new RichText({ text: tweet.text });
        await richText.detectFacets(agent);

        const post: BlueskyPost = {
          chunks: await splitTextForBluesky(tweet),
          username,
          replyPost,
          quotePost,
          tweet,
        };

        const quoteRecord: $Typed<AppBskyEmbedRecord.Main> | undefined =
          post.quotePost
            ? {
              $type: "app.bsky.embed.record",
              record: {
                $type: "com.atproto.repo.strongRef",
                cid: post.quotePost.cid,
                uri: post.quotePost.uri,
              },
            }
            : undefined;

        let media:
          | $Typed<AppBskyEmbedImages.Main>
          | $Typed<AppBskyEmbedVideo.Main>
          | undefined = undefined;

        const externalRecord = await getExternalEmbedding(richText, agent);

        const videos = await tweet.videoFiles();
        const photos = await tweet.photoFiles();

        if (videos.length >= 1 && videos[0].file) {
          log.text = `Uploading video to bluesky...`;
          if (videos.length > 1) {
            log.warn(`Unable to upload all ${videos.length} videos`);
          }
          const [video] = videos;
          try {
            const blob = await parseBlobForBluesky(video.file!);
            const uploadRes = await agent.uploadBlob(blob.blobData, {
              encoding: blob.mimeType,
            });
            media = {
              $type: "app.bsky.embed.video",
              video: uploadRes.data.blob,
            };
          } catch (e) {
            logError(log, e)`Error while uploading video to bluesky: ${e}`;
          }
        } else if (photos.length) {
          const photoRes: [
            ComAtprotoRepoUploadBlob.Response,
            twitter: Photo,
          ][] = [];
          for (let i = 0; i < photos.length; i++) {
            if (i >= BLUESKY_MEDIA_IMAGES_MAX_COUNT) {
              log.warn(`${photos.length} photos is too much for bluesky...`);
              break;
            }
            const photo = photos[i];
            if (!photo.file) {
              log.warn(`can't download ${photos}...`);
              continue;
            }
            try {
              const blob = await parseBlobForBluesky(photo.file);
              photoRes.push([
                await agent.uploadBlob(blob.blobData, {
                  encoding: blob.mimeType,
                }),
                photo,
              ]);
            } catch (e) {
              logError(log, e)`Failed to parse ${photo} for bluesky: ${e}`;
            }
          }

          if (photoRes.length) {
            media = {
              $type: "app.bsky.embed.images",
              images: photoRes.map(
                ([i, p]) =>
                  ({
                    alt: p.alt_text ?? "",
                    image: i.data.blob,
                  }) as BlueskyImage,
              ),
            };
          }
        }

        if (!media) {
          log.info(`no media to upload for tweet ${tweet.id}`);
        }

        if (!media && !post.tweet.text) {
          log.warn(
            `☁️ | post skipped: no compatible media nor text to post (tweet: ${post.tweet.id})`,
          );
          return;
        }

        let firstEmbed: AppBskyFeedPost.Record["embed"] = undefined;
        // Handle the different embed combinations correctly
        if (quoteRecord && media) {
          // --- Case 1: Post has both a quote and media ---
          firstEmbed = {
            $type: "app.bsky.embed.recordWithMedia",
            record: quoteRecord, // This is the embed record for the quote
            media: media, // This is the embed for images/video
          };
        } else if (quoteRecord) {
          // --- Case 2: Post has only a quote ---
          firstEmbed = quoteRecord;
        } else if (media) {
          // --- Case 3: Post has only media ---
          // Use the media embed directly (e.g., app.bsky.embed.images)
          firstEmbed = media;
        } else {
          // --- Case 4: No quote or media, fall back to checking for external link cards ---
          firstEmbed = externalRecord;
        }

        const chunkReferences: Array<
          {
            cid: string;
            rkey: string;
          } & { uri: string }
        > = [];

        if (DEBUG) {
          console.log({ firstEmbed });
        }
        
        for (let i = 0; i < post.chunks.length; i++) {
          const chunk = post.chunks[i];

          if (DEBUG) {
            console.log("bluesky post chunk: ", chunk);
          }

          const richText = new RichText({ text: chunk });
          await richText.detectFacets(agent);

          const createdAt = (BACKDATE_BLUESKY_POSTS ? tweet.datetime : new Date(Date.now())).toISOString();
          const data: $Typed<AppBskyFeedPost.Record> = {
            $type: "app.bsky.feed.post",
            text: richText.text,
            facets: richText.facets,
            createdAt,
          };
          if (i === 0 && firstEmbed) {
            data.embed = firstEmbed;
          } else {
            data.embed = await getExternalEmbedding(richText, agent);
          }
          if (i === 0) {
            if (post.replyPost) {
              if (post.replyPost.value.reply) {
                data.reply = buildReplyEntry(
                  post.replyPost.value.reply.root,
                  post.replyPost,
                );
              } else {
                data.reply = buildReplyEntry(post.replyPost);
              }
            }
          } else {
            data.reply = buildReplyEntry(
              chunkReferences[0],
              chunkReferences[i - 1],
            );
          }
          log.text = `☁️ | post sending: ${getPostExcerpt(post.tweet.text ?? VOID)}`;
          if (DEBUG) console.log("data", data)
          const createdPost = await agent.post(data);
          oraProgress(
            log,
            { before: "☁️ | post sending: " },
            i,
            post.chunks.length,
          );
          if (DEBUG) console.log("createdPost", createdPost)
          chunkReferences.push({
            cid: createdPost.cid,
            uri: createdPost.uri,
            rkey: RKEY_REGEX.exec(createdPost.uri)?.groups?.["rkey"] ?? "",
          });
        }
        return {
          store: chunkReferences[0],
        };
      },
    };
  },
};
