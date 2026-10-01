import { SOFT_HYPHEN, SOFT_HYPHENS, WHITESPACE_RUNS } from "./characters";
import { patternBreaks } from "./engine";
import { lookupException } from "./exceptions";
import { DATA_LEFT_MIN, DATA_RIGHT_MIN } from "./generated/data";
import { findProtectedMask, isProtected } from "./url";

export type HyphenateOptions = {
  /** "body" for running text, "heading" for large type. Default "body". */
  mode?: "body" | "heading";
  /**
   * Heading mode only. "only" (the default) breaks a word at its compound
   * joints alone, when one fits, which suits a heading the browser sets by
   * itself. "prefer" keeps the other breaks too, for a heading that Settle
   * rag balances: it weighs a break away from a joint as a cost and takes one
   * only when that saves a line.
   */
  joints?: "only" | "prefer";
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
   * Your own words, in the exception list's format: one word a line,
   * lowercase, `-` for a break and `=` for a compound joint
   * (`"forn=aldar=frægð"`). They win over the bundled list and the patterns,
   * also with `exceptions: false`. A malformed line throws.
   */
  dictionary?: readonly string[];
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

/**
 * Two-letter syllables that usually link the parts of a compound: the genitive
 * of the first part (`stjórnar-`, `Akur-`, `ráðuneytis-`, `fyrir-`). The
 * patterns allow a break on both sides of one, and the break before it splits
 * the genitive from its stem: `stjórn-arvöld`, `fornald-arfrægð`. Typographic
 * rules drop that break and keep the one after (`stjórnar-völd`).
 */
const LINKING_SYLLABLES: ReadonlySet<string> = new Set(["ar", "ur", "is", "ir"]);

/** Fewest letters a compound's next part needs for a linking syllable to count. */
const MIN_PART_AFTER_LINK = 3;

/**
 * The breaks without any that comes right before a linking syllable which is
 * itself followed by a break and a part of 3 or more letters, so
 * `stjórn·ar·völd` keeps only `stjórnar·völd`. `ang·urs` keeps its break:
 * after `angur` comes only an ending.
 */
function dropLinkingBreaks(
  chars: readonly string[],
  breaks: readonly number[],
  keep: readonly number[] = []
): number[] {
  return breaks.filter(position => {
    const after = position + 2;
    return !(
      !keep.includes(position) &&
      breaks.includes(after) &&
      chars.length - after >= MIN_PART_AFTER_LINK &&
      LINKING_SYLLABLES.has(chars.slice(position, after).join(""))
    );
  });
}

const ENDINGS_LONGEST_FIRST = [...NAME_ENDINGS]
  .map(ending => ({ ending, length: [...ending].length }))
  .sort((a, b) => b.length - a.length);

/**
 * The `NAME_ENDINGS` joint of a lowercase word, as "after N letters", or
 * undefined. A joint only counts when the patterns already allow a break
 * there: it selects among existing breaks and never adds one. The longest
 * matching ending is tried first. Only capitalised words are looked up (see
 * `wordCandidates`): common nouns such as `almannalífeyri` end in the same
 * letters without that joint being their main one.
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

/**
 * Letters Icelandic spelling does not use (z only went out in 1974, so it is
 * not one of them). A capitalised word with one is a foreign name or brand,
 * such as Icelandair or Hollywood, and Icelandic syllable rules split it
 * badly (Ic-elandair).
 */
const FOREIGN_LETTERS = /[cqw]/i;

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

const LETTER_RUNS = /\p{L}+/gu;
// Tokens with `@`, `_` or `#`, a letter glued to a digit (`mp3`, `abc2026`) or
// a slash that is not the Icelandic `orð-/orð` shorthand are skipped whole:
// handles, identifiers and paths. In `COVID-19-faraldurinn` or
// `íþrótta-/tómstundastarfsemi` the words still break. URLs, bare domains and
// email addresses are found by the shared detector in ./url.
const SKIPPED_TOKEN = /[@_#]|\p{L}\p{N}|\p{N}\p{L}/u;

function isSkippedToken(token: string): boolean {
  return SKIPPED_TOKEN.test(token) || (token.includes("/") && !token.includes("-/"));
}

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
  const entry = lookupException(lower, {
    dictionary: options.dictionary,
    bundled: useLists,
  });
  const fits = (position: number) => position >= leftMin && length - position >= rightMin;
  const typographic = (options.rules ?? "typographic") === "typographic";
  // A foreign name stays whole under typographic rules, unless a list gives
  // it breaks.
  const capitalised = chars[0] !== lower[0];
  if (typographic && !entry && capitalised && FOREIGN_LETTERS.test(lower)) {
    return undefined;
  }
  if (entry) {
    // A listed word's hand-marked joints are never dropped.
    const breaks = typographic
      ? dropLinkingBreaks([...lower], entry.breaks, entry.joints)
      : entry.breaks;
    return { breaks, joints: entry.joints, fits };
  }

  const patterns = patternBreaks(lower);
  const breaks = typographic ? dropLinkingBreaks([...lower], patterns) : patterns;
  if (!(useLists && withJoints)) {
    return { breaks, joints: [], fits };
  }
  // The break kept after a linking syllable is a compound's joint
  // (`sveitar|stjórnar|kosningum`), and so is a name's ending.
  const joints = new Set(linkedJoints(patterns, breaks));
  const joint = capitalised ? nameJoint(lower, length, breaks) : undefined;
  if (joint !== undefined) {
    joints.add(joint);
  }
  return { breaks, joints: [...joints].sort((a, b) => a - b), fits };
}

/**
 * The breaks that `dropLinkingBreaks` kept after a linking syllable: where it
 * dropped a break at p, the one at p + 2 ends the genitive, which is where the
 * compound joins (`stjórnar|völd`).
 */
function linkedJoints(patterns: readonly number[], kept: readonly number[]): number[] {
  return patterns
    .filter(position => !kept.includes(position) && kept.includes(position + 2))
    .map(position => position + 2);
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
  // In heading mode a joint that fits the limits replaces the other breaks. A
  // word whose joints all fall too near an end (`Aðalsteins·son`) keeps its
  // other breaks instead of losing every one. In body mode joints change nothing.
  const joints =
    heading && options.joints !== "prefer" ? found.joints.filter(found.fits) : [];
  return joints.length > 0 ? joints : found.breaks.filter(found.fits);
}

/**
 * The breaks of one word and the compound joints among them, both as "after N
 * letters", ascending. `breaks` is what `hyphenateWord` gives in body mode.
 * `joints` is where heading mode would prefer to break: the `=` joints of a
 * listed word, or, with typographic rules, the break after a linking
 * syllable (`stjórnar|völd`) and the `NAME_ENDINGS` joint. It is always a
 * subset of `breaks`.
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
  return offsetsInClean(cleanText(text), options);
}

/** `breakOffsets` for text that is already clean (see `cleanText`). */
function offsetsInClean(clean: string, options: HyphenateOptions): number[] {
  const mask = findProtectedMask(clean);

  const offsets: number[] = [];
  let tokenStart = 0;
  for (const token of clean.split(WHITESPACE_RUNS)) {
    const base = tokenStart;
    tokenStart += token.length;
    if (token === "" || isSkippedToken(token)) {
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
 * are removed first. URLs, bare domains, email addresses, tokens with `@`,
 * `_` or `#`, a letter glued to a digit or a path-like `/` pass through
 * untouched, as do punctuation, whitespace and emoji.
 *
 * Idempotence covers the default soft hyphen. With a custom `hyphenChar` the
 * caller owns removing it before a second run.
 */
export function hyphenate(text: string, options: HyphenateOptions = {}): string {
  const clean = cleanText(text);
  return insertAt(
    clean,
    offsetsInClean(clean, options),
    options.hyphenChar ?? SOFT_HYPHEN
  );
}
