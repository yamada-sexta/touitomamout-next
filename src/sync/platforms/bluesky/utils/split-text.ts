import { BLUESKY_MAX_POST_LENGTH } from "env";
import { type Post } from "types/post";
import { splitTweetTextCore } from "utils/tweet/split-tweet-text/split-tweet-text";

/**
 * Bluesky-specific split logic.
 */
export async function splitTextForBluesky(tweet: Post): Promise<string[]> {
  const { text, quotedStatusId, urls } = tweet;
  if (!text) {
    return [""]; // Make sure to return at least one chunk
  }

  const maxChunkSize = BLUESKY_MAX_POST_LENGTH;

  if (text.length <= maxChunkSize) {
    return [text];
  }

  return splitTweetTextCore({
    text,
    urls,
    quotedStatusId,
    appendQuoteLink: false,
    maxChunkSize,
    quotedStatusLinkSection: "",
  });
}
