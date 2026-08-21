import { type SplitterEntry } from "../../../types/splitter";
import { extractWordsAndSpacers } from "./extract-words-and-spacers";

type SplitTextArgBase = {
  text: string;
  urls: string[];
  quotedStatusId: string | undefined;
  maxChunkSize: number;
};

export type SplitTextArgs =
  | (SplitTextArgBase & {
      appendQuoteLink: false;
      quotedStatusLinkSection: "";
    })
  | (SplitTextArgBase & {
      appendQuoteLink: true;
      quotedStatusLinkSection: string;
    });

/**
 * Shared core function that splits text into chunks.
 */
export async function splitTweetTextCore({
  text,
  urls,
  quotedStatusId,
  maxChunkSize,
  quotedStatusLinkSection,
  appendQuoteLink,
}: SplitTextArgs): Promise<string[]> {
  void quotedStatusId;
  const entries = extractWordsAndSpacers(text, urls);
  return buildChunksFromSplitterEntries({
    entries,
    maxChunkSize,
    quotedStatusLinkSection,
    appendQuoteLink,
  });
}

const length = (value: string) => Array.from(value).length;

const take = (value: string, count: number): [string, string] => {
  const characters = Array.from(value);
  return [
    characters.slice(0, count).join(""),
    characters.slice(count).join(""),
  ];
};

export const buildChunksFromSplitterEntries = ({
  entries,
  maxChunkSize,
  quotedStatusLinkSection,
  appendQuoteLink,
}: {
  entries: SplitterEntry[];
  appendQuoteLink: boolean;
  maxChunkSize: number;
  quotedStatusLinkSection: string;
}): string[] => {
  const chunks: string[] = [];
  let currentChunk = "";
  let quoteLinkPending = appendQuoteLink && quotedStatusLinkSection.length > 0;

  if (maxChunkSize <= 0) {
    throw new RangeError("maxChunkSize must be greater than zero");
  }

  const flush = () => {
    const text = currentChunk.trim();
    if (!text && !quoteLinkPending) return;

    chunks.push(quoteLinkPending ? `${text}${quotedStatusLinkSection}` : text);
    quoteLinkPending = false;
    currentChunk = "";
  };

  for (const entry of entries) {
    let remaining = entry.str + entry.sep;

    while (remaining) {
      const reserved = quoteLinkPending ? length(quotedStatusLinkSection) : 0;
      const capacity = maxChunkSize - reserved;
      if (capacity < 0) {
        throw new RangeError("quotedStatusLinkSection exceeds maxChunkSize");
      }

      const available = capacity - length(currentChunk);
      if (length(remaining) <= available) {
        currentChunk += remaining;
        break;
      }

      // Preserve a normal word when it fits on a fresh chunk. Only split an
      // atomic token when the token itself is longer than the platform limit.
      if (currentChunk.trim() && length(remaining) <= capacity) {
        flush();
        continue;
      }

      if (available === 0) {
        flush();
        continue;
      }

      const [prefix, suffix] = take(remaining, available);
      currentChunk += prefix;
      remaining = suffix;
      flush();
    }
  }

  if (currentChunk.trim() || quoteLinkPending) flush();

  return chunks;
};
