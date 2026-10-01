/**
 * Settling the rag: the right edge of a paragraph, judged the way a
 * typesetter judges it.
 *
 * A typesetter looks at each line end. A short word such as "og" or "í" left
 * at the end reads badly; a word that sticks out past the lines around it
 * leaves a hole in the edge; a last line of one word, or of the tail of a
 * hyphenated one, looks lost. `bestBreaks` weighs every way to break the
 * paragraph and keeps the cheapest edge, so a word moves down only when the
 * whole paragraph is better for it.
 *
 * This file holds the parts that need no browser: which words are short, how
 * lines are scored, the search itself (given where each character starts)
 * and how the result is written into the text. The client entry
 * (`client/rag.ts`) measures the real text and checks the plan in the browser.
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

/** One piece of settled text: plain, or an overhanging line end (`hang` in px). */
export type HangPiece = { start: number; text: string; hang?: number };

/**
 * Settled text cut where it is drawn differently: plain runs, and each
 * overhanging character on its own (an emoji whole), to be wrapped in an
 * element with `letter-spacing: -{hang}px`. Empty runs are left out.
 */
export function splitHangs(text: string, hangs: readonly Hang[]): HangPiece[] {
  const pieces: HangPiece[] = [];
  let from = 0;
  for (const hang of hangs) {
    const character = hangCharacter(text, hang.index);
    if (hang.index > from) {
      pieces.push({ start: from, text: text.slice(from, hang.index) });
    }
    pieces.push({ start: hang.index, text: character, hang: hang.width });
    from = hang.index + character.length;
  }
  if (from < text.length || pieces.length === 0) {
    pieces.push({ start: from, text: text.slice(from) });
  }
  return pieces;
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
   * Set a title, not a paragraph: keep as few lines as greedy wrapping would
   * and make them as even as possible, the way `text-wrap: balance` does,
   * instead of filling each line. Steps between lines count, the last line's
   * too; short pieces, hyphens and a last line of one word still cost what
   * they do in body text. Default false.
   */
  balance?: boolean;
  /**
   * What a last line of a single word costs, like "Rangárvöllum." alone. Its
   * gap is free (a last line is meant to be short), but one word on its own
   * looks lost. The default makes it about as bad as a line left half empty.
   * 0 ignores it.
   */
  runtWeight?: number;
  /**
   * What it costs when the line before the last ends in a hyphen, so the last
   * line is the tail of a broken word ("völlum."). 0 ignores it.
   */
  lastHyphenWeight?: number;
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
   * one above it, or falls short of it. The step (as a share of the measure)
   * is squared and multiplied by this, so small steps cost little.
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
  overhang?: number;
};

export const DEFAULT_RAG_OPTIONS: Readonly<Required<RagOptions>> = Object.freeze({
  balance: false,
  runtWeight: 0.25,
  lastHyphenWeight: 0.25,
  shortWordWeight: 0.04,
  holeWeight: 6,
  stepWeight: 2,
  hyphenWeight: 0.01,
  shortPieceWeight: 0.25,
  shortPiece: 3,
  ladderWeight: 0.02,
  overhang: 0,
});

/** The options that are numbers: the weights and sizes. */
type Weight = Exclude<keyof RagOptions, "balance">;

/** One option, or its default. `??`, not a spread: `{ holeWeight: undefined }` gets the default. */
function weightOf(options: RagOptions, key: Weight): number {
  return options[key] ?? DEFAULT_RAG_OPTIONS[key];
}

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
  const weight = (key: Weight) => weightOf(options, key);
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
 * - Steps: a line that juts out past the one above it, or falls short of it,
 *   squared, times `stepWeight`.
 * - Holes: a line shorter than both lines around it reads as a bite out of
 *   the edge. The depth of the bite, squared, times `holeWeight`.
 * - Short words: each one left at a line's end adds `shortWordWeight`.
 * - Hyphens: each line ending in one adds `hyphenWeight`; more if it leaves a
 *   short piece on either side (`shortPieceWeight`), and more if the line
 *   above ends in one too (`ladderWeight`).
 *
 * A line wider than the measure (a word that does not fit) costs far more
 * than any of these. The last line counts for none of them: it is meant to
 * be short. (`bestBreaks` also weighs the last line: see `runtWeight` and
 * `lastHyphenWeight`. This function is the plain score of given lines.)
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

/** What a line wider than the measure costs: far more than any other fault. */
const OVERFLOW_COST = 10;

/**
 * What every line of a title costs (`balance`): more than evening out the
 * edge can save, so a title keeps the fewest lines it can have.
 */
const TITLE_LINE_COST = 1;

/** Within this many px of the measure, a fit is too close to trust. */
const SLACK = 0.75;

