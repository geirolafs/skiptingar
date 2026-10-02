import {
  insertAcrossSegments,
  SOFT_HYPHEN,
  SOFT_HYPHENS,
  WHITESPACE_RUNS,
} from "./characters";
import type { HyphenateOptions } from "./hyphenate";
import { breakOffsets } from "./hyphenate";
import type { LocaleDetailsOptions } from "./locale-details";
import { localeDetailsSegments } from "./locale-details";

export type ProcessOptions = {
  /** Hyphenation options. Omit or `false` to skip hyphenation. */
  hyphenate?: HyphenateOptions | false;
  /** Locale details options. Omit or `false` to skip them. */
  localeDetails?: LocaleDetailsOptions | false;
};

/**
 * Locale details are on by default: left out (`undefined`) or `true` means the default
 * rules, an options object sets them, and `false` means off.
 */
export function resolveLocaleDetails(
  value: boolean | LocaleDetailsOptions | undefined
): LocaleDetailsOptions | false {
  if (value === undefined || value === true) {
    return {};
  }
  return value;
}

/**
 * Maps break offsets into `NFC(text)` back to offsets into `text`.
 *
 * Every segment is already NFC, so the joined text differs from its NFC form
 * only where a combining mark at the start of a segment composes with the
 * letter before it. Composition never crosses whitespace, so the text is
 * compared word by word: a word that NFC leaves alone keeps its breaks, and
 * the rare word that NFC changes loses them.
 */
function toRawOffsets(text: string, offsets: readonly number[]): number[] {
  const out: number[] = [];
  let next = 0;
  let raw = 0;
  let nfc = 0;
  for (const token of text.split(WHITESPACE_RUNS)) {
    const normal = token.normalize("NFC");
    const end = nfc + normal.length;
    const stable = normal === token;
    for (let at = offsets[next]; at !== undefined && at < end; at = offsets[++next]) {
      if (stable) {
        out.push(at - nfc + raw);
      }
    }
    raw += token.length;
    nfc = end;
  }
  return out;
}

/**
 * The whole pipeline over the text segments of one run, for example the text
 * nodes of a paragraph split by inline elements. Every segment is put in NFC.
 * Then the locale details are added across the segments. Then, when hyphenation is on, the
 * old soft hyphens are removed, the joined run is hyphenated and the breaks
 * are cut back into the segments. With hyphenation off, soft hyphens already
 * in the text are kept.
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
  const normal = segments.map(segment => segment.normalize("NFC"));
  if (!options.hyphenate) {
    return options.localeDetails
      ? localeDetailsSegments(normal, options.localeDetails)
      : normal;
  }

  const clean = normal.map(segment => segment.replace(SOFT_HYPHENS, ""));
  const localeDetails = options.localeDetails
    ? localeDetailsSegments(clean, options.localeDetails)
    : clean;
  const joined = localeDetails.join("");
  const offsets = toRawOffsets(joined, breakOffsets(joined, options.hyphenate));
  return insertAcrossSegments(
    localeDetails,
    offsets,
    options.hyphenate.hyphenChar ?? SOFT_HYPHEN
  );
}
