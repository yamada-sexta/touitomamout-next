import { DEBUG } from "env";

export const computeBlobHash = async (blob: Blob): Promise<string> => {
  const hasher = new Bun.CryptoHasher("sha256");
  const buffer = await blob.arrayBuffer();
  hasher.update(buffer);
  const hash = hasher.digest("hex");
  if (DEBUG) {
    console.log(`Computed hash: ${hash}`);
  }

  return hash;
};