/**
 * Where each character of the text starts along one unbroken line (`x`, one
 * more entry than the text has characters), the width of the hyphen drawn at
 * a soft-hyphen break, the measure, and how far a line may overhang, all in px.
 */
export type Metrics = {
  x: Float64Array;
  hyphen: number;
  measure: number;
  overhang: number;
};

/**
 * The best breaks for a paragraph: the opportunities to forbid so a greedy
 * browser sets them, the line ends that overhang, every break between two
 * lines (the index of the last character before it and the first after it),
 * how many lines there are, and what the layout costs (lower is better).
 */
export type BreakPlan = {
  forbidden: number[];
  hangs: Hang[];
  ends: { before: number; after: number }[];
  lines: number;
  cost: number;
};

/**
 * A place a line may end. `end` is where the line's text stops, `next` where
 * the next line starts. A space or soft hyphen sits between them and can be
 * forbidden. A line also breaks after a dash, which the dash stays on and
 * which cannot be forbidden.
 */
type Opportunity = {
  at: number;
  end: number;
  next: number;
  kind: "space" | "hyphen" | "dash";
};

const DASHES = new Set(["-", "–", "—"]);
const DIGIT = /\p{Nd}/u;
const WORD_SEPARATOR = /[  ]/;
const LETTER = /\p{L}/u;

/**
 * Every place the browser may break the text, in order: plain spaces, soft
 * hyphens, and after a dash between two non-spaces (`Norður-Ameríku`,
 * `1990–2000`). A hyphen-minus before a digit is not one (`COVID-19`).
 */
function opportunities(text: string): Opportunity[] {
  const found: Opportunity[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (character === " ") {
      found.push({ at: index, end: index, next: index + 1, kind: "space" });
    } else if (character === SOFT_HYPHEN) {
      found.push({ at: index, end: index, next: index + 1, kind: "hyphen" });
    } else if (DASHES.has(character)) {
      const before = text[index - 1] ?? " ";
      const after = text[index + 1] ?? " ";
      const breaksAfter =
        !/\s/.test(before) &&
        !/\s/.test(after) &&
        after !== SOFT_HYPHEN &&
        !(character === "-" && DIGIT.test(after));
      if (breaksAfter) {
        found.push({ at: index, end: index + 1, next: index + 1, kind: "dash" });
      }
    }
  }
  return found;
}

/**
 * The letters of the word on each side of a soft hyphen at `index`: the
 * pieces a break there would leave. Soft hyphens inside the word are
 * skipped, other characters end it.
 */
function pieces(text: string, index: number): { before: number; after: number } {
  const count = (from: number, step: 1 | -1) => {
    let letters = 0;
    for (let at = from; at >= 0 && at < text.length; at += step) {
      const character = text[at] ?? "";
      if (LETTER.test(character)) {
        letters += 1;
      } else if (character !== SOFT_HYPHEN) {
        break;
      }
    }
    return letters;
  };
  return { before: count(index - 1, -1), after: count(index + 1, 1) };
}

/** Where the character that ends just before `end` starts: two code units for an emoji. */
export function lastCharacterStart(text: string, end: number): number {
  const low = text.charCodeAt(end - 1);
  const high = text.charCodeAt(end - 2);
  const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
  return pair ? end - 2 : end - 1;
}

/** The character a hang starts at, whole: one code unit, or two for an emoji. */
export function hangCharacter(text: string, index: number): string {
  const high = text.charCodeAt(index);
  return high >= 0xd800 && high <= 0xdbff
    ? text.slice(index, index + 2)
    : text.slice(index, index + 1);
}

/**
 * How many of the cheapest ways to reach one line end are carried on. The
 * search keeps one way per pair of line starts, and most of those are far
 * dearer than the best. At 16 the plan matched the full search on all 460
 * layouts tried (the playground's ten texts at 23 widths), in 40% of the
 * time; at 8 a few came out worse.
 */
const MAX_STATES = 16;

/** The states to carry on from one line end: all of them, or the cheapest `MAX_STATES`. */
function cheapest(states: Map<number, State>): Iterable<State> {
  if (states.size <= MAX_STATES) {
    return states.values();
  }
  return [...states.values()].sort((a, b) => a.cost - b.cost).slice(0, MAX_STATES);
}

type State = {
  /** Indices into the opportunity list: where the line before the last starts, and the last line. */
  before: number;
  start: number;
  end: number;
  cost: number;
  lines: number;
  from: State | null;
};

