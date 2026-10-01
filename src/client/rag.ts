import {
  breakOpportunities,
  forbidBreaks,
  type Hang,
  lineCost,
  type MeasuredLine,
  type RagOptions,
  shortWordSpaces,
} from "../rag";

const SOFT_HYPHEN = "­";
const LETTER = /\p{L}/u;

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

/**
 * Where each character starts along one unbroken line, the hyphen's width,
 * the measure, and how far punctuation may hang past it, all in px.
 */
type Metrics = { x: Float64Array; hyphen: number; measure: number; overshoot: number };

/**
 * Sets the text on one line in the hidden copy (`nowrap`) and reads where
 * every character starts, so the width of any stretch of it is a
 * subtraction. A soft hyphen draws nothing, so it takes the next
 * character's position. Also reads the width of the hyphen the browser
 * draws at a break.
 */
function measureText(
  copy: HTMLElement,
  text: string,
  measure: number,
  overshoot: number
): Metrics {
  copy.style.whiteSpace = "nowrap";
  copy.textContent = text;
  const node = copy.firstChild;
  const x = new Float64Array(text.length + 1);
  if (node instanceof Text) {
    const range = document.createRange();
    for (let index = text.length - 1; index >= 0; index -= 1) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (index === text.length - 1) {
        x[text.length] = rect ? rect.right : 0;
      }
      x[index] = rect && rect.width > 0 ? rect.left : (x[index + 1] ?? 0);
    }
  }
  copy.textContent = "-";
  const range = document.createRange();
  range.selectNodeContents(copy);
  const hyphen = range.getBoundingClientRect().width;
  copy.style.whiteSpace = "";
  return { x, hyphen, measure, overshoot };
}

/**
 * How far a line may go past the edge, in px, for text of `fontSize` px.
 * `overshoot` is the allowance in em at 16px text, about one letter at 0.5.
 * It shrinks as a share of the type as the type grows (by the square root of
 * the size), so a title cheats less than body text, and it never goes below
 * 0.15 em.
 */
export function overhangAllowance(overshoot: number, fontSize: number): number {
  if (overshoot <= 0 || fontSize <= 0) {
    return 0;
  }
  const em = Math.max(0.15, Math.min(overshoot, overshoot * Math.sqrt(16 / fontSize)));
  return em * fontSize;
}

/**
 * Puts `text` in `element` with each overhang drawn the way the page draws
 * it: the line's last character in a span with a negative `letter-spacing`
 * of the overhang. That shrinks the character's advance, which the line
 * breaker counts, while the glyph still draws in full past the edge. (A
 * negative end margin would draw the same, but Chrome does not count it
 * when it decides whether the line fits.) Returns each text node with the
 * index its text starts at.
 */
function fill(
  element: HTMLElement,
  text: string,
  hangs: readonly Hang[]
): { node: Text; start: number }[] {
  element.textContent = "";
  const nodes: { node: Text; start: number }[] = [];
  const add = (part: string, start: number, overhang?: number) => {
    const node = document.createTextNode(part);
    if (overhang === undefined) {
      element.append(node);
    } else {
      const span = document.createElement("span");
      span.style.letterSpacing = `${-overhang}px`;
      span.append(node);
      element.append(span);
    }
    nodes.push({ node, start });
  };
  let from = 0;
  for (const hang of hangs) {
    add(text.slice(from, hang.index), from);
    add(text.slice(hang.index, hang.index + 1), hang.index, hang.width);
    from = hang.index + 1;
  }
  add(text.slice(from), from);
  return nodes;
}

/**
 * True when the copy, filled with `text` and its hangs, breaks every line
 * exactly where the plan says: at each planned end, the characters on its
 * two sides sit on different lines, and there are no more lines than planned.
 */
function setsAsPlanned(
  copy: HTMLElement,
  text: string,
  hangs: readonly Hang[],
  ends: readonly number[],
  lines: number
): boolean {
  const nodes = fill(copy, text, hangs);
  const topAt = (index: number): number | null => {
    let found: { node: Text; start: number } | undefined;
    for (const entry of nodes) {
      if (entry.start <= index) {
        found = entry;
      }
    }
    if (!found || index - found.start >= found.node.length) {
      return null;
    }
    const range = document.createRange();
    range.setStart(found.node, index - found.start);
    range.setEnd(found.node, index - found.start + 1);
    let top: number | null = null;
    for (const rect of range.getClientRects()) {
      if (rect.width > 0) {
        top = Math.round(rect.top);
      }
    }
    return top;
  };
  for (const end of ends) {
    const before = topAt(end - 1);
    const after = topAt(end + 1);
    if (before === null || after === null || after <= before) {
      return false;
    }
  }
  const range = document.createRange();
  range.selectNodeContents(copy);
  const tops = new Set<number>();
  for (const rect of range.getClientRects()) {
    if (rect.width >= 1) {
      tops.add(Math.round(rect.top));
    }
  }
  return tops.size === lines;
}

