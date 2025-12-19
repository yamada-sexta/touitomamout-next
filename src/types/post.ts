import { decode } from "html-entities";
import eldr from "@mailbutler/eldr/extra-small";
import { extractWordsAndSpacers } from "utils/tweet/split-tweet-text/extract-words-and-spacers";
import { buildChunksFromSplitterEntries } from "utils/tweet/split-tweet-text/split-tweet-text";
import { download } from "utils/medias/download-media";
import z from "zod";
import { debug } from "utils/logs";
import { X_EMB_FIX } from "env";

export const MentionSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
});

export const PhotoSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt_text: z.string().optional(),
});

export const VideoSchema = z.object({
  id: z.string(),
  preview: z.string(),
  url: z.string().optional(),
});

export const PlaceSchema = z.object({
  id: z.string().optional(),
  place_type: z.string().optional(),
  name: z.string().optional(),
  full_name: z.string().optional(),
  country_code: z.string().optional(),
  country: z.string().optional(),
  bounding_box: z
    .object({
      type: z.string().optional(),
      coordinates: z.array(z.array(z.array(z.number()))).optional(),
    })
    .optional(),
});

export const PostSchema = z.object({
  bookmarkCount: z.number().optional(),
  conversationId: z.string().optional(),
  hashtags: z.array(z.string()),
  id: z.string(),
  inReplyToStatus: z.string().optional(),
  inReplyToStatusId: z.string().optional(),
  isEdited: z.boolean().optional(),
  versions: z.array(z.string()).optional(),
  isQuoted: z.boolean().optional(),
  isPin: z.boolean().optional(),
  isReply: z.boolean().optional(),
  isRetweet: z.boolean().optional(),
  isSelfThread: z.boolean().optional(),
  likes: z.number().optional(),
  name: z.string().optional(),
  mentions: z.array(MentionSchema),
  permanentUrl: z.string().optional(),
  photos: z.array(PhotoSchema),
  place: PlaceSchema.optional(),
  get quotedStatus() {
    return PostSchema.optional();
  },
  quotedStatusId: z.string().optional(),
  replies: z.number().optional(),
  retweets: z.number().optional(),
  get retweetedStatus() {
    return PostSchema.optional();
  },
  retweetedStatusId: z.string().optional(),
  text: z.string().optional(),
  thread: z.array(z.any()),
  timestamp: z.number().optional(),
  urls: z.array(z.string()),
  userId: z.string().optional(),
  username: z.string().optional(),
  videos: z.array(VideoSchema),
  views: z.number().optional(),
  sensitiveContent: z.boolean().optional().default(false),
});

export type Post = z.infer<typeof PostSchema>;
export type Video = z.infer<typeof VideoSchema>;
export type Photo = z.infer<typeof PhotoSchema>;
export type Mention = z.infer<typeof MentionSchema>;

export type DownloadedVideo = Video & { file?: File };
export type DownloadedPhoto = Photo & { file?: File };

export function isPost(data: unknown): data is Post {
  const res = PostSchema.safeParse(data);
  if (!res.success) {
    debug("isPost: failed", res.error.issues);
  }

  return res.success;
}

type SplitTextArgBase = {
  maxChunkSize: number;
};

export type SplitTextArgs =
  | (SplitTextArgBase & {
      appendQuoteLink: false;
      quotedStatusLinkSection?: "";
    })
  | (SplitTextArgBase & {
      appendQuoteLink: true;
      quotedStatusLinkSection: string;
    });

export type MetaPost = {
  datetime: Date;
  rawText?: string;
  text: string;
  language: string;
  sensitiveContent: boolean;
  quotedStatus?: MetaPost;
  retweetedStatus?: MetaPost;
  embLink?: string;

  /**
   * Splits the post text into chunks for a target platform.
   */
  chunk: (args: SplitTextArgs) => Promise<string[]>;

  getVideos: () => Promise<DownloadedVideo[]>;
  getPhotos: () => Promise<DownloadedPhoto[]>;
} & Post;

