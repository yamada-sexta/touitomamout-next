import { describe, expect, test } from "vitest";
import { extractWordsAndSpacers } from "./extract-words-and-spacers";
import { buildChunksFromSplitterEntries } from "./split-tweet-text";

const reconstruct = (entries: ReturnType<typeof extractWordsAndSpacers>) =>
  entries.map(({ str, sep }) => str + sep).join("");

const chunksFor = (text: string, maxChunkSize: number) =>
  buildChunksFromSplitterEntries({
    entries: extractWordsAndSpacers(text, []),
    appendQuoteLink: false,
    maxChunkSize,
    quotedStatusLinkSection: "",
  });

describe("extractWordsAndSpacers", () => {
  test("does not duplicate or inject URLs", () => {
    const text = "aa https://a.test bb https://b.test cc";
    expect(
      reconstruct(
        extractWordsAndSpacers(text, [
          "https://a.test",
          "https://b.test",
          "https://absent.test",
        ]),
      ),
    ).toBe(text);
  });

  test("preserves generated text exactly", () => {
    let state = 0x5eed1234;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const atoms = [
      "alpha",
      "βeta",
      "😀",
      "https://a.test/x?y=1&z=2",
      "\n",
      "  ",
    ];

    for (let run = 0; run < 250; run++) {
      let text = "";
      const count = 1 + (random() % 30);
      for (let index = 0; index < count; index++) {
        text += atoms[random() % atoms.length];
      }
      expect(reconstruct(extractWordsAndSpacers(text, atoms))).toBe(text);
    }
  });
});

describe("buildChunksFromSplitterEntries", () => {
  test("splits a long atomic token without empty or oversized chunks", () => {
    expect(chunksFor("abcdefghij", 5)).toEqual(["abcde", "fghij"]);
    expect(chunksFor("😀😀😀", 2)).toEqual(["😀😀", "😀"]);
  });

  test("appends a fallback quote link exactly once without a native quote id", () => {
    const link = "\n\nhttps://fxtwitter.com/i/status/42";
    const chunks = buildChunksFromSplitterEntries({
      entries: extractWordsAndSpacers("word ".repeat(120), []),
      appendQuoteLink: true,
      maxChunkSize: 500,
      quotedStatusLinkSection: link,
    });

    expect(chunks.filter((chunk) => chunk.includes(link))).toHaveLength(1);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 500)).toBe(true);
  });

  test("keeps seeded generated chunks nonempty and within the limit", () => {
    let state = 0xc0ffee;
    const random = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state;
    };
    const words = ["a", "longword", "😀", "e\u0301", "https://example.test/$&"];

    for (let run = 0; run < 250; run++) {
      const count = 1 + (random() % 40);
      const input = Array.from(
        { length: count },
        () => words[random() % words.length],
      ).join(" ");
      const limit = 1 + (random() % 40);
      const chunks = chunksFor(input, limit);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
      expect(chunks.every((chunk) => Array.from(chunk).length <= limit)).toBe(
        true,
      );
      expect(chunks.join("").replaceAll(/\s/g, "")).toBe(
        input.replaceAll(/\s/g, ""),
      );
    }
  });
});
