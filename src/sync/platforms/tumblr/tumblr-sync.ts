import { createClient, type Client } from "tumblr.js";
import { HANDLE_RETWEETS, VOID } from "env";
import { type MetaPost, toStatusEmbLink } from "types/post";
import { getPostStore } from "utils/get-post-store";
import { debug } from "utils/logs";
import { getPostExcerpt } from "utils/post/get-post-excerpt";
import z from "zod";
import { type SynchronizerFactory } from "../../synchronizer";

const KEYS = [
  "TUMBLR_CONSUMER_KEY",
  "TUMBLR_CONSUMER_SECRET",
  "TUMBLR_TOKEN",
  "TUMBLR_TOKEN_SECRET",
] as const;

const TumblrStoreSchema = z.object({
  id: z.string(),
  reblogKey: z.string().optional(),
});

type TumblrCreatePostParams = Parameters<Client["createPost"]>[1];
type TumblrContentBlock = TumblrCreatePostParams["content"][number];

const TumblrCreatePostResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  reblog_key: z.string().optional(),
  reblogKey: z.string().optional(),
  post: z
    .object({
      reblog_key: z.string().optional(),
      reblogKey: z.string().optional(),
    })
    .optional(),
});

const TumblrPostInfoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  reblog_key: z.string().optional(),
  reblogKey: z.string().optional(),
});

const TumblrBlogPostsResponseSchema = z.object({
  posts: z.array(TumblrPostInfoSchema),
});

const TumblrUserInfoSchema = z.object({
  user: z.object({
    blogs: z.array(
      z.object({
        name: z.string().optional(),
        url: z.string().optional(),
        primary: z.boolean().optional(),
      }),
    ),
  }),
});

function buildContent(tweet: MetaPost): TumblrContentBlock[] {
  const content: TumblrContentBlock[] = [];

  if (tweet.text) {
    content.push({
      type: "text",
      text: tweet.text,
    });
  }

  for (const photo of tweet.photos) {
    content.push({
      type: "image",
      media: {
        url: photo.url,
      },
      alt_text: photo.alt_text,
    });
  }

  for (const video of tweet.videos) {
    const mediaUrl = video.url ?? video.preview;
    content.push({
      type: "video",
      media: {
        url: mediaUrl,
      },
    });
  }

  return content;
}

function buildLinkEmbedContent(url: string): TumblrContentBlock[] {
  return [
    {
      type: "link",
      url,
    },
  ];
}

function buildPostLinkEmbedContent(tweet: MetaPost): TumblrContentBlock[] {
  const posterUrl = tweet.photos[0]?.url ?? tweet.videos[0]?.preview;
  return [
    {
      type: "link",
      url: tweet.embLink ?? tweet.permanentUrl ?? toStatusEmbLink(tweet.id),
      title: `${tweet.name ?? tweet.username ?? "Post"}${tweet.username ? ` (@${tweet.username})` : ""}`,
      description: tweet.text ?? "",
      author: tweet.name ?? tweet.username,
      site_name: "X",
      display_url: "x.com",
      poster: posterUrl
        ? [
            {
              url: posterUrl,
            },
          ]
        : undefined,
    },
  ];
}

function getTumblrBlogIdentifier(userInfo: unknown): string {
  const parsed = TumblrUserInfoSchema.safeParse(userInfo);
  if (!parsed.success) {
    throw new Error(
      `Unable to infer Tumblr blog identifier from userInfo(): ${parsed.error.message}`,
    );
  }

  const blog =
    parsed.data.user.blogs.find((blog) => blog.primary) ??
    parsed.data.user.blogs[0];
  const identifier = blog?.name ?? blog?.url;
  if (!identifier) {
    throw new Error("Unable to infer Tumblr blog identifier from userInfo().");
  }

  return identifier;
}

function getReblogKey(
  response: z.infer<typeof TumblrCreatePostResponseSchema>,
) {
  return (
    response.reblog_key ??
    response.reblogKey ??
    response.post?.reblog_key ??
    response.post?.reblogKey
  );
}

export const TumblrSynchronizerFactory: SynchronizerFactory<
  typeof KEYS,
  typeof TumblrStoreSchema