/** Within this many px of the measure, a fit is too close to trust. */
const SLACK = 0.75;

type State = {
  /** Indices into the break list: where the line before the last starts, and the last line. */
  before: number;
  start: number;
  end: number;
  cost: number;
  lines: number;
  from: State | null;
};

type Plan = { forbidden: number[]; hangs: Hang[]; ends: number[]; lines: number };

/**
 * The best set of line breaks for the whole paragraph, the way TeX sets a
 * paragraph (Knuth and Plass) but for a ragged edge: it weighs every way to
 * break the text, not one line at a time, and keeps the one with the lowest
 * `lineCost` summed over its lines (gaps, steps, holes, short words,
 * hyphens).
 *
 * The browser then has to set it. The element wraps greedily (`text-wrap:
 * wrap`), so each line breaks at the last place that fits; to make that the
 * chosen break, every later place on the same line that would still fit is
 * forbidden. Only layouts the browser can reproduce that way count: a line
 * and the one after it must not fit together on one line.
 *
 * Returns the opportunities to forbid and the number of lines planned, or
 * `null` when no layout fits (a word wider than the measure).
 */
function bestBreaks(text: string, metrics: Metrics, options: RagOptions): Plan | null {
  const { x, hyphen, measure, overshoot } = metrics;
  const shortWords = new Set(shortWordSpaces(text));
  // The breaks: the paragraph's start, every opportunity, its end.
  const breaks = [-1, ...breakOpportunities(text), text.length];
  const last = breaks.length - 1;
  const isHyphen = (k: number) => k < last && text[breaks[k] ?? -1] === SOFT_HYPHEN;

  const width = (from: number, to: number) => {
    const start = (breaks[from] ?? -1) + 1;
    const end = breaks[to] ?? text.length;
    return (x[end] ?? 0) - (x[start] ?? 0) + (isHyphen(to) ? hyphen : 0);
  };
  // How far a line ending at `to` may go past the edge: the allowance, and
  // never more than its last character, so only part of one character
  // sticks out. Not at a soft hyphen: the browser draws the hyphen after
  // the last letter, and pulling the letter back would make them overlap.
  const allowance = (to: number) => {
    if (overshoot <= 0 || isHyphen(to)) {
      return 0;
    }
    const end = breaks[to] ?? 0;
    return Math.min(overshoot, (x[end] ?? 0) - (x[end - 1] ?? 0));
  };
  // How far the line actually goes past the edge, if it does and may: the
  // cheat is a last resort, for a line that would not fit otherwise.
  const over = (from: number, to: number) => {
    const past = width(from, to) - (measure - SLACK);
    return past > 0 && past <= allowance(to) ? past : 0;
  };
  // How wide the line sets: a line that overhangs sets at the measure.
  const set = (from: number, to: number) => width(from, to) - over(from, to);
  const line = (from: number, to: number): MeasuredLine => {
    const at = breaks[to] ?? 0;
    return {
      width: set(from, to),
      hangingShortWord: shortWords.has(at),
      hyphen: isHyphen(to) ? pieces(text, at) : undefined,
    };
  };
  const fits = (from: number, to: number) => set(from, to) <= measure - SLACK;
  // Past this, no line ending here can fit, even overhanging.
  const beyond = (from: number, to: number) =>
    width(from, to) - overshoot > measure - SLACK;

  // The cheapest state per (start of the line before, start of the last line),
  // grouped by where the last line ends.
  const ending: Map<string, State>[] = breaks.map(() => new Map());
  for (let end = 1; end <= last && !beyond(0, end); end += 1) {
    if (!fits(0, end)) {
      continue;
    }
    ending[end]?.set("-1|0", {
      before: -1,
      start: 0,
      end,
      cost: 0,
      lines: 1,
      from: null,
    });
  }

  for (let end = 1; end < last; end += 1) {
    for (const state of ending[end]?.values() ?? []) {
      const previous = state.before >= 0 ? line(state.before, state.start) : undefined;
      const current = line(state.start, end);
      for (let next = end + 1; next <= last && !beyond(end, next); next += 1) {
        if (!fits(end, next)) {
          continue;
        }
        // The browser breaks here only if this line and the next do not fit
        // together. Both lines' overhangs keep their negative margin in a
        // merged line, so they shorten it there too.
        const merged =
          width(state.start, next) - over(state.start, end) - over(end, next);
        if (merged <= measure + SLACK) {
          continue;
        }
        const cost =
          state.cost + lineCost(current, previous, line(end, next), measure, options);
        const key = `${state.start}|${end}`;
        const known = ending[next]?.get(key);
        if (!known || cost < known.cost) {
          ending[next]?.set(key, {
            before: state.start,
            start: end,
            end: next,
            cost,
            lines: state.lines + 1,
            from: state,
          });
        }
      }
    }
  }

  let best: State | null = null;
  for (const state of ending[last]?.values() ?? []) {
    if (!best || state.cost < best.cost) {
      best = state;
    }
  }
  if (!best) {
    return null;
  }

  // For every line but the last: the places after its end that would still
  // fit on it. And every line that overhangs, the last one too.
  const forbidden: number[] = [];
  const hung: Hang[] = [];
  const ends: number[] = [];
  for (let state: State | null = best; state; state = state.from) {
    const past = over(state.start, state.end);
    if (past > 0) {
      const end = breaks[state.end] ?? 0;
      hung.push({ index: end - 1, width: past });
    }
    if (state === best) {
      continue;
    }
    ends.push(breaks[state.end] ?? 0);
    for (let later = state.end + 1; later < last; later += 1) {
      if (width(state.start, later) - past > measure + SLACK) {
        break;
      }
      forbidden.push(breaks[later] ?? 0);
    }
  }
  return {
    forbidden: forbidden.sort((a, b) => a - b),
    hangs: hung.sort((a, b) => a.index - b.index),
    ends: ends.sort((a, b) => a - b),
    lines: best.lines,
  };
}

