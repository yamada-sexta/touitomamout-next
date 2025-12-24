import {
  type $Typed,
  Agent,
  type AppBskyEmbedExternal,
  type AppBskyEmbedImages,
  type AppBskyEmbedRecord,
  type AppBskyEmbedVideo,
  type AppBskyFeedPost,
  type ComAtprotoRepoUploadBlob,
  CredentialSession,
  RichText,
} from "@atproto/api";
import { type Image as BlueskyImage } from "@atproto/api/dist/client/types/app/bsky/embed/images";
import { BACKDATE_BLUESKY_POSTS, HANDLE_RETWEETS, VOID } from "env";
import {
  buildReplyEntry,
  getBlueskyChunkLinkMetadata,
} from "sync/platforms/bluesky/utils";
import { parseBlobForBluesky } from "sync/platforms/bluesky/utils/parse-blob-for-bluesky";
import { splitTextForBluesky } from "sync/platforms/bluesky/utils/split-text";
import { getPostStore } from "utils/get-post-store";
import { debug, logError, oraProgress } from "utils/logs";
import { getPostExcerpt } from "utils/post/get-post-excerpt";
import z from "zod";
import { type Photo } from "types/post";
import { type SynchronizerFactory } from "../../synchronizer";
import { syncProfile } from "./sync-profile";
import { BLUESKY_KEYS, BlueskyPlatformStore, type BlueskyPost } from "./types";

export const PostRefArraySchema = z.array(BlueskyPlatformStore);
export type PostRefArray = z.infer<typeof PostRefArraySchema>;

const BLUESKY_MEDIA_IMAGES_MAX_COUNT = 4;
const RKEY_REGEX = /\/(?<rkey>\w+)$/;

export async function getExternalEmbedding(
  richText: RichText,
  agent: Agent
): Promise<$Typed<AppBskyEmbedExternal.Main> | undefined> {
  try {
    const card = await getBlueskyChunkLinkMetadata(richText, agent);
    if (!card) {
      return;
    }

    if (!card.url) {
      debug("Card has no URL", card);
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
  } catch {
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

  async create(args) {
    const blueskyInstance = args.env.BLUESKY_INSTANCE;

    const session = new CredentialSession(
      new URL(`https://${blueskyInstance}`)
    );

    const agent = new Agent(session);
    const identifier = args.env.BLUESKY_IDENTIFIER;
    const password = args.env.BLUESKY_PASSWORD;
    const platformId = BlueskySynchronizerFactory.PLATFORM_ID;
    const { env } = args;
    const { db } = args;

    await session.login({
      identifier,
      password,
    });

    async function getPostFromTid(
      tid?: string
    ): Promise<ReturnType<typeof agent.getPost> | void> {
      if (!tid) {
        return;
      }

      const storeRes = await getPostStore({
        db,
        platformId,
        tweet: tid,
        s: BlueskyPlatformStore,
      });
      if (!storeRes.success) {
        return;
      }

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
      async syncPost(args) {
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

        if (
          HANDLE_RETWEETS === "embed" &&
          tweet.isRetweet &&
          tweet.retweetedStatus
        ) {
          const embedUrl = tweet.retweetedStatus.embLink;
          if (embedUrl) {
            log.info(
              `☁️ | post sending: ${getPostExcerpt(
                tweet.text ?? VOID
              )} (as embed retweet)`
            );
            const richText = new RichText({ text: embedUrl });
            await richText.detectFacets(agent);
            const externalRecord = await getExternalEmbedding(richText, agent);

            const createdAt = (
              BACKDATE_BLUESKY_POSTS ? tweet.datetime : new Date(Date.now())
            ).toISOString();
            const data: $Typed<AppBskyFeedPost.Record> = {
              $type: "app.bsky.feed.post",
              text: richText.text,
              facets: richText.facets,
              createdAt,
              embed: externalRecord,
            };

            debug("posting to bluesky:", data);
            const createdPost = await agent.post(data);
            debug("createdPost on bsky", createdPost);

            return {
              store: {
                cid: createdPost.cid,
                rkey: RKEY_REGEX.exec(createdPost.uri)?.groups?.rkey ?? "",
              },
            };
          }
        }

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
          | undefined;

        const externalRecord = await getExternalEmbedding(richText, agent);

        const videos = await tweet.getVideos();
        const photos = await tweet.getPhotos();

        if (videos.length > 0 && videos[0].file) {
          log.text = "Uploading video to bluesky...";
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
          } catch (error) {
            logError(
              log,
              error
            )`Error while uploading video to bluesky: ${error}`;
          }
        } else if (photos.length > 0) {
          const photoRes: Array<
            [ComAtprotoRepoUploadBlob.Response, twitter: Photo]
          > = [];
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
            } catch (error) {
              logError(
                log,
                error
              )`Failed to parse ${photo} for bluesky: ${error}`;
            }
          }

          if (photoRes.length > 0) {
            media = {
              $type: "app.bsky.embed.images",
              images: photoRes.map(
                ([i, p]) =>
                  ({
                    alt: p.alt_text ?? "",
                    image: i.data.blob,
                  }) as BlueskyImage
              ),
            };
          }
        }

        if (!media) {
          log.info(`no media to upload for tweet ${tweet.id}`);
        }

        if (!media && !post.tweet.text) {
          log.warn(
            `☁️ | post skipped: no compatible media nor text to post (tweet: ${post.tweet.id})`
          );
          return;
        }

        let firstEmbed: AppBskyFeedPost.Record["embed"];
        // Handle the different embed combinations correctly
        if (quoteRecord && media) {
          // --- Case 1: Post has both a quote and media ---
          firstEmbed = {
            $type: "app.bsky.embed.recordWithMedia",
            record: quoteRecord, // This is the embed record for the quote
            media, // This is the embed for images/video
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

        debug("first embed bsky:", { firstEmbed });

        for (let i = 0; i < post.chunks.length; i++) {
          const chunk = post.chunks[i];

          debug("bluesky post chunk: ", chunk);

          const richText = new RichText({ text: chunk });
          await richText.detectFacets(agent);

          const createdAt = (
            BACKDATE_BLUESKY_POSTS ? tweet.datetime : new Date(Date.now())
          ).toISOString();
          const data: $Typed<AppBskyFeedPost.Record> = {
            $type: "app.bsky.feed.post",
            text: richText.text,
            facets: richText.facets,
            createdAt,
          };
          data.embed =
            i === 0 && firstEmbed
              ? firstEmbed
              : await getExternalEmbedding(richText, agent);

          if (i === 0) {
            if (post.replyPost) {
              if (post.replyPost.value.reply) {
                data.reply = buildReplyEntry(
                  post.replyPost.value.reply.root,
                  post.replyPost
                );
              } else {
                data.reply = buildReplyEntry(post.replyPost);
              }
            }
          } else {
            data.reply = buildReplyEntry(
              chunkReferences[0],
              chunkReferences[i - 1]
            );
          }

          log.text = `☁️ | post sending: ${getPostExcerpt(post.tweet.text ?? VOID)}`;
          debug("posting to bluesky:", data);
          const createdPost = await agent.post(data);
          oraProgress(
            log,
            { before: "☁️ | post sending: " },
            i,
            post.chunks.length
          );
          debug("createdPost on bsky", createdPost);
          chunkReferences.push({
            cid: createdPost.cid,
            uri: createdPost.uri,
            rkey: RKEY_REGEX.exec(createdPost.uri)?.groups?.rkey ?? "",
          });
        }

        return {
          store: chunkReferences[0],
        };
      },
    };
  },
};
