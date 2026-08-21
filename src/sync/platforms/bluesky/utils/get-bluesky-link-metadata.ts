import { type Agent, type ComAtprotoRepoUploadBlob } from "@atproto/api";
import { download } from "#app/utils/medias/download-media";
import { fetchLinkMetadata, type LinkMetadata } from "./fetch-link-metadata";
import { uploadBlueskyMedia } from "./upload-bluesky-media";
// import { parseBlobForBluesky } from "./parse-blob-for-bluesky";

export type BlueskyLinkMetadata = Omit<LinkMetadata, "image"> & {
  image: ComAtprotoRepoUploadBlob.OutputSchema["blob"] | undefined;
};

/**
 * Retrieves Bluesky Link metadata asynchronously.
 *
 * @param {string} url - The URL of the link for which metadata is to be retrieved.
 * @param {AtpAgent} client - The AtpAgent client used for uploading the media.
 * @returns {Promise<BlueskyLinkMetadata | undefined>} - A promise that resolves to the Bluesky Link metadata or undefined if not found.
 */
export async function getBlueskyLinkMetadata(
  url: string,
  client: Agent,
): Promise<BlueskyLinkMetadata | undefined> {
  const data = await fetchLinkMetadata(url);

  // Without metadata, stop
  if (!data) {
    return undefined;
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
    console.error(
      `Unable to download Bluesky card thumbnail; posting the card without it: ${data.image}`,
    );
    return {
      ...data,
      image: undefined,
    };
  }

  try {
    const { blobRef } = await uploadBlueskyMedia(mediaBlob, client);
    if (!blobRef) {
      console.error(
        "Unable to upload Bluesky card thumbnail; posting the card without it",
      );
    }

    return {
      ...data,
      image: blobRef,
    };
  } catch (error) {
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(
      `Unable to upload Bluesky card thumbnail; posting the card without it:\n${details}`,
    );
    return {
      ...data,
      image: undefined,
    };
  }
}
