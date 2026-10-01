import { SOFT_HYPHEN } from "./characters";
import { patternBreaks } from "./engine";
import { lookupException } from "./exceptions";
import { DATA_LEFT_MIN, DATA_RIGHT_MIN } from "./generated/data";
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

const PRESETS = {
  typographic: {
    body: { minWordLength: 6, leftMin: 2, rightMin: 3 },
    heading: { minWordLength: 12, leftMin: 3, rightMin: 4 },
  },
  ritreglur: {
    body: { minWordLength: 4, leftMin: DATA_LEFT_MIN, rightMin: DATA_RIGHT_MIN },
    heading: { minWordLength: 4, leftMin: DATA_LEFT_MIN, rightMin: DATA_RIGHT_MIN },
  },
} as const satisfies Record<string, Record<string, Limits>>;

const SOFT_HYPHENS = new RegExp(SOFT_HYPHEN, "g");
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

type WordCandidates = {
  /** Every break the word allows before the limits apply, joints included. */
  breaks: readonly number[];
  /** The compound joints among them. Empty unless `withJoints` was asked for. */
  joints: readonly number[];
  /** Whether a break "after N letters" respects the left and right minimums. */
  fits: (position: number) => boolean;
};

/**
 * What the lists and the patterns say about one word, or `undefined` when the
 * word is too short or is an acronym. A listed word wins over the patterns.
 * The `NAME_ENDINGS` joint is only looked up when `withJoints` is set,
 * because body mode does not use it.
 */
function wordCandidates(
  word: string,
  options: HyphenateOptions,
  withJoints: boolean
): WordCandidates | undefined {
  const { minWordLength, leftMin, rightMin } = resolveLimits(options);
  const chars = [...word.normalize("NFC")];
  const length = chars.length;
  if (length < minWordLength || length < 2) {
    return undefined;
  }

  if (options.skipAcronyms !== false && isAcronym(chars.join(""), length)) {
    return undefined;
  }

  const lower = lowerKeepingLength(chars);
  const useLists = options.exceptions !== false;
  const entry = useLists ? lookupException(lower) : undefined;
  const fits = (position: number) => position >= leftMin && length - position >= rightMin;
  if (entry) {
    return { breaks: entry.breaks, joints: entry.joints, fits };
  }

  const breaks = patternBreaks(lower);
  const joint = useLists && withJoints ? nameJoint(lower, length, breaks) : undefined;
  return { breaks, joints: joint === undefined ? [] : [joint], fits };
}

/**
 * Break positions for one word, as "after N letters" (code points of the NFC
 * form), ascending.
 * The word must be letters only. The original case is fine.
 */
export function hyphenateWord(word: string, options: HyphenateOptions = {}): number[] {
  const heading = options.mode === "heading";
  const found = wordCandidates(word, options, heading);
  if (!found) {
    return [];
  }
  // In heading mode a joint, when there is one, replaces the other breaks. In
  // body mode joints change nothing.
  const candidates = heading && found.joints.length > 0 ? found.joints : found.breaks;
  return candidates.filter(found.fits);
}

/**
 * The breaks of one word and the compound joints among them, both as "after N
 * letters", ascending. `breaks` is what `hyphenateWord` gives in body mode.
 * `joints` is where heading mode would prefer to break: the `=` joints of a
 * listed word, or the `NAME_ENDINGS` joint. It is always a subset of `breaks`.
 * The limits (`leftMin`, `rightMin`) apply to both.
 */
export function analyzeWord(
  word: string,
  options: HyphenateOptions = {}
): { breaks: number[]; joints: number[] } {
  const found = wordCandidates(word, options, true);
  if (!found) {
    return { breaks: [], joints: [] };
  }
  return {
    breaks: found.breaks.filter(found.fits),
    joints: found.joints.filter(found.fits),
  };
}

/** Code-unit offset of the letter "after N letters" in `run`, from `start`. */
function offsetAfter(run: string, letters: number, start: number): number {
  let units = 0;
  let seen = 0;
  for (const ch of run) {
    if (seen === letters) {
      break;
    }
    units += ch.length;
    seen += 1;
  }
  return start + units;
}

/** The text with soft hyphens removed and in NFC. Offsets refer to this form. */
function cleanText(text: string): string {
  // NFC first: a decomposed "á" (a + U+0301) would otherwise split the word.
  return text.replace(SOFT_HYPHENS, "").normalize("NFC");
}

/**
 * Where `hyphenate()` would put a break, as offsets into the text after
 * soft hyphens are removed and it is put in NFC. A hyphen goes before the
 * character at each offset. Ascending. Skips the same things `hyphenate()` skips.
 *
 * Use this to hyphenate text that is cut into pieces: join the pieces, ask for
 * the offsets once, and cut them back.
 */
export function breakOffsets(text: string, options: HyphenateOptions = {}): number[] {
  const clean = cleanText(text);
  const mask = findProtectedMask(clean);

  const offsets: number[] = [];
  let tokenStart = 0;
  for (const token of clean.split(WHITESPACE_RUNS)) {
    const base = tokenStart;
    tokenStart += token.length;
    if (token === "" || SKIPPED_TOKEN.test(token)) {
      continue;
    }
    for (const match of token.matchAll(LETTER_RUNS)) {
      const run = match[0];
      const start = base + match.index;
      if (isProtected(mask, start, start + run.length)) {
        continue;
      }
      for (const letters of hyphenateWord(run, options)) {
        offsets.push(offsetAfter(run, letters, start));
      }
    }
  }
  return offsets;
}

/** Inserts `mark` into `text` before each offset. Offsets are ascending. */
function insertAt(text: string, offsets: readonly number[], mark: string): string {
  let out = "";
  let from = 0;
  for (const at of offsets) {
    out += text.slice(from, at) + mark;
    from = at;
  }
  return out + text.slice(from);
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
  const clean = cleanText(text);
  return insertAt(clean, breakOffsets(clean, options), options.hyphenChar ?? SOFT_HYPHEN);
}