> = {
  EMOJI: "🅣",
  DISPLAY_NAME: "Tumblr",
  PLATFORM_ID: "tumblr",
  ENV_KEYS: KEYS,
  STORE_SCHEMA: TumblrStoreSchema,
  async create(factoryArgs) {
    const { db } = factoryArgs;
    const client = createClient({
      consumer_key: factoryArgs.env.TUMBLR_CONSUMER_KEY,
      consumer_secret: factoryArgs.env.TUMBLR_CONSUMER_SECRET,
      token: factoryArgs.env.TUMBLR_TOKEN,
      token_secret: factoryArgs.env.TUMBLR_TOKEN_SECRET,
    });

    const userInfo = await client.userInfo();
    const blogIdentifier = getTumblrBlogIdentifier(userInfo);
    await client.blogInfo(blogIdentifier);

    async function getPostReblogKey(
      postId: string,
    ): Promise<string | undefined> {
      const response = await client.blogPosts(blogIdentifier, {
        id: postId,
        reblog_info: true,
        npf: true,
      } as Parameters<Client["blogPosts"]>[1]);

      const parsed = TumblrBlogPostsResponseSchema.safeParse(response);
      if (!parsed.success) {
        debug("Unable to parse Tumblr blogPosts response:", response);
        return;
      }

      return (
        parsed.data.posts.find((post) => post.id === postId)?.reblog_key ??
        parsed.data.posts.find((post) => post.id === postId)?.reblogKey
      );
    }

    async function storeFromResponse(response: unknown) {
      const parsed = TumblrCreatePostResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error(
          `Tumblr returned an unexpected response: ${JSON.stringify(response)}`,
        );
      }

      return {
        id: parsed.data.id,
        reblogKey:
          getReblogKey(parsed.data) ?? (await getPostReblogKey(parsed.data.id)),
      };
    }

    async function reblogSyncedPost(args: {
      store: z.infer<typeof TumblrStoreSchema>;
      comment?: string;
    }): Promise<z.infer<typeof TumblrStoreSchema> | undefined> {
      const reblogKey =
        args.store.reblogKey ?? (await getPostReblogKey(args.store.id));

      if (!reblogKey) {
        debug("Unable to find Tumblr reblog key:", args.store);
        return;
      }

      const response = await client.reblogPost(blogIdentifier, {
        id: args.store.id,
        reblog_key: reblogKey,
        comment: args.comment,
      });

      debug("Tumblr reblog response:", response);
      return storeFromResponse(response);
    }

    return {
      async syncPost(args) {
        if (args.store.success) {
          args.log.info("skipping...");
          return { store: args.store.data };
        }

        if (
          (HANDLE_RETWEETS === "repost" || HANDLE_RETWEETS === "embed") &&
          args.tweet.isRetweet &&
          args.tweet.retweetedStatus
        ) {
          if (HANDLE_RETWEETS === "repost") {
            const rebloggedStore = await getPostStore({
              s: TumblrStoreSchema,
              db,
              tweet: args.tweet.retweetedStatus.id,
              platformId: TumblrSynchronizerFactory.PLATFORM_ID,
            });

            if (rebloggedStore.success) {
              args.log.text = `🅣 | reblogging: ${getPostExcerpt(
                args.tweet.retweetedStatus.text ?? VOID,
              )}`;
              const store = await reblogSyncedPost({
                store: rebloggedStore.data,
              });
              if (store) {
                return {
                  store,
                };
              }
            }
          }

          if (args.tweet.retweetedStatus.embLink) {
            args.log.text = `🅣 | embedding retweet: ${getPostExcerpt(
              args.tweet.retweetedStatus.text ?? VOID,
            )}`;
            const response = await client.createPost(blogIdentifier, {
              content: buildPostLinkEmbedContent(args.tweet.retweetedStatus),
              date: args.tweet.datetime.toISOString(),
            });

            debug("Tumblr reblog fallback response:", response);
            return {
              store: await storeFromResponse(response),
            };
          }

          return;
        }

        const content = buildContent(args.tweet);
        if (args.tweet.quotedStatusId) {
          const quotedStore = await getPostStore({
            s: TumblrStoreSchema,
            db,
            tweet: args.tweet.quotedStatusId,
            platformId: TumblrSynchronizerFactory.PLATFORM_ID,
          });

          if (quotedStore.success) {
            args.log.text = `🅣 | reblogging quote: ${getPostExcerpt(args.tweet.text ?? VOID)}`;
            const store = await reblogSyncedPost({
              store: quotedStore.data,
              comment: args.tweet.text,
            });
            if (store) {
              return { store };
            }
          } else if (args.tweet.quotedStatus?.embLink) {
            content.push(...buildPostLinkEmbedContent(args.tweet.quotedStatus));
          }
        }

        if (args.tweet.inReplyToStatusId) {
          const replyStore = await getPostStore({
            s: TumblrStoreSchema,
            db,
            tweet: args.tweet.inReplyToStatusId,
            platformId: TumblrSynchronizerFactory.PLATFORM_ID,
          });

          if (replyStore.success) {
            args.log.text = `🅣 | reblogging reply: ${getPostExcerpt(args.tweet.text ?? VOID)}`;
            const store = await reblogSyncedPost({
              store: replyStore.data,
              comment: args.tweet.text,
            });
            if (store) {
              return { store };
            }
          } else {
            content.push(
              ...buildLinkEmbedContent(
                toStatusEmbLink(args.tweet.inReplyToStatusId),
              ),
            );
          }
        }

        if (content.length === 0) {
          args.log.warn(
            `🅣 | post skipped: no compatible media nor text to post (tweet: ${args.tweet.id})`,
          );
          return;
        }

        args.log.text = `🅣 | post sending: ${getPostExcerpt(args.tweet.text ?? VOID)}`;

        const response = await client.createPost(blogIdentifier, {
          content,
          date: args.tweet.datetime.toISOString(),
        });

        debug("Tumblr post response:", response);

        return {
          store: await storeFromResponse(response),
        };
      },
    };
  },
};
