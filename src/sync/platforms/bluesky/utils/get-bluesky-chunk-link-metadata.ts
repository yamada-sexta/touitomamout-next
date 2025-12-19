import { type Agent, type RichText } from "@atproto/api";
import {
  type BlueskyLinkMetadata,
  getBlueskyLinkMetadata,
} from "./get-bluesky-link-metadata";

/**
 * Retrieves the metadata of the first link found in the given richtext.
 *
 * @param {RichText} richText - The richtext to search for links.
 * @param {AtpAgent} client - The AtpAgent client for making API calls.
 * @returns {Promise<BlueskyLinkMetadata | undefined>} A promise that resolves to the metadata of the first link found, or undefined if no link is found.
 */
export const getBlueskyChunkLinkMetadata = async (
  richText: RichText,
  client: Agent,
): Promise<BlueskyLinkMetadata | undefined> => {
  let card = undefined;
  for (const seg of richText.segments()) {
    if (seg.isLink()) {
      const link = seg.link?.uri;
      if (link) {
        card = await getBlueskyLinkMetadata(link, client);
        break;
      }
    }
  }

  return card;
};
