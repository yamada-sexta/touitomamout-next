import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  it("adds configured text after a blank line", () => {
    assert.strictEqual(
      appendPostText("A mirrored post", "#one #two"),
      "A mirrored post\n\n#one #two",
    );
  });

  it("uses the configured text for a media-only post", () => {
    assert.strictEqual(appendPostText("", "#photos"), "#photos");
  });

  it("does not change text for an empty configuration", () => {
    assert.strictEqual(appendPostText("A mirrored post", "  "), "A mirrored post");
  });
});

describe("toMetaPost", () => {
  it("appends text only to the outgoing top-level post", () => {
    const metaPost = toMetaPost(
      makePost({ quotedStatus: makePost({ id: "119", text: "Quoted post" }) }),
      "#standard",
    );

    assert.strictEqual(metaPost.text, "A mirrored post\n\n#standard");
    assert.strictEqual(metaPost.quotedStatus?.text, "Quoted post");
  });
});
