import { type Agent, type ComAtprotoRepoUploadBlob } from "@atproto/api";
import { BLUESKY_MEDIA_MAX_SIZE_BYTES } from "env";
import { compressMedia } from "utils/medias/compress-media";

const allowedMimeTypes = new Set([
  "image/gif",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/heic",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export async function uploadBlueskyMedia(
  mediaBlob: Blob,
  agent: Agent,
): Promise<ComAtprotoRepoUploadBlob.Response | undefined> {
  // const { data: data, mimeType } = await parseBlobForBluesky(mediaBlob);
  const blob =
    (await compressMedia(mediaBlob, BLUESKY_MEDIA_MAX_SIZE_BYTES).catch(
      () => mediaBlob,
    )) || mediaBlob;

  if (!blob) {
    // throw new Error("Failed to compress media for Bluesky");
    console.warn("Failed to compress media for Bluesky, using original blob");
    return;
  }

  // const blobData = new Blob([data], { type: mimeType });
  return agent.uploadBlob(blob, {
    encoding: blob.type,
  });
}
