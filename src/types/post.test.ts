import { describe, expect, test } from "bun:test";
import { appendPostText, type Post, toMetaPost } from "./post";

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: "120",
  text: "A mirrored post",
  hashtags: [],
  mentions: [],
  photos: [],
  thread: [],
  urls: [],
  videos: [],
  sensitiveContent: false,
  ...overrides,
});

describe("appendPostText", () => {
  test("adds configured text after a blank line", () => {
    expect(appendPostText("A mirrored post", "#one #two")).toBe(
      "A mirrored post\n\n#one #two",
    );
  });

  test("uses the configured text for a media-only post", () => {
    expect(appendPostText("", "#photos")).toBe("#photos");
  });

  test("does not change text for an empty configuration", () => {
    expect(appendPostText("A mirrored post", "  ")).toBe("A mirrored post");
  });
});

describe("toMetaPost", () => {
  test("appends text only to the outgoing top-level post", () => {
    const metaPost = toMetaPost(
      makePost({ quotedStatus: makePost({ id: "119", text: "Quoted post" }) }),
      "#standard",
    );

    expect(metaPost.text).toBe("A mirrored post\n\n#standard");
    expect(metaPost.quotedStatus?.text).toBe("Quoted post");
  });
});
