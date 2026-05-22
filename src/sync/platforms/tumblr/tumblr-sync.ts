import { createClient, type Client } from "tumblr.js";
import { VOID } from "env";
import { type MetaPost } from "types/post";
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
});

type TumblrCreatePostParams = Parameters<Client["createPost"]>[1];
type TumblrContentBlock = TumblrCreatePostParams["content"][number];

const TumblrCreatePostResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
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
    const client = createClient({
      consumer_key: factoryArgs.env.TUMBLR_CONSUMER_KEY,
      consumer_secret: factoryArgs.env.TUMBLR_CONSUMER_SECRET,
      token: factoryArgs.env.TUMBLR_TOKEN,
      token_secret: factoryArgs.env.TUMBLR_TOKEN_SECRET,
    });

    const userInfo = await client.userInfo();
    const blogIdentifier = getTumblrBlogIdentifier(userInfo);
    await client.blogInfo(blogIdentifier);

    return {
      async syncPost(args) {
        if (args.store.success) {
          args.log.info("skipping...");
          return { store: args.store.data };
        }

        const content = buildContent(args.tweet);
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
        const parsed = TumblrCreatePostResponseSchema.safeParse(response);
        if (!parsed.success) {
          throw new Error(
            `Tumblr createPost returned an unexpected response: ${JSON.stringify(response)}`,
          );
        }

        return {
          store: {
            id: parsed.data.id,
          },
        };
      },
    };
  },
};
