/**
 * Settling the rag: the right edge of a paragraph, judged the way a
 * typesetter judges it.
 *
 * A typesetter looks at each line end. A short word such as "og" or "í" left
 * at the end reads badly; a word that sticks out past the lines around it
 * leaves a hole in the edge. The fix is the same for both: push the line's
 * last word down to the next line, set the paragraph again, and keep the
 * move only if the whole edge got better. Sometimes the move makes the lines
 * below worse, and the word stays.
 *
 * This file holds the parts that need no browser: which words are short, how
 * a set of lines is scored, and how the moves are written into the text. The
 * client entry (`client/rag.ts`) measures the real lines and runs the
 * judgement.
 */
import { NO_BREAK_SPACE, SOFT_HYPHEN } from "./characters";

/**
 * Icelandic words that read badly at the end of a line: conjunctions,
 * prepositions and the infinitive marker, which all lean on the word after
 * them. Every one-letter word counts too (see `isShortWord`).
 */
export const SHORT_WORDS: readonly string[] = [
  "og",
  "en",
  "eða",
  "né",
  "sem",
  "ef",
  "þó",
  "að",
  "um",
  "við",
  "til",
  "frá",
  "með",
  "úr",
  "af",
  "hjá",
  "yfir",
  "undir",
  "eftir",
  "gegn",
  "er",
];

const SHORT_WORD_SET: ReadonlySet<string> = new Set(SHORT_WORDS);

/** True for a word on the list, or any one-letter word, in any case. */
export function isShortWord(word: string): boolean {
  const lower = word.toLocaleLowerCase("is");
  return [...lower].length === 1 || SHORT_WORD_SET.has(lower);
}

/** A run of letters with no soft hyphen, then the plain space after it. */
const WORD_THEN_SPACE = /(\p{L}+) /gu;
const OPENING = /[\s(„"‚'[—–-]/u;

/**
 * The index of each plain space that follows a short word. A short word
 * inside a longer one ("hog" is not "og") does not count: the word must start
 * the text or follow a space or an opening mark.
 */
export function shortWordSpaces(text: string): number[] {
  const spaces: number[] = [];
  for (const match of text.matchAll(WORD_THEN_SPACE)) {
    const word = match[1] ?? "";
    const start = match.index;
    const before = start > 0 ? text[start - 1] : undefined;
    if ((before === undefined || OPENING.test(before)) && isShortWord(word)) {
      spaces.push(start + word.length);
    }
  }
  return spaces;
}

/** The places a line may break and a move can forbid: plain spaces and soft hyphens. */
export function breakOpportunities(text: string): number[] {
  const indices: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === " " || character === SOFT_HYPHEN) {
      indices.push(index);
    }
  }
  return indices;
}

/**
 * A line end that goes past the edge: the index of the line's last
 * character, and how far it overhangs, in px.
 */
export type Hang = { index: number; width: number };

/**
 * The text with its breaks forbidden (`forbidBreaks`), and the hangs moved
 * to their place in it: removing a soft hyphen shifts every index after it.
 */
export function applyRag(
  text: string,
  forbidden: readonly number[],
  hangs: readonly Hang[] = []
): { text: string; hangs: Hang[] } {
  const removed = new Set(forbidden.filter(index => text[index] === SOFT_HYPHEN));
  const shift = (index: number) => {
    let count = 0;
    for (const at of removed) {
      if (at < index) {
        count += 1;
      }
    }
    return index - count;
  };
  return {
    text: forbidBreaks(text, forbidden),
    hangs: hangs.map(hang => ({ index: shift(hang.index), width: hang.width })),
  };
}

/** U+2060 WORD JOINER: zero width, no break. Stands in for a forbidden soft hyphen in a trial. */
const WORD_JOINER = "⁠";

/**
 * The text with the given breaks forbidden. A forbidden space becomes a
 * no-break space. A forbidden soft hyphen is removed, or, with `keepLength`,
 * replaced by a word joiner so every index still points at the same
 * character (for trials, which are measured by index).
 */
export function forbidBreaks(
  text: string,
  forbidden: Iterable<number>,
  { keepLength = false }: { keepLength?: boolean } = {}
): string {
  const set = new Set(forbidden);
  if (set.size === 0) {
    return text;
  }
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (!set.has(index)) {
      out += character;
    } else if (character === " ") {
      out += NO_BREAK_SPACE;
    } else if (character === SOFT_HYPHEN) {
      out += keepLength ? WORD_JOINER : "";
    } else {
      out += character;
    }
  }
  return out;
}

/**
 * One measured line: how wide its text is, in px, and how it ends. A line
 * ending at a soft hyphen carries the letters on each side of the break.
 */
export type MeasuredLine = {
  width: number;
  hangingShortWord?: boolean;
  hyphen?: { before: number; after: number };
};

