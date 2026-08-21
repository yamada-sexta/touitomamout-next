import { type SplitterEntry } from "../../../types/splitter";

/**
 * Splits the given string into chunks based on a list of URLs and whitespace detection.
 *
 * @param {string} inputString - The input string to split.
 * @param {string[]} urls - An array of URLs used for splitting the input string.
 * @returns {SplitterEntry[]} An array of SplitterEntry objects representing the split chunks.
 */
export const extractWordsAndSpacers = (
  inputString: string,
  urls: string[],
): SplitterEntry[] => {
  // URLs contain no whitespace, so normal tokenization already keeps them
  // atomic. The old URL-first pass corrupted text when two or more URLs were
  // present and could even inject a URL that was not in the input.
  void urls;

  const entries: SplitterEntry[] = [];
  for (const match of inputString.matchAll(/\S+|\s+/g)) {
    const token = match[0];
    if (/^\s+$/.test(token)) {
      const previous = entries.at(-1);
      if (previous) {
        previous.sep += token;
      } else {
        entries.push({ str: "", sep: token });
      }
    } else {
      entries.push({ str: token, sep: "" });
    }
  }

  return entries;
};
