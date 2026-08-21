import { type DBType } from "#app/db";
import { MASTODON_MAX_POST_LENGTH } from "#app/env";
import { getPostStore } from "#app/utils/get-post-store";
import { splitTweetTextCore } from "#app/utils/tweet/split-tweet-text/split-tweet-text";
import { type MetaPost, toStatusEmbLink } from "#app/types/post";
import { MASTODON_PLATFORM_ID, MastodonStoreSchema } from "./store";

export async function splitTextForMastodon(
  args: {
    tweet: MetaPost;
    db: DBType;
    mastodonUsername: string;
    mastodonInstance: URL;
  },
  // MastodonUsername: string
): Promise<{
  chunks: string[];
  quotedStatusId?: string;
  inReplyToId?: string;
}> {
  const { text, quotedStatus, quotedStatusId, inReplyToStatusId, urls } =
    args.tweet;
  const postText = text ?? "";

  const maxChunkSize = MASTODON_MAX_POST_LENGTH;

  let quoteLink = "";
  let mastodonQuotedStatusId: string | undefined;
  let mastodonReplyStatusId: string | undefined;
  if (quotedStatusId) {
    const store = await getPostStore({
      s: MastodonStoreSchema,
      db: args.db,
      tweet: quotedStatusId,
      platformId: MASTODON_PLATFORM_ID,
    });

    if (store.success) {
      mastodonQuotedStatusId = store.data.tootIds.at(-1);
    } else if (quotedStatus?.embLink) {
      quoteLink = `\n\n${quotedStatus.embLink}`;
    }
  }

  if (inReplyToStatusId) {
    const store = await getPostStore({
      s: MastodonStoreSchema,
      db: args.db,
      tweet: inReplyToStatusId,
      platformId: MASTODON_PLATFORM_ID,
    });

    if (store.success) {
      mastodonReplyStatusId = store.data.tootIds.at(0);
    } else if (!quoteLink) {
      quoteLink = `\n\n${toStatusEmbLink(inReplyToStatusId)}`;
    }
  }

  if (!postText && !quoteLink) {
    return {
      chunks: [],
      quotedStatusId: mastodonQuotedStatusId,
      inReplyToId: mastodonReplyStatusId,
    };
  }

  if (postText.length + quoteLink.length <= maxChunkSize) {
    return {
      chunks: [postText + quoteLink],
      quotedStatusId: mastodonQuotedStatusId,
      inReplyToId: mastodonReplyStatusId,
    };
  }

  return {
    chunks: await splitTweetTextCore({
      text: postText,
      urls,
      quotedStatusId,
      maxChunkSize,
      quotedStatusLinkSection: quoteLink,
      appendQuoteLink: true,
    }),
    quotedStatusId: mastodonQuotedStatusId,
    inReplyToId: mastodonReplyStatusId,
  };
}
