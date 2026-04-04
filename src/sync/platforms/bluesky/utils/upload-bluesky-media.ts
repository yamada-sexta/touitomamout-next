import {
  BlobRef,
  type Agent,
  type ComAtprotoRepoUploadBlob,
} from "@atproto/api";
import { BLUESKY_MEDIA_MAX_SIZE_BYTES } from "env";
import { debug } from "utils/logs";
import { compressMedia } from "utils/medias/compress-media";

export interface UploadBlueskyMediaResult {
  res: ComAtprotoRepoUploadBlob.Response;
  blobRef?: BlobRef;
}

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export async function uploadBlueskyMedia(
  mediaBlob: Blob,
  agent: Agent,
): Promise<UploadBlueskyMediaResult> {
  const blob =
    (await compressMedia(mediaBlob, BLUESKY_MEDIA_MAX_SIZE_BYTES).catch(
      () => mediaBlob,
    )) || mediaBlob;

  const res = await agent.uploadBlob(blob, {
    encoding: blob.type,
  });

  if (!res.success) {
    console.error("Failed to upload media to Bluesky", res);
    return { res };
  }

  const blobRef = (res.data.blob as any).original ?? res.data.blob;
  debug("Uploaded media to Bluesky", { blobRef });
  return { res, blobRef };
}