/**
 * The best set of line breaks for the whole paragraph, the way TeX sets a
 * paragraph (Knuth and Plass) but for a ragged edge: it weighs every way to
 * break the text, not one line at a time, and keeps the one with the lowest
 * cost: `lineCost` summed over every line but the last, plus the last line's
 * `runtWeight` and `lastHyphenWeight`.
 *
 * The browser then has to set it. The element wraps greedily (`text-wrap:
 * wrap`), so each line breaks at the last place that fits; to make that the
 * chosen break, every later place on the same line that would still fit is
 * forbidden. Only layouts the browser can reproduce that way count: a line
 * and the one after it must not fit together, and a break after a dash,
 * which cannot be forbidden, must not fit on a line that should end earlier.
 * A word wider than the measure gets a line of its own, at a high cost, as
 * the browser would set it.
 *
 * `metrics.x` is where each character starts on one unbroken line. Returns
 * `null` only for text with nowhere to break.
 */
export function bestBreaks(
  text: string,
  metrics: Metrics,
  options: RagOptions = {}
): BreakPlan | null {
  const { x, hyphen, measure, overhang } = metrics;
  const shortWords = new Set(shortWordSpaces(text));
  // The paragraph's start, every opportunity, its end.
  const breaks: Opportunity[] = [
    { at: -1, end: 0, next: 0, kind: "space" },
    ...opportunities(text),
    { at: text.length, end: text.length, next: text.length, kind: "space" },
  ];
  const last = breaks.length - 1;
  if (last < 2) {
    return null;
  }
  const at = (k: number) => breaks[k] as Opportunity;
  const isHyphen = (k: number) => k < last && at(k).kind === "hyphen";

  // Worked out once per opportunity, since the search asks again and again:
  // where a line after it starts, where a line ending at it stops (with the
  // hyphen drawn there), how far such a line may overhang, and what it ends with.
  const count = breaks.length;
  const startX = new Float64Array(count);
  const endX = new Float64Array(count);
  const allowed = new Float64Array(count);
  const endings: Pick<MeasuredLine, "hangingShortWord" | "hyphen">[] = [];
  for (let k = 0; k < count; k += 1) {
    const { at: index, end, next } = at(k);
    const hyphenHere = isHyphen(k);
    startX[k] = x[next] ?? 0;
    endX[k] = (x[end] ?? 0) + (hyphenHere ? hyphen : 0);
    // The allowance, and never more than the line's last character's
    // advance. Not at a soft hyphen: the browser draws the hyphen after the
    // last letter, and pulling the letter back would make them overlap.
    allowed[k] =
      overhang <= 0 || hyphenHere
        ? 0
        : Math.min(overhang, (x[end] ?? 0) - (x[lastCharacterStart(text, end)] ?? 0));
    endings.push({
      hangingShortWord: shortWords.has(index),
      hyphen: hyphenHere ? pieces(text, index) : undefined,
    });
  }

  const width = (from: number, to: number) => (endX[to] ?? 0) - (startX[from] ?? 0);
  const allowance = (to: number) => allowed[to] ?? 0;
  // How far the line actually goes past the edge, if it does and may: the
  // cheat is a last resort, for a line that would not fit otherwise.
  const over = (from: number, to: number) => {
    const past = width(from, to) - (measure - SLACK);
    return past > 0 && past <= allowance(to) ? past : 0;
  };
  // How wide the line sets: a line that overhangs sets at the measure.
  const set = (from: number, to: number) => width(from, to) - over(from, to);
  const fits = (from: number, to: number) => set(from, to) <= measure - SLACK;
  // Past this, no line ending here can fit, even overhanging.
  const beyond = (from: number, to: number) =>
    width(from, to) - overhang > measure - SLACK;
  const line = (from: number, to: number): MeasuredLine => {
    const ending = endings[to];
    return {
      width: Math.min(set(from, to), measure),
      hangingShortWord: ending?.hangingShortWord,
      hyphen: ending?.hyphen,
    };
  };
  // A title pays for each line instead of for the gaps at its end.
  const balance = options.balance === true;
  const lineTerm = (
    current: MeasuredLine,
    previous: MeasuredLine | undefined,
    after: MeasuredLine
  ) => {
    const cost = lineCost(current, previous, after, measure, weights);
    if (!balance) {
      return cost;
    }
    const gap = Math.max(0, measure - current.width) / measure;
    return cost - gap * gap + TITLE_LINE_COST;
  };
  // Every weight resolved once, so `lineCost` finds each without a fallback.
  const weights: Required<RagOptions> = { ...DEFAULT_RAG_OPTIONS };
  for (const name of Object.keys(weights) as (keyof RagOptions)[]) {
    if (name !== "balance") {
      weights[name] = weightOf(options, name);
    }
  }
  // A line from `from` that ends at `to` can be reproduced: no dash break
  // after `to` still fits on it, since that break could not be forbidden.
  const reproducible = (from: number, to: number) => {
    const past = over(from, to);
    for (let later = to + 1; later < last; later += 1) {
      if (width(from, later) - past > measure + SLACK) {
        return true;
      }
      if (at(later).kind === "dash") {
        return false;
      }
    }
    return true;
  };
  // The lines that may follow a line ending at `from`: every end that fits,
  // or, when not even the next piece fits, that piece alone (it overflows).
  const nextEnds = (from: number): number[] => {
    if (!fits(from, from + 1)) {
      return [from + 1];
    }
    const ends: number[] = [];
    for (let to = from + 1; to <= last && !beyond(from, to); to += 1) {
      if (fits(from, to) && (to === last || reproducible(from, to))) {
        ends.push(to);
      }
    }
    return ends;
  };
  const overflowCost = (from: number, to: number) =>
    width(from, to) - over(from, to) > measure + SLACK ? OVERFLOW_COST : 0;

  // The cheapest state per (start of the line before, start of the last line),
  // grouped by where the last line ends.
  const ending: Map<number, State>[] = breaks.map(() => new Map());
  const key = (before: number, start: number) => before * breaks.length + start;
  for (const end of nextEnds(0)) {
    ending[end]?.set(key(-1, 0), {
      before: -1,
      start: 0,
      end,
      cost: overflowCost(0, end),
      lines: 1,
      from: null,
    });
  }

  for (let end = 1; end < last; end += 1) {
    const states = ending[end];
    if (!states || states.size === 0) {
      continue;
    }
    // Every line that may follow, worked out once for all the states here.
    const following = nextEnds(end).map(next => ({
      next,
      line: line(end, next),
      over: over(end, next),
      overflow: overflowCost(end, next),
    }));
    for (const state of cheapest(states)) {
      const previous = state.before >= 0 ? line(state.before, state.start) : undefined;
      const current = line(state.start, end);
      const overCurrent = over(state.start, end);
      const k = key(state.start, end);
      for (const after of following) {
        // The browser breaks here only if this line and the next do not fit
        // together. Both lines' overhangs keep their negative spacing in a
        // merged line, so they shorten it there too.
        const merged = width(state.start, after.next) - overCurrent - after.over;
        if (merged <= measure + SLACK) {
          continue;
        }
        const cost =
          state.cost + lineTerm(current, previous, after.line) + after.overflow;
        const known = ending[after.next]?.get(k);
        if (!known || cost < known.cost) {
          ending[after.next]?.set(k, {
            before: state.start,
            start: end,
            end: after.next,
            cost,
            lines: state.lines + 1,
            from: state,
          });
        }
      }
    }
  }

  // The last line: one word alone, or the tail of a hyphenated word. In a
  // title it is a line like the others, and its step from the line above counts.
  const lastLineCost = (state: State) => {
    if (state.lines < 2) {
      return 0;
    }
    let cost = 0;
    if (balance) {
      const step =
        (line(state.start, last).width - line(state.before, state.start).width) / measure;
      cost += TITLE_LINE_COST + weights.stepWeight * step * step;
    }
    const tail = text.slice(at(state.start).next).trim();
    if (!WORD_SEPARATOR.test(tail)) {
      cost += weights.runtWeight;
    }
    if (at(state.start).kind === "hyphen") {
      cost += weights.lastHyphenWeight;
    }
    return cost;
  };
  let best: State | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const state of ending[last]?.values() ?? []) {
    const total = state.cost + lastLineCost(state);
    if (total < bestCost) {
      best = state;
      bestCost = total;
    }
  }
  if (!best) {
    return null;
  }

  // For every line but the last: the places after its end that would still
  // fit on it. And every line that overhangs, the last one too.
  const forbidden: number[] = [];
  const hung: Hang[] = [];
  const ends: { before: number; after: number }[] = [];
  for (let state: State | null = best; state; state = state.from) {
    const past = over(state.start, state.end);
    if (past > 0) {
      hung.push({ index: lastCharacterStart(text, at(state.end).end), width: past });
    }
    if (state === best) {
      continue;
    }
    ends.push({ before: at(state.end).end - 1, after: at(state.end).next });
    for (let later = state.end + 1; later < last; later += 1) {
      if (width(state.start, later) - past > measure + SLACK) {
        break;
      }
      forbidden.push(at(later).at);
    }
  }
  return {
    forbidden: forbidden.sort((a, b) => a - b),
    hangs: hung.sort((a, b) => a.index - b.index),
    ends: ends.sort((a, b) => a.after - b.after),
    lines: best.lines,
    cost: bestCost,
  };
}
