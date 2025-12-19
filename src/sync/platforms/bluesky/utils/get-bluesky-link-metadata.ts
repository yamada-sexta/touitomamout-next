import { type Agent, type ComAtprotoRepoUploadBlob } from "@atproto/api";
import { download } from "utils/medias/download-media";
import { fetchLinkMetadata, type LinkMetadata } from "./fetch-link-metadata";
// Import { BlueskyLinkMetadata } from "../../types/link-metadata";
import { parseBlobForBluesky } from "./parse-blob-for-bluesky";

export type BlueskyLinkMetadata = Omit<LinkMetadata, "image"> & {
  image: ComAtprotoRepoUploadBlob.Response | undefined;
};

/**
 * Retrieves Bluesky Link metadata asynchronously.
 *
 * @param {string} url - The URL of the link for which metadata is to be retrieved.
 * @param {AtpAgent} client - The AtpAgent client used for uploading the media.
 * @returns {Promise<BlueskyLinkMetadata | null>} - A promise that resolves to the Bluesky Link metadata or null if not found.
 */
export async function getBlueskyLinkMetadata(
  url: string,
  client: Agent,
): Promise<BlueskyLinkMetadata | undefined> {
  const data = await fetchLinkMetadata(url);

  // Without metadata, stop
  if (!data) {
    return null;
  }

  // Metadata without image
  if (!data.image) {
    return {
      ...data,
      image: undefined,
    };
  }

  const mediaBlob = await download(data.image);
  if (!mediaBlob) {
    return null;
  }

  const blueskyBlob = await parseBlobForBluesky(mediaBlob);

  const media = await client.uploadBlob(blueskyBlob.blobData, {
    encoding: blueskyBlob.mimeType,
  });

  return {
    ...data,
    image: blueskyBlob ? media : undefined,
  };
}
