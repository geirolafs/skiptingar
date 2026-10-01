/**
 * Icelandic typographic fixes that only swap one character for another, so
 * the length of the text never changes:
 *   space -> no-break space (U+00A0), quote -> quote, hyphen -> en dash.
 * That is what lets `typesetSegments` join the segments, apply the rules
 * across their borders and cut the result back at the original offsets.
 *
 * Typeset normalises each segment to NFC first, so a decomposed "á"
 * (a + U+0301) is read as one letter. The segments it returns keep the NFC
 * length.
 */
import { NO_BREAK_SPACE, NON_BREAKING_HYPHEN } from "./characters";
import { findProtectedMask, isProtected, type Mask } from "./url";

export type TypesetOptions = {
  /** "typographic" turns every opt-in rule on. Explicit options still win. */
  preset?: "default" | "typographic";
  /**
   * Icelandic double quotes „…“, and a paired single quote as ‚…‘, the mark
   * for a word's meaning. Default true.
   */
  quotes?: boolean;
  /** No-break space after one-letter words. Default false. */
  singleLetter?: boolean;
  /** No-break space between the last two words of the text. Default false. */
  lastWords?: boolean;
  /** En dashes in number ranges and spaced hyphens. Default false. */
  dashes?: boolean;
  /**
   * Keep kennitala and phone numbers on one line: `010190-2939`, `555-1234`,
   * `555 1234`, `+354 555 1234`. Hyphens become U+2011 NON-BREAKING HYPHEN and
   * spaces become no-break spaces. Default true.
   */
  numbers?: boolean;
};

/** Units and currencies that stay attached to the number before them. */
export const NUMBER_UNITS: readonly string[] = [
  "kr.",
  "kr",
  "ISK",
  "EUR",
  "USD",
  "GBP",
  "°C",
  "°F",
  "km",
  "m",
  "cm",
  "mm",
  "kg",
  "mg",
  "g",
  "l",
  "dl",
  "cl",
  "ml",
  "mín.",
  "klst.",
  "sek.",
  "ár",
  "bls.",
  "stk.",
];

/**
 * Abbreviation prefixes that stay attached to the number after them:
 * `nr. 5`, `bls. 12`, `kl. 14.30`, `gr. 3`, `ca. 20`. The no-break space keeps
 * the pair together on one line. Matching is case-insensitive.
 */
export const NUMBER_PREFIXES: readonly string[] = [
  "nr.",
  "bls.",
  "kl.",
  "gr.",
  "sbr.",
  "mgr.",
  "tölul.",
  "u.þ.b.",
  "ca.",
];

/**
 * Older spaced forms of abbreviations, split into their parts: `t. d.`,
 * `o. s. frv.`. Standard Icelandic writes these without spaces (`t.d.`,
 * `o.s.frv.`), which cannot break across lines and needs no help. This list
 * only tolerates older or sloppy text.
 */
export const SPACED_ABBREVIATIONS: readonly (readonly string[])[] = [
  ["t.", "d."],
  ["o.", "s.", "frv."],
  ["þ.", "e."],
  ["þ.", "e.", "a.", "s."],
  ["m.", "a."],
  ["o.", "fl."],
  ["u.", "þ.", "b."],
  ["a.", "m.", "k."],
];

const MONTHS = [
  "janúar",
  "febrúar",
  "mars",
  "apríl",
  "maí",
  "júní",
  "júlí",
  "ágúst",
  "september",
  "október",
  "nóvember",
  "desember",
  "jan.",
  "feb.",
  "mar.",
  "apr.",
  "jún.",
  "júl.",
  "ágú.",
  "sept.",
  "sep.",
  "okt.",
  "nóv.",
  "des.",
];

const TITLES = ["dr", "sr", "próf", "hr"];

// `[ \u00A0]` is used wherever a rule reads a space, so a second run sees the
// no-break spaces from the first run and produces the same result.
const SP = "[ \\u00A0]";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternation(values: readonly string[]): string {
  return [...values]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
}

