import { BLUESKY_MEDIA_MAX_SIZE_BYTES } from "env";
import { compressMedia } from "utils/medias/compress-media";

interface BlueskyBlob {
  mimeType: string;
  blobData: Uint8Array;
}

const allowedMimeTypes = [
  "image/gif",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
  "video/mp4",
];

/**
 * An async method to convert a Blob to an upload-compatible Bluesky Blob.
 * @returns BlueskyBlob
 */
export async function parseBlobForBluesky(
  inputBlob: Blob,
): Promise<BlueskyBlob> {
  // console.log("Parsing blob for bluesky");

  const blob =
    (await compressMedia(inputBlob, BLUESKY_MEDIA_MAX_SIZE_BYTES).catch(
      () => inputBlob,
    )) || inputBlob;

  const ab = await blob.arrayBuffer();
  const data = new Uint8Array(ab);

  const mimeType = blob.type || inputBlob.type;

  if (!mimeType) {
    throw new Error("Empty media type!");
  }

  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error(`Media type not supported (${mimeType})`);
  }

  return {
    mimeType,
    blobData: data,
  };
}
