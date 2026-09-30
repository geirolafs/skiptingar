import { patternBreaks } from "./engine";
import { lookupException } from "./exceptions";
import { findProtectedMask, isProtected } from "./url";

export type HyphenateOptions = {
  /** "body" for running text, "heading" for large type. Default "body". */
  mode?: "body" | "heading";
  /** "typographic" is conservative, "ritreglur" follows the spelling rules. */
  rules?: "typographic" | "ritreglur";
  /** Words shorter than this many letters are left alone. Overrides the preset. */
  minWordLength?: number;
  /** Fewest letters before a break. Overrides the preset. */
  leftMin?: number;
  /** Fewest letters after a break. Overrides the preset. */
  rightMin?: number;
  /** Character inserted at each break. Default is the soft hyphen U+00AD. */
  hyphenChar?: string;
  /**
   * Use the exception list and the `NAME_ENDINGS` joints (heading mode).
   * `false` gives raw pattern output. Default true.
   */
  exceptions?: boolean;
  /**
   * Leave all-caps words of `ACRONYM_LENGTH.min` to `ACRONYM_LENGTH.max`
   * letters alone, so `UNESCO` and `NATO` never break. Longer all-caps words
   * still break. Default true.
   */
  skipAcronyms?: boolean;
};

/**
 * The range of all-caps word lengths that count as acronyms. This is a design
 * choice, not a spelling rule: `UNESCO`, `UNICEF`, `NATO` and `OECD` fall
 * inside it, `KEFLAVÍKURFLUGVÖLLUR` does not.
 */
export const ACRONYM_LENGTH = { min: 4, max: 8 } as const;

/**
 * Productive second elements of place names and patronymics, in lowercase.
 * Ritreglur 33.1 prefers to break a compound at its joint, and the patterns
 * alone give `Ak-ur-eyri` and `Sig-urð-ar-dóttir`. When a word ends with one of
 * these and the part before it has at least `MIN_NAME_STEM` letters, heading
 * mode prefers that boundary, but only when the patterns already allow a break
 * there. It never adds a break and never changes body mode (`majónes` stays
 * `maj-ónes`). Inflected forms whose base changes are listed too (`firði`,
 * `fjarðar`, `dóttur`).
 */
export const NAME_ENDINGS: readonly string[] = [
  "dóttir",
  "dóttur",
  "son",
  "eyri",
  "fjörður",
  "firði",
  "fjarðar",
  "vík",
  "víkur",
  "staðir",
  "staða",
  "vellir",
  "völlum",
  "nes",
  "land",
  "bær",
  "dalur",
  "dals",
  "höfn",
  "fell",
  "holt",
  "hólmur",
  "vogur",
  "gerði",
  "hlíð",
  "lón",
  "ey",
  "eyjar",
];

/** Fewest letters the part before a `NAME_ENDINGS` ending needs. */
const MIN_NAME_STEM = 3;

const ENDINGS_LONGEST_FIRST = [...NAME_ENDINGS]
  .map(ending => ({ ending, length: [...ending].length }))
  .sort((a, b) => b.length - a.length);

/**
 * The `NAME_ENDINGS` joint of a lowercase word, as "after N letters", or
 * undefined. A joint only counts when the patterns already allow a break
 * there: it selects among existing breaks and never adds one. The longest
 * matching ending is tried first.
 */
function nameJoint(
  lower: string,
  length: number,
  allowed: readonly number[]
): number | undefined {
  for (const { ending, length: endingLength } of ENDINGS_LONGEST_FIRST) {
    const joint = length - endingLength;
    if (joint >= MIN_NAME_STEM && lower.endsWith(ending) && allowed.includes(joint)) {
      return joint;
    }
  }
  return undefined;
}

function isAcronym(word: string, length: number): boolean {
  return (
    length >= ACRONYM_LENGTH.min &&
    length <= ACRONYM_LENGTH.max &&
    word === word.toUpperCase() &&
    word !== word.toLowerCase()
  );
}

type Limits = { minWordLength: number; leftMin: number; rightMin: number };

const SOFT_HYPHEN = "­";

const PRESETS = {
  typographic: {
    body: { minWordLength: 6, leftMin: 2, rightMin: 3 },
    heading: { minWordLength: 12, leftMin: 3, rightMin: 4 },
  },
  ritreglur: {
    body: { minWordLength: 4, leftMin: 1, rightMin: 2 },
    heading: { minWordLength: 4, leftMin: 1, rightMin: 2 },
  },
} as const satisfies Record<string, Record<string, Limits>>;