export const formatTweetText = (tweet: Post): string => {
  let text = tweet.text ?? "";
  if (tweet.isRetweet && tweet.retweetedStatus) {
    text = tweet.retweetedStatus.text ?? "";
  }

  // Track which URLs were replaced in the text
  const replacedUrls = new Set<string>();

  // Replace urls
  for (const url of tweet.urls) {
    const beforeReplace = text;
    text = text.replace(/https:\/\/t\.co\/\w+/, url);
    // If text changed, this URL was replaced
    if (beforeReplace !== text) {
      replacedUrls.add(url);
    }
  }

  // Remove medias t.co links
  text = text.replaceAll(/https:\/\/t\.co\/\w+/g, "");

  // Replace HTML entities with their unicode equivalent
  text = decode(text);

  // Append any URLs that weren't replaced (card-only URLs)
  const unreplacedUrls = tweet.urls.filter((url) => !replacedUrls.has(url));
  if (unreplacedUrls.length > 0) {
    const urlsToAppend = unreplacedUrls.join("\n");
    text = text.trim() + (text.trim() ? "\n\n" : "") + urlsToAppend;
  }

  // Return formatted
  return text.trim();
};

function toEmbLink(permanentUrl: string): string {
  const link = new URL(permanentUrl);
  const domain = X_EMB_FIX;
  link.hostname = domain;
  return link.toString();
}

/**
 * Converts a raw Tweet object into a MetaTweet object.
 * This adds a proper Date object and a formatted text string.
 * @param tweet The original Tweet object from the scraper.
 * @returns A MetaTweet object with added `datetime` and `formattedText` fields.
 */
export const toMetaPost = (tweet: Post): MetaPost => {
  let videoFiles: DownloadedVideo[] | undefined;
  let photoFiles: DownloadedPhoto[] | undefined;

  const embLink = tweet.permanentUrl
    ? toEmbLink(tweet.permanentUrl)
    : undefined;

  let urls = tweet.urls;

  let text = formatTweetText(tweet);

  const meta: MetaPost = {
    ...tweet,
    urls,
    quotedStatus: tweet.quotedStatus
      ? toMetaPost(tweet.quotedStatus)
      : undefined,
    retweetedStatus: tweet.retweetedStatus
      ? toMetaPost(tweet.retweetedStatus)
      : undefined,
    embLink,
    datetime: new Date((tweet.timestamp ?? 0) * 1000),
    text,
    rawText: tweet.text,
    language: eldr.detect(text).languageName,
    sensitiveContent: tweet.sensitiveContent ?? false,
    async chunk(args: SplitTextArgs) {
      const entries = extractWordsAndSpacers(text, tweet.urls ?? []);
      return buildChunksFromSplitterEntries({
        entries,
        quotedStatusId: tweet.quotedStatusId,
        maxChunkSize: args.maxChunkSize,
        quotedStatusLinkSection: args.quotedStatusLinkSection ?? "",
        appendQuoteLink: args.appendQuoteLink,
      });
    },

    async getVideos() {
      if (videoFiles !== undefined) {
        return videoFiles;
      }

      const files: DownloadedVideo[] = await Promise.all(
        tweet.videos.map(async (v): Promise<DownloadedVideo> => {
          const file = await download(v.url);
          return { ...v, file };
        })
      );
      videoFiles = files;
      return files;
    },
    async getPhotos() {
      if (photoFiles !== undefined) {
        return photoFiles;
      }

      const downloadedPhotos = await Promise.all(
        tweet.photos.map(async (photo): Promise<DownloadedPhoto> => {
          const blob = await download(photo.url);
          return { ...photo, file: blob };
        })
      );
      photoFiles = downloadedPhotos;
      return photoFiles;
    },
  };

  debug("Converted to MetaPost:", { meta });

  return meta;
};
