import { computeBlobHash } from "./compute-blob-hash";

export async function getBlobHash(blob?: Blob): Promise<string> {
  return blob ? computeBlobHash(blob) : "";
}
