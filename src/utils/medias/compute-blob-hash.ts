import { createHash } from "node:crypto";
import { DEBUG } from "~/env";

export const computeBlobHash = async (blob: Blob): Promise<string> => {
  const hasher = createHash("sha256");
  const buffer = await blob.arrayBuffer();
  hasher.update(Buffer.from(buffer));
  const hash = hasher.digest("hex");
  if (DEBUG) {
    console.log(`Computed hash: ${hash}`);
  }

  return hash;
};
