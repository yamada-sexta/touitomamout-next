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
  const entries = extractWordsAndSpacers(text, urls);
  return buildChunksFromSplitterEntries({
    entries,
    quotedStatusId,
    maxChunkSize,
    quotedStatusLinkSection,
    appendQuoteLink,
  });
}

const addWordToChunk = (chunk: string, word: SplitterEntry) =>
  chunk + word.str + word.sep;

export const buildChunksFromSplitterEntries = ({
  entries,
  quotedStatusId,
  maxChunkSize,
  quotedStatusLinkSection,
  appendQuoteLink,
}: {
  entries: SplitterEntry[];
  appendQuoteLink: boolean;
  quotedStatusId: string | undefined;
  maxChunkSize: number;
  quotedStatusLinkSection: string;
}): string[] => {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const entry of entries) {
    const currentChunkWithAddedWord = addWordToChunk(currentChunk, entry);
    const shouldAppendQuoteLink =
      chunks.length === 0 && appendQuoteLink && Boolean(quotedStatusId);
    const currentMaxChunkSize = shouldAppendQuoteLink
      ? maxChunkSize - quotedStatusLinkSection.length
      : maxChunkSize;

    if (currentChunkWithAddedWord.length <= currentMaxChunkSize) {
      currentChunk = currentChunkWithAddedWord;
    } else {
      // Either push the current chunk or push the current chunk with the quote link (if mastodon + initial thread chunk)
      chunks.push(
        shouldAppendQuoteLink
          ? `${currentChunk.trim()}${quotedStatusLinkSection}`
          : currentChunk.trim(),
      );
      currentChunk = addWordToChunk("", entry);
    }
  }

  // Push any remaining content in currentChunk
  if (currentChunk.trim() !== "") {
    chunks.push(currentChunk);
  }

  return chunks;
};
