import { computeBlobHash } from "./compute-blob-hash";

export async function getBlobHash(blob?: Blob): Promise<string | undefined> {
  return blob ? computeBlobHash(blob) : undefined;
}
