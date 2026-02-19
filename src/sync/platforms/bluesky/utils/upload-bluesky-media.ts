import { type Agent, type ComAtprotoRepoUploadBlob } from "@atproto/api";
import { parseBlobForBluesky } from "./parse-blob-for-bluesky";

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export async function uploadBlueskyMedia(
  mediaBlob: Blob,
  agent: Agent,
): Promise<ComAtprotoRepoUploadBlob.Response | undefined> {
  const { blobData, mimeType } = await parseBlobForBluesky(mediaBlob);
  return agent.uploadBlob(blobData, {
    encoding: mimeType,
  });
}
