import {
  BlobRef,
  type Agent,
  type ComAtprotoRepoUploadBlob,
} from "@atproto/api";
import {
  BLUESKY_MEDIA_MAX_SIZE_BYTES,
  BLUESKY_VIDEO_DIRECT_UPLOAD_LIMIT_BYTES,
} from "~/env";
import { debug } from "~/utils/logs";
import { compressMedia } from "~/utils/medias/compress-media";
import { uploadLargeBlueskyVideo } from "./upload-bluesky-video";

export interface UploadBlueskyMediaResult {
  res?: ComAtprotoRepoUploadBlob.Response;
  blobRef?: BlobRef;
}

function isLikelyVideo(mediaBlob: Blob): boolean {
  if (mediaBlob.type.startsWith("video/")) {
    return true;
  }

  const fileName = ((mediaBlob as { name?: string }).name ?? "").toLowerCase();
  return /\.(mp4|mov|m4v|webm|mkv|avi)$/.test(fileName);
}

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export async function uploadBlueskyMedia(
  mediaBlob: Blob,
  agent: Agent,
): Promise<UploadBlueskyMediaResult> {
  if (
    isLikelyVideo(mediaBlob) &&
    mediaBlob.size > BLUESKY_VIDEO_DIRECT_UPLOAD_LIMIT_BYTES
  ) {
    return {
      blobRef: await uploadLargeBlueskyVideo(mediaBlob, agent),
    };
  }

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
