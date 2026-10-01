import { SOFT_HYPHEN } from "./characters";
import type { HyphenateOptions } from "./hyphenate";
import { breakOffsets } from "./hyphenate";
import type { TypesetOptions } from "./typeset";
import { typesetSegments } from "./typeset";

export type ProcessOptions = {
  /** Hyphenation options. Omit or `false` to skip hyphenation. */
  hyphenate?: HyphenateOptions | false;
  /** Typeset options. Omit or `false` to skip typesetting. */
  typeset?: TypesetOptions | false;
};

const SOFT_HYPHENS = new RegExp(SOFT_HYPHEN, "g");

/** `true` means the default rules, `false` means off. */
export function resolveTypeset(
  value: boolean | TypesetOptions | undefined
): TypesetOptions | false {
  if (value === undefined || value === true) {
    return {};
  }
  return value;
}

/** Inserts `mark` into the segments at offsets into their joined text. */
function insertAcrossSegments(
  segments: readonly string[],
  offsets: readonly number[],
  mark: string
): string[] {
  let next = 0;
  let start = 0;
  return segments.map(segment => {
    const end = start + segment.length;
    let out = "";
    let from = 0;
    // An offset on a border goes at the end of the earlier segment.
    while (true) {
      const at = offsets[next];
      if (at === undefined || at > end) {
        break;
      }
      out += segment.slice(from, at - start) + mark;
      from = at - start;
      next += 1;
    }
    start = end;
    return out + segment.slice(from);
  });
}

/**
 * The whole pipeline over the text segments of one run, for example the text
 * nodes of a paragraph split by inline elements. Every segment is put in NFC
 * and loses its soft hyphens. Then typeset works across the segments. Then
 * the joined run is hyphenated and the breaks are cut back into the segments.
 * A word split across segments is hyphenated as one word, and a web address
 * is found in the joined text.
 *
 * Returns one string for every segment. A break on a border goes at the end of
 * the earlier segment.
 */
export function processSegments(
  segments: readonly string[],
  options: ProcessOptions
): string[] {
  const clean = segments.map(segment =>
    segment.replace(SOFT_HYPHENS, "").normalize("NFC")
  );
  const typeset = options.typeset ? typesetSegments(clean, options.typeset) : clean;
  if (!options.hyphenate) {
    return typeset;
  }

  const joined = typeset.join("");
  // Offsets count in NFC text. A mark that composes with a letter across a
  // border would move them, so such a run is left unhyphenated.
  if (joined.normalize("NFC") !== joined) {
    return typeset;
  }
  const offsets = breakOffsets(joined, options.hyphenate);
  return insertAcrossSegments(
    typeset,
    offsets,
    options.hyphenate.hyphenChar ?? SOFT_HYPHEN
  );
}
