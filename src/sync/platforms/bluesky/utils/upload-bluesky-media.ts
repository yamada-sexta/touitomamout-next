import {
  BlobRef,
  type Agent,
  type ComAtprotoRepoUploadBlob,
} from "@atproto/api";
// import type { BlobRef } from "@atproto/lex";
// import type { BlobRef } from "@atproto/lex";
import { BLUESKY_MEDIA_MAX_SIZE_BYTES } from "env";
import { debug } from "utils/logs";
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

export interface UploadBlueskyMediaResult {
  res: ComAtprotoRepoUploadBlob.Response;
  blobRef?: BlobRef;
}

// Helper to force the exact JSON structure the Bluesky backend demands
function formatBlobForAPI(blobRef: BlobRef) {
  return {
    $type: "blob",
    ref: {
      $link: blobRef.ref.toString(), // Converts the CID object to the raw string
    },
    mimeType: blobRef.mimeType,
    size: blobRef.size,
  } as unknown as BlobRef; // Silence TypeScript
}

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export async function uploadBlueskyMedia(
  mediaBlob: Blob,
  agent: Agent,
): Promise<UploadBlueskyMediaResult> {
  // const { data: data, mimeType } = await parseBlobForBluesky(mediaBlob);
  const blob =
    (await compressMedia(mediaBlob, BLUESKY_MEDIA_MAX_SIZE_BYTES).catch(
      () => mediaBlob,
    )) || mediaBlob;

  if (!blob) {
    // throw new Error("Failed to compress media for Bluesky");
    console.warn("Failed to compress media for Bluesky, using original blob");
  }

  // const blobData = new Blob([data], { type: mimeType });
  const res = await agent.uploadBlob(blob, {
    encoding: blob.type,
  });

  if (!res.success) {
    console.error("Failed to upload media to Bluesky", res);
    return { res };
  }

  const blobRef = BlobRef.asBlobRef(res.data.blob.original) ?? undefined;
  debug("Uploaded media to Bluesky", { blobRef });
  return { res, blobRef };
}
