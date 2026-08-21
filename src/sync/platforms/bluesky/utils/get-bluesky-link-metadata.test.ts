import { afterEach, describe, expect, test, vi } from "vitest";
import type { Agent } from "@atproto/api";
import { download } from "#app/utils/medias/download-media";
import { fetchLinkMetadata } from "./fetch-link-metadata";
import { getBlueskyLinkMetadata } from "./get-bluesky-link-metadata";
import { uploadBlueskyMedia } from "./upload-bluesky-media";

vi.mock("#app/utils/medias/download-media", () => ({ download: vi.fn() }));
vi.mock("./fetch-link-metadata", () => ({ fetchLinkMetadata: vi.fn() }));
vi.mock("./upload-bluesky-media", () => ({
  uploadBlueskyMedia: vi.fn(),
}));

const agent = {} as Agent;
const metadata = {
  title: "Example",
  description: "A card",
  image: "https://example.test/thumb.png",
  error: "",
  url: "https://example.test/post",
};

const fetchMetadataMock = fetchLinkMetadata as unknown as {
  mockResolvedValue(value: typeof metadata): void;
};
const downloadMock = download as unknown as {
  mockResolvedValue(value: File | undefined): void;
};
const uploadMediaMock = uploadBlueskyMedia as unknown as {
  mockRejectedValue(value: Error): void;
};
const originalConsoleError = console.error;

afterEach(() => {
  vi.clearAllMocks();
  console.error = originalConsoleError;
});

describe("getBlueskyLinkMetadata", () => {
  test("keeps a valid card when its thumbnail cannot be downloaded", async () => {
    fetchMetadataMock.mockResolvedValue(metadata);
    downloadMock.mockResolvedValue(undefined);
    console.error = () => undefined;

    await expect(getBlueskyLinkMetadata(metadata.url, agent)).resolves.toEqual({
      ...metadata,
      image: undefined,
    });
  });

  test("keeps a valid card when its thumbnail cannot be uploaded", async () => {
    fetchMetadataMock.mockResolvedValue(metadata);
    downloadMock.mockResolvedValue(
      new File([new Uint8Array([1])], "thumb.png", { type: "image/png" }),
    );
    uploadMediaMock.mockRejectedValue(new Error("upload failed"));
    console.error = () => undefined;

    await expect(getBlueskyLinkMetadata(metadata.url, agent)).resolves.toEqual({
      ...metadata,
      image: undefined,
    });
  });
});
