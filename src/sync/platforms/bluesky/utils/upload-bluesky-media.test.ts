import { describe, expect, test, vi } from "vitest";
import type { Agent, BlobRef } from "@atproto/api";
import { uploadBlueskyMedia } from "./upload-bluesky-media";

describe("uploadBlueskyMedia", () => {
  test("passes bytes to the AT Protocol client instead of an unsupported Blob body", async () => {
    const blobRef = { ref: "test-cid" } as unknown as BlobRef;
    const uploadBlob = vi.fn(
      async (_data: Uint8Array, _options: { encoding: string }) => ({
        success: true,
        data: { blob: { original: blobRef } },
      }),
    );
    const agent = { uploadBlob } as unknown as Agent;

    const result = await uploadBlueskyMedia(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      agent,
    );

    const [body, options] = uploadBlob.mock.calls[0]!;
    expect(body).toBeInstanceOf(Uint8Array);
    expect([...body]).toEqual([1, 2, 3]);
    expect(options).toEqual({ encoding: "image/png" });
    expect(result.blobRef).toBe(blobRef);
  });
});