/** What `settleRag` decides: the breaks to forbid, and the line ends that overhang. */
export type RagPlan = { forbidden: number[]; hangs: Hang[] };

const NO_CHANGE: RagPlan = { forbidden: [], hangs: [] };

/**
 * Settles the rag of `element` the way a typesetter would: it finds the best
 * line breaks for the whole paragraph (`bestBreaks`) and returns the break
 * opportunities to forbid so the browser sets exactly those, and the line
 * ends that may go a little past the edge where that helps (`overshoot`).
 * Apply them with `applyRag`, in an element that wraps greedily (`text-wrap:
 * wrap`), drawing each overhang as a span around the line's last character
 * with a negative `letter-spacing` of the overhang.
 *
 * It measures a hidden copy of the element with the same classes and width,
 * so the page never shows a trial, and checks the plan there: if the browser
 * would not break every line where planned, it returns no change.
 */
export function settleRag(
  element: HTMLElement,
  text: string,
  options: RagOptions = {}
): RagPlan {
  const parent = element.parentElement;
  if (!parent || breakOpportunities(text).length === 0) {
    return NO_CHANGE;
  }
  const copy = element.cloneNode(false) as HTMLElement;
  copy.removeAttribute("id");
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    left: "0",
    top: "0",
    width: `${element.getBoundingClientRect().width}px`,
    maxWidth: "none",
    minWidth: "0",
    height: "auto",
    textWrap: "wrap",
  });
  parent.append(copy);

  try {
    const style = getComputedStyle(copy);
    const measure =
      copy.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const fontSize = Number.parseFloat(style.fontSize);
    const overshoot = overhangAllowance(options.overshoot ?? 0, fontSize);
    const plan = bestBreaks(text, measureText(copy, text, measure, overshoot), options);
    if (!plan) {
      return NO_CHANGE;
    }
    const planned = setsAsPlanned(
      copy,
      forbidBreaks(text, plan.forbidden, { keepLength: true }),
      plan.hangs,
      plan.ends,
      plan.lines
    );
    return planned ? { forbidden: plan.forbidden, hangs: plan.hangs } : NO_CHANGE;
  } finally {
    copy.remove();
  }
}
