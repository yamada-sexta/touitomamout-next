import { afterEach, describe, expect, test, vi } from "vitest";
import { getRedirectedUrl, isSafeUrl } from "./get-redirection";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("isSafeUrl", () => {
  test.each([
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://localhost/",
    "file:///etc/passwd",
  ])("rejects local URL %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe("getRedirectedUrl", () => {
  test("stops redirect cycles", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(null, {
        status: 302,
        headers: {
          location: url.endsWith("/a")
            ? "https://example.test/b"
            : "https://example.test/a",
        },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(getRedirectedUrl("https://example.test/a")).resolves.toBe(
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("caps an unbounded redirect chain", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const next = Number(url.pathname.slice(1) || "0") + 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.test/${next}` },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(getRedirectedUrl("https://example.test/0")).resolves.toBe(
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
