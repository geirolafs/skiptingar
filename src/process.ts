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
const WHITESPACE_RUNS = /(\s+)/;

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
 * Then typeset works across the segments. Then, when hyphenation is on, the
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
    return options.typeset ? typesetSegments(normal, options.typeset) : normal;
  }

  const clean = normal.map(segment => segment.replace(SOFT_HYPHENS, ""));
  const typeset = options.typeset ? typesetSegments(clean, options.typeset) : clean;
  const joined = typeset.join("");
  const offsets = toRawOffsets(joined, breakOffsets(joined, options.hyphenate));
  return insertAcrossSegments(
    typeset,
    offsets,
    options.hyphenate.hyphenChar ?? SOFT_HYPHEN
  );
}