export type RagOptions = {
  /**
   * What one short word left at a line's end costs. A line short by a fifth
   * of the measure costs 0.04 for its gap, so the default makes a hanging
   * "og" about as bad as that. Higher moves more of them down.
   */
  shortWordWeight?: number;
  /**
   * How much a hole costs against plain gaps: a line shorter than both lines
   * around it. Its depth (as a share of the measure) is squared and
   * multiplied by this. Higher evens out the edge's shape more eagerly.
   */
  holeWeight?: number;
  /**
   * How much a step between two lines costs: a line that juts out past the
   * one above it, or falls far short of it. The step (as a share of the
   * measure) is squared and multiplied by this.
   */
  stepWeight?: number;
  /** What any line ending in a hyphen costs, so a break is used only when it helps. */
  hyphenWeight?: number;
  /**
   * What a hyphen costs on top when it leaves a piece of `shortPiece` letters
   * or fewer on either side, like "far-" or "til-": legal, but a typesetter
   * avoids them if at all possible. The default makes one about as bad as a
   * line left half empty.
   */
  shortPieceWeight?: number;
  /** The most letters a piece can have and still count as short. */
  shortPiece?: number;
  /** What a hyphen costs on top when the line above also ends in one. */
  ladderWeight?: number;
  /**
   * How far a line's last character may go past the edge, the cheat a
   * typesetter makes by hand: in em at 16px text, about one letter at 0.5.
   * Bigger type gets a smaller share of its size (see `overhangAllowance` in
   * the client entry), and a line never overhangs by more than its last
   * character. 0 turns the cheat off. A line uses it only when it would not
   * fit otherwise and the whole paragraph is better for it.
   */
  overshoot?: number;
};

export const DEFAULT_RAG_OPTIONS: Required<RagOptions> = {
  shortWordWeight: 0.04,
  holeWeight: 6,
  stepWeight: 2,
  hyphenWeight: 0.01,
  shortPieceWeight: 0.25,
  shortPiece: 3,
  ladderWeight: 0.02,
  overshoot: 0,
};

/**
 * What one line costs, as any line but the last; `before` and `after` are
 * the lines around it, if any. See `ragCost` for what counts.
 */
export function lineCost(
  line: MeasuredLine,
  before: MeasuredLine | undefined,
  after: MeasuredLine | undefined,
  measure: number,
  options: RagOptions = {}
): number {
  // `??`, not a spread: a caller passing `{ holeWeight: undefined }` gets the default.
  const weight = <K extends keyof RagOptions>(key: K) =>
    options[key] ?? DEFAULT_RAG_OPTIONS[key];
  const gap = Math.max(0, measure - line.width) / measure;
  let cost = gap * gap;
  if (line.hangingShortWord) {
    cost += weight("shortWordWeight");
  }
  if (before) {
    const step = (line.width - before.width) / measure;
    cost += weight("stepWeight") * step * step;
  }
  if (before && after) {
    const depth = Math.max(0, Math.min(before.width, after.width) - line.width) / measure;
    cost += weight("holeWeight") * depth * depth;
  }
  if (line.hyphen) {
    cost += weight("hyphenWeight");
    if (Math.min(line.hyphen.before, line.hyphen.after) <= weight("shortPiece")) {
      cost += weight("shortPieceWeight");
    }
    if (before?.hyphen) {
      cost += weight("ladderWeight");
    }
  }
  return cost;
}

/**
 * How ragged a paragraph is, lower is better. What counts, as a typesetter
 * sees it:
 *
 * - Fullness: every line but the last adds the square of its gap at the
 *   right, as a share of the measure, so one large gap costs more than two
 *   small ones.
 * - Steps: a line that juts out past the one above it, or falls far short of
 *   it, squared, times `stepWeight`.
 * - Holes: a line shorter than both lines around it reads as a bite out of
 *   the edge. The depth of the bite, squared, times `holeWeight`.
 * - Short words: each one left at a line's end adds `shortWordWeight`.
 * - Hyphens: each line ending in one adds `hyphenWeight`; more if it leaves a
 *   short piece on either side (`shortPieceWeight`), and more if the line
 *   above ends in one too (`ladderWeight`).
 *
 * A line wider than the measure (a word that does not fit) costs far more
 * than any of these. The last line counts for none of them: it is meant to
 * be short.
 */
export function ragCost(
  lines: readonly MeasuredLine[],
  measure: number,
  options: RagOptions = {}
): number {
  if (measure <= 0) {
    return 0;
  }
  const last = lines.length - 1;
  let cost = 0;
  lines.forEach((line, index) => {
    if (line.width > measure + 1) {
      cost += 10;
    }
    if (index < last) {
      cost += lineCost(line, lines[index - 1], lines[index + 1], measure, options);
    }
  });
  return cost;
}
