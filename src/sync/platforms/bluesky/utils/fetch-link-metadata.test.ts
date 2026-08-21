import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchLinkMetadata } from "./fetch-link-metadata";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchLinkMetadata", () => {
  test("encodes the source URL as one Cardyb query parameter", async () => {
    const sourceUrl = "https://example.test/page?a=1&b=2#fragment";
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        Response.json({
          title: "Example",
          description: "Description",
          image: "",
          error: "",
          url: sourceUrl,
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchLinkMetadata(sourceUrl);

    const requested = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requested.searchParams.get("url")).toBe(sourceUrl);
    expect([...requested.searchParams.keys()]).toEqual(["url"]);
  });
});
