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
  const { data: data, mimeType } = await parseBlobForBluesky(mediaBlob);
  const blobData = new Blob([data], { type: mimeType });
  return agent.uploadBlob(blobData, {
    encoding: mimeType,
  });
}