function titleAlternation(): string {
  return TITLES.map(title => {
    const [first = "", ...rest] = title;
    return `[${first.toUpperCase()}${first}]${escapeRegExp(rest.join(""))}`;
  }).join("|");
}

const NUMBER_UNIT = new RegExp(
  `(?<![\\p{L}\\p{N}])\\d+(?:\\.\\d{3})*(?:,\\d+)?${SP}(?:${alternation(NUMBER_UNITS)})(?![\\p{L}\\p{N}])`,
  "gu"
);
const ORDINAL = new RegExp(`(?<![\\p{L}\\p{N}])\\d+\\.${SP}(?=\\p{Ll})`, "gu");
const MONTH_YEAR = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${alternation(MONTHS)})${SP}(?=\\d{4}(?!\\d))`,
  "giu"
);
// Preceded by the start, whitespace, "(" or an opening quote mark.
const NUMBER_PREFIX = new RegExp(
  `(?<![^\\s("'„‚‘“])(?:${alternation(NUMBER_PREFIXES)})${SP}(?=\\d)`,
  "giu"
);
// Older spaced forms such as "t. d." (see SPACED_ABBREVIATIONS).
const SPACED_ABBREVIATION = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...SPACED_ABBREVIATIONS]
    .sort((a, b) => b.join(" ").length - a.join(" ").length)
    .map(parts => parts.map(escapeRegExp).join(SP))
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu"
);
const TITLE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${titleAlternation()})\\.${SP}(?=\\p{Lu})`,
  "gu"
);
const SINGLE_LETTER = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}'’-])\\p{L}${SP}(?=\\S)`, "gu");
const LAST_WORDS = new RegExp(
  `(?<=\\S)${SP}(?=\\p{L}{1,10}[^\\p{L}\\p{N}\\s]*\\s*$)`,
  "gu"
);
// Kennitala (6 digits, 4 digits), phone numbers (3 and 4 digits) and +354
// numbers, joined by a hyphen or a space. U+2011 is matched too, so a second
// run sees its own output. The number must stand alone: not inside a longer
// digit run, not a decimal, not part of "1990-2000" (4 digits on the left).
const PHONE_SEPARATOR = "[ \\u00A0\\u2011-]";
/** Digits on each side of the separator: kennitala (6 and 4), phone number (3 and 4). */
const PHONE_SHAPES = [
  [6, 4],
  [3, 4],
] as const;
const PHONE_SHAPE_ALTERNATION = PHONE_SHAPES.map(
  ([left, right]) => `\\d{${left}}${PHONE_SEPARATOR}\\d{${right}}`
).join("|");
// The characters just outside the number must not be a letter or a digit of any
// script (\p{Nd}), so "a555-1234b" and fullwidth digits are left alone.
const STANDALONE_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{Nd}.,+\\u2011-])(?<!\\p{Nd}[ \\u00A0\\u2011-])(?:\\+354${SP}\\d{3}${PHONE_SEPARATOR}?\\d{4}|${PHONE_SHAPE_ALTERNATION})(?![\\p{L}\\p{Nd}])(?!${PHONE_SEPARATOR}?\\p{Nd}|[.,]\\p{Nd})`,
  "gu"
);
// A range stands alone: no letter, digit or hyphen touches it, so "AB12-34CD",
// "A4-2024" and "F-35" are not ranges.
const YEAR_RANGE = /(?<![\p{L}\p{N}-])(\d+)-(\d+)(?![\p{L}\p{N}-])/gu;
const SPACED_HYPHEN = new RegExp(`(?<=\\p{L}${SP})-(?=${SP}\\p{L})`, "gu");

const OPENING_CONTEXT = /[\s([{—–\-„‚]/u;
const LETTER = /\p{L}/u;

/** Replaces regex matches outside the mask. Replacements keep the length. */
function replaceMatches(
  text: string,
  pattern: RegExp,
  mask: Mask,
  replacement: (match: string, groups: string[]) => string
): string {
  let out = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (isProtected(mask, start, end)) {
      continue;
    }
    const replaced = replacement(match[0], match.slice(1));
    out += text.slice(cursor, start) + replaced;
    cursor = end;
  }
  return out + text.slice(cursor);
}

function bindSpaces(text: string, pattern: RegExp, mask: Mask): string {
  return replaceMatches(text, pattern, mask, match =>
    match.replace(/ /g, NO_BREAK_SPACE)
  );
}

function isApostrophe(text: string, index: number): boolean {
  return LETTER.test(text[index - 1] ?? "") && LETTER.test(text[index + 1] ?? "");
}

type QuoteMark = {
  index: number;
  kind: "double" | "single";
  opening: boolean;
};

const DOUBLE_QUOTES = new Set(['"', "“", "”", "„"]);
const SINGLE_QUOTES = new Set(["'", "‘", "’", "‚"]);

/**
 * Finds every quote mark and decides whether it opens or closes.
 *
 * `„` and `‚` always open. Every other mark opens when the character before it
 * is the start of the text, whitespace, or one of `([{—–-„‚`. That character is
 * read AFTER conversion (an opening mark counts as `„` or `‚`, a closing mark
 * as `“` or `‘`), so the first run already reaches the final result and a
 * second run decides the same way.
 */
function findQuoteMarks(text: string, mask: Mask): QuoteMark[] {
  const marks: QuoteMark[] = [];
  let previous = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    const isDouble = DOUBLE_QUOTES.has(ch);
    const isSingle = SINGLE_QUOTES.has(ch);
    if (mask[i] === 1 || !(isDouble || isSingle) || (isSingle && isApostrophe(text, i))) {
      previous = ch;
      continue;
    }
    const fixedOpener = ch === "„" || ch === "‚";
    // A curly right single quote is an apostrophe or a closer, never an opener.
    const neverOpens = ch === "’";
    const opening =
      !neverOpens && (fixedOpener || i === 0 || OPENING_CONTEXT.test(previous));
    marks.push({ index: i, kind: isDouble ? "double" : "single", opening });
    if (isDouble) {
      previous = opening ? "„" : "“";
    } else {
      previous = opening ? "‚" : "‘";
    }
  }
  return marks;
}

/** Marks that pair up: opener and closer of a double-quoted span. */
function matchDoubles(marks: readonly QuoteMark[]): Set<QuoteMark> {
  const matched = new Set<QuoteMark>();
  const open: QuoteMark[] = [];
  for (const mark of marks) {
    if (mark.kind !== "double") {
      continue;
    }
    if (mark.opening) {
      open.push(mark);
    } else {
      const opener = open.pop();
      if (opener) {
        matched.add(opener);
        matched.add(mark);
      }
    }
  }
  return matched;
}

/**
 * Icelandic quotes. Double quotes become „…“. A paired single quote `'…'` (or
 * English `‘…’`) becomes ‚…‘, the mark for a word's meaning (Ritreglur 28.2):
 * `Orðið fákur merkir 'hestur'` -> `Orðið fákur merkir ‚hestur‘`. A quote
 * inside a quote uses „…“ again (28.1), so the writer types it that way.
 *
 * Only complete pairs are converted. A double quote with no partner is left
 * exactly as typed rather than producing an unclosed „. A single quote is
 * converted only as an opener plus closer, anywhere in the text. Inside a
 * double-quoted span the pair must sit inside that span. A lone one
 * (`'twas`, `hundanna'`) is left alone, and so is an apostrophe between letters.
 */
function applyQuotes(text: string, mask: Mask): string {
  const marks = findQuoteMarks(text, mask);
  const matchedDoubles = matchDoubles(marks);
  const chars = text.split("");

  // One frame per open double-quoted span, holding its unmatched single
  // openers. The first frame is the text outside any double-quoted span.
  const frames: QuoteMark[][] = [[]];
  for (const mark of marks) {
    if (mark.kind === "double") {
      if (!matchedDoubles.has(mark)) {
        continue;
      }
      chars[mark.index] = mark.opening ? "„" : "“";
      if (mark.opening) {
        frames.push([]);
      } else if (frames.length > 1) {
        frames.pop();
      }
      continue;
    }
    const frame = frames.at(-1);
    if (!frame) {
      continue;
    }
    if (mark.opening) {
      frame.push(mark);
      continue;
    }
    const opener = frame.pop();
    if (opener) {
      chars[opener.index] = "‚";
      chars[mark.index] = "‘";
    }
  }
  return chars.join("");
}

/**
 * Whether `a-b` is a range. Phone numbers (555-1234) and kennitala
 * (010190-2939) keep their hyphen. So does a part number such as ISO 8601-1:
 * a four-digit number with a one-digit part.
 */
function isRange(a: string, b: string): boolean {
  const isPhone = PHONE_SHAPES.some(
    ([left, right]) => a.length === left && b.length === right
  );
  return !(isPhone || (a.length === 4 && b.length === 1));
}

function applyDashes(text: string, mask: Mask): string {
  const withRanges = replaceMatches(text, YEAR_RANGE, mask, (match, [a = "", b = ""]) =>
    isRange(a, b) ? match.replace("-", "–") : match
  );
  return replaceMatches(withRanges, SPACED_HYPHEN, mask, () => "–");
}

type ResolvedOptions = Required<Omit<TypesetOptions, "preset">>;

function resolveOptions(options: TypesetOptions): ResolvedOptions {
  const all = options.preset === "typographic";
  return {
    quotes: options.quotes ?? true,
    singleLetter: options.singleLetter ?? all,
    lastWords: options.lastWords ?? all,
    dashes: options.dashes ?? all,
    numbers: options.numbers ?? true,
  };
}

function typesetText(text: string, options: ResolvedOptions): string {
  const mask = findProtectedMask(text);
  let out = text;

  if (options.quotes) {
    out = applyQuotes(out, mask);
  }
  for (const pattern of [
    NUMBER_UNIT,
    NUMBER_PREFIX,
    ORDINAL,
    MONTH_YEAR,
    SPACED_ABBREVIATION,
    TITLE,
  ]) {
    out = bindSpaces(out, pattern, mask);
  }
  if (options.numbers) {
    out = replaceMatches(out, STANDALONE_NUMBER, mask, match =>
      match.replace(/ /g, NO_BREAK_SPACE).replace(/-/g, NON_BREAKING_HYPHEN)
    );
  }
  if (options.singleLetter) {
    out = bindSpaces(out, SINGLE_LETTER, mask);
  }
  if (options.lastWords) {
    out = bindSpaces(out, LAST_WORDS, mask);
  }
  if (options.dashes) {
    out = applyDashes(out, mask);
  }
  return out;
}

/**
 * Typesets adjacent text segments (for example the text nodes of a JSX tree
 * split by inline elements). Rules see the joined text, so they work across
 * segment borders. Each segment is normalised to NFC first. Returns the same
 * number of segments, each with its NFC length.
 */
export function typesetSegments(
  segments: readonly string[],
  options: TypesetOptions = {}
): string[] {
  const normalised = segments.map(segment => segment.normalize("NFC"));
  const joined = normalised.join("");
  const result = typesetText(joined, resolveOptions(options));
  if (result.length !== joined.length) {
    throw new Error("typeset changed the text length, which segments cannot map back");
  }

  let offset = 0;
  return normalised.map(segment => {
    const part = result.slice(offset, offset + segment.length);
    offset += segment.length;
    return part;
  });
}

/** Typesets one string. Same as `typesetSegments([text])[0]`. */
export function typeset(text: string, options: TypesetOptions = {}): string {
  return typesetSegments([text], options)[0] ?? "";
}
