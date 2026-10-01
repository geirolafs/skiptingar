/** Soft hyphen U+00AD: a break point that shows only when the line breaks there. */
export const SOFT_HYPHEN = "\u00AD";

/** No-break space U+00A0: a space that never wraps. */
export const NO_BREAK_SPACE = "\u00A0";

/** Non-breaking hyphen U+2011: a hyphen that never wraps. */
export const NON_BREAKING_HYPHEN = "\u2011";

/** Every soft hyphen, to remove them before hyphenating again. */
export const SOFT_HYPHENS = /* @__PURE__ */ new RegExp(SOFT_HYPHEN, "g");

/** Cuts text into words and the whitespace between them, keeping both. */
export const WHITESPACE_RUNS = /(\s+)/;