const SOFT_HYPHENS = /­/g;
const WHITESPACE_RUNS = /(\s+)/;
const LETTER_RUNS = /\p{L}+/gu;
// Tokens with a digit, `@`, `/`, `_` or `#` are skipped whole. URLs, bare
// domains and email addresses are found by the shared detector in ./url.
const SKIPPED_TOKEN = /[\p{N}@/_#]/u;

function resolveLimits(options: HyphenateOptions): Limits {
  const preset = PRESETS[options.rules ?? "typographic"][options.mode ?? "body"];
  return {
    minWordLength: options.minWordLength ?? preset.minWordLength,
    // A break needs at least one letter on each side.
    leftMin: Math.max(1, options.leftMin ?? preset.leftMin),
    rightMin: Math.max(1, options.rightMin ?? preset.rightMin),
  };
}

/** Lowercases one code point at a time so letter positions never shift. */
function lowerKeepingLength(chars: string[]): string {
  return chars
    .map(ch => {
      const lower = ch.toLowerCase();
      return [...lower].length === 1 ? lower : ch;
    })
    .join("");
}

/**
 * Break positions for one word, as "after N letters" (code points of the NFC
 * form), ascending.
 * The word must be letters only. The original case is fine.
 */
export function hyphenateWord(word: string, options: HyphenateOptions = {}): number[] {
  const { minWordLength, leftMin, rightMin } = resolveLimits(options);
  const chars = [...word.normalize("NFC")];
  const length = chars.length;
  if (length < minWordLength || length < 2) {
    return [];
  }

  if (options.skipAcronyms !== false && isAcronym(chars.join(""), length)) {
    return [];
  }

  const lower = lowerKeepingLength(chars);
  const useLists = options.exceptions !== false;
  const entry = useLists ? lookupException(lower) : undefined;
  const heading = options.mode === "heading";

  let candidates: readonly number[];
  if (entry) {
    // A listed word wins over everything else.
    candidates = heading && entry.joints.length > 0 ? entry.joints : entry.breaks;
  } else {
    // In heading mode a name joint that the patterns allow is preferred. In
    // body mode NAME_ENDINGS changes nothing.
    const fromPatterns = patternBreaks(lower);
    const joint =
      useLists && heading ? nameJoint(lower, length, fromPatterns) : undefined;
    candidates = joint === undefined ? fromPatterns : [joint];
  }

  return candidates.filter(i => i >= leftMin && length - i >= rightMin);
}

function hyphenateRun(
  run: string,
  options: HyphenateOptions,
  hyphenChar: string
): string {
  const breaks = hyphenateWord(run, options);
  if (breaks.length === 0) {
    return run;
  }
  const chars = [...run];
  let out = "";
  let from = 0;
  for (const at of breaks) {
    out += chars.slice(from, at).join("") + hyphenChar;
    from = at;
  }
  return out + chars.slice(from).join("");
}

/**
 * Inserts break points into Icelandic text. Idempotent: existing soft hyphens
 * are removed first. URLs, bare domains, email addresses and tokens with
 * digits, `@`, `/`, `_` or `#` pass through untouched, as do punctuation,
 * whitespace and emoji.
 *
 * Idempotence covers the default soft hyphen. With a custom `hyphenChar` the
 * caller owns removing it before a second run.
 */
export function hyphenate(text: string, options: HyphenateOptions = {}): string {
  const hyphenChar = options.hyphenChar ?? SOFT_HYPHEN;
  // NFC first: a decomposed "á" (a + U+0301) would otherwise split the word.
  const clean = text.replace(SOFT_HYPHENS, "").normalize("NFC");
  const mask = findProtectedMask(clean);

  let tokenStart = 0;
  return clean
    .split(WHITESPACE_RUNS)
    .map(token => {
      const base = tokenStart;
      tokenStart += token.length;
      if (token === "" || SKIPPED_TOKEN.test(token)) {
        return token;
      }
      return token.replace(LETTER_RUNS, (run, offset: number) =>
        isProtected(mask, base + offset, base + offset + run.length)
          ? run
          : hyphenateRun(run, options, hyphenChar)
      );
    })
    .join("");
}
