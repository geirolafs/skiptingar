/** Soft hyphen U+00AD: a break point that shows only when the line breaks there. */
export const SOFT_HYPHEN = "\u00AD";

/** No-break space U+00A0: a space that never wraps. */
export const NO_BREAK_SPACE = "\u00A0";

/** Non-breaking hyphen U+2011: a hyphen that never wraps. */
export const NON_BREAKING_HYPHEN = "\u2011";

/** Word joiner U+2060: zero width, no break on either side. Keeps a range like 1990–2010 on one line. */
export const WORD_JOINER = "\u2060";

/**
 * Inserts `mark` into adjacent segments at offsets into their joined text,
 * ascending. An offset on a border goes at the end of the earlier segment.
 */
export function insertAcrossSegments(
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

/** Every soft hyphen, to remove them before hyphenating again. */
export const SOFT_HYPHENS = /* @__PURE__ */ new RegExp(SOFT_HYPHEN, "g");

/** Cuts text into words and the whitespace between them, keeping both. */
export const WHITESPACE_RUNS = /(\s+)/;
