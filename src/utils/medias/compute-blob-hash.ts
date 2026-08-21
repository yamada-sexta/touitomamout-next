import { DEBUG } from "#app/env";
import { createHash } from "node:crypto";

export const computeBlobHash = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const hash = createHash("sha256")
    .update(new Uint8Array(buffer))
    .digest("hex");
  if (DEBUG) {
    console.log(`Computed hash: ${hash}`);
  }

  return hash;
};
