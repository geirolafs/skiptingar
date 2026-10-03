import {
  analyzeWord as publicAnalyzeWord,
  breakOffsets as publicBreakOffsets,
  hyphenate as publicHyphenate,
} from "../src";
import type { ExperimentalHyphenateOptions, HyphenateOptions } from "../src/hyphenate";

/**
 * The experimental options (`mode`, `joints`, `exceptions`, `skipAcronyms`)
 * are not in the public `HyphenateOptions` type, but the code still reads
 * them. A test passes them through the public functions with these.
 */
export function experimental(options: ExperimentalHyphenateOptions): HyphenateOptions {
  return options;
}

/** `hyphenate` that takes the experimental options too. */
export const hyphenate = (text: string, options?: ExperimentalHyphenateOptions) =>
  publicHyphenate(text, options);

/** `breakOffsets` that takes the experimental options too. */
export const breakOffsets = (text: string, options?: ExperimentalHyphenateOptions) =>
  publicBreakOffsets(text, options);

/** `analyzeWord` that takes the experimental options too. */
export const analyzeWord = (word: string, options?: ExperimentalHyphenateOptions) =>
  publicAnalyzeWord(word, options);
