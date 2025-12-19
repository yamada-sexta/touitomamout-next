import { type DBType } from "db";
import { MASTODON_MAX_POST_LENGTH } from "env";
import { getPostStore } from "utils/get-post-store";
import { splitTweetTextCore } from "utils/tweet/split-tweet-text/split-tweet-text";
import { type MetaPost } from "types/post";
import {
  MastodonStoreSchema,
  MastodonSynchronizerFactory,
} from "./mastodon-sync";

export async function splitTextForMastodon(
  args: {
    tweet: MetaPost;
    db: DBType;
    mastodonUsername: string;
    mastodonInstance: string;
  },
  // MastodonUsername: string
): Promise<string[]> {
  const { text, quotedStatusId, urls } = args.tweet;
  if (!text) {
    return [];
  }

  const maxChunkSize = MASTODON_MAX_POST_LENGTH;

  let quoteLink = "";
  if (quotedStatusId) {
    const store = await getPostStore({
      s: MastodonStoreSchema,
      db: args.db,
      tweet: quotedStatusId,
      platformId: MastodonSynchronizerFactory.PLATFORM_ID,
    });

    if (store.success) {
      const tootId = store.data.tootIds.at(-1);
      quoteLink = `\n\nhttps://${args.mastodonInstance}/@${args.mastodonUsername}/${tootId}`;
    }
  }

  if (text.length + quoteLink.length <= maxChunkSize) {
    return [text + quoteLink];
  }

  return splitTweetTextCore({
    text: text ?? "",
    urls,
    quotedStatusId,
    maxChunkSize,
    quotedStatusLinkSection: quoteLink,
    appendQuoteLink: true,
  });
}
