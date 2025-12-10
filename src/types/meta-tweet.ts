import { Photo, Tweet, Video } from "@the-convocation/twitter-scraper";
import { decode } from "html-entities";
import { ValidPost } from "./post";
import eldr from "@mailbutler/eldr/extra-small";
import { extractWordsAndSpacers } from "utils/tweet/split-tweet-text/extract-words-and-spacers";
import { buildChunksFromSplitterEntries } from "utils/tweet/split-tweet-text/split-tweet-text";
import { download } from "utils/medias/download-media";

export type DownloadedVideo = Video & { file?: File };
export type DownloadedPhoto = Photo & { file?: File };

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

export interface MetaPost extends ValidPost {
    datetime: Date;
    rawText?: string;
    text: string;
    language: string;
    sensitiveContent: boolean;

    /**
     * Splits the post text into chunks for a target platform.
     */
    chunk: (args: SplitTextArgs) => Promise<string[]>;

    videoFiles: () => Promise<DownloadedVideo[]>;
    photoFiles: () => Promise<DownloadedPhoto[]>;
}

export const formatTweetText = (tweet: Tweet): string => {
    let text = tweet.text ?? "";
    
    // Track which URLs were replaced in the text
    const replacedUrls = new Set<string>();
    
    // Replace urls
    tweet.urls.forEach((url) => {
        const beforeReplace = text;
        text = text.replace(/https:\/\/t\.co\/\w+/, url);
        // If text changed, this URL was replaced
        if (beforeReplace !== text) {
            replacedUrls.add(url);
        }
    });

    // Remove medias t.co links
    text = text.replaceAll(/https:\/\/t\.co\/\w+/g, "");

    // Replace HTML entities with their unicode equivalent
    text = decode(text);

    // Append any URLs that weren't replaced (card-only URLs)
    const unreplacedUrls = tweet.urls.filter(url => !replacedUrls.has(url));
    if (unreplacedUrls.length > 0) {
        const urlsToAppend = unreplacedUrls.join("\n");
        text = text.trim() + (text.trim() ? "\n\n" : "") + urlsToAppend;
    }

    // Return formatted
    return text.trim();
};

/**
 * Converts a raw Tweet object into a MetaTweet object.
 * This adds a proper Date object and a formatted text string.
 * @param tweet The original Tweet object from the scraper.
 * @returns A MetaTweet object with added `datetime` and `formattedText` fields.
 */
export const toMetaPost = (tweet: ValidPost): MetaPost => {
    const text = formatTweetText(tweet);

    let videoFiles: DownloadedVideo[] | undefined = undefined;
    let photoFiles: DownloadedPhoto[] | undefined = undefined;

    return {
        ...tweet,
        datetime: new Date((tweet.timestamp ?? 0) * 1000),
        text,
        rawText: tweet.text,
        language: eldr.detect(text).languageName,
        sensitiveContent: tweet.sensitiveContent ?? false,
        chunk: async (args: SplitTextArgs) => {
            const entries = extractWordsAndSpacers(text, tweet.urls ?? []);
            return buildChunksFromSplitterEntries({
                entries,
                quotedStatusId: tweet.quotedStatusId,
                maxChunkSize: args.maxChunkSize,
                quotedStatusLinkSection: args.quotedStatusLinkSection ?? "",
                appendQuoteLink: args.appendQuoteLink,
            });
        },

        videoFiles: async () => {
            if (videoFiles !== undefined) {
                return videoFiles;
            }
            const files: DownloadedVideo[] = await Promise.all(
                tweet.videos.map(async (v): Promise<DownloadedVideo> => {
                    const file = await download(v.url);
                    return { ...v, file };
                }),
            );
            videoFiles = files;
            return files;
        },
        photoFiles: async () => {
            if (photoFiles !== undefined) {
                return photoFiles;
            }
            const downloadedPhotos = await Promise.all(
                tweet.photos.map(async (photo): Promise<DownloadedPhoto> => {
                    const blob = await download(photo.url);
                    return { ...photo, file: blob };
                }),
            );
            photoFiles = downloadedPhotos;
            return photoFiles
        },
    };
};

