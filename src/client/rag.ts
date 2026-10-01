import {
  applyRag,
  type BreakPlan,
  bestBreaks,
  breakOpportunities,
  forbidBreaks,
  type Hang,
  type Metrics,
  type RagOptions,
  splitSettled,
  type Tightened,
} from "../rag";

type Measured = { key: string; x: Float64Array; hyphen: number };

/**
 * The last measurement of each element's text. Where the characters start
 * does not depend on the width, so dragging the width only runs the search
 * again. The key holds the text and everything about the font that moves the
 * characters; `forgetMeasurements` drops it when a font finishes loading,
 * which changes the widths without changing the style.
 */
const measurements = new WeakMap<HTMLElement, Measured>();

function fontKey(style: CSSStyleDeclaration): string {
  return [
    style.font,
    style.letterSpacing,
    style.wordSpacing,
    style.fontKerning,
    style.fontFeatureSettings,
    style.fontVariationSettings,
    style.textTransform,
  ].join("|");
}

/** Drops the cached measurement of `element`, so the next `settleRag` measures again. */
export function forgetMeasurements(element: HTMLElement): void {
  measurements.delete(element);
}

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
  overhang: number
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
  return { x, hyphen, measure, overhang };
}

/**
 * How far a line may go past the edge, in px, for text of `fontSize` px.
 * `overhang` is the allowance in em at 16px text, about one letter at 0.5.
 * It shrinks as a share of the type as the type grows (by the square root of
 * the size), so a title cheats less than body text, down to 0.15 em, and
 * never more than `overhang` itself.
 */
export function overhangAllowance(overhang: number, fontSize: number): number {
  if (overhang <= 0 || fontSize <= 0) {
    return 0;
  }
  const em = Math.min(overhang, Math.max(0.15, overhang * Math.sqrt(16 / fontSize)));
  return em * fontSize;
}

/**
 * Puts `text` in `element` with each overhang and tightened line drawn the
 * way the page draws them. An overhang is the line's last character in a span
 * with a negative `letter-spacing` of the overhang. That shrinks the
 * character's advance, which the line breaker counts, while the glyph still
 * draws in full past the edge. (A negative end margin would draw the same, but
 * Chrome does not count it when it decides whether the line fits.) A
 * tightened line is its text in a span with a negative `word-spacing`, and a
 * negative `letter-spacing` when the line needed it. Returns each text node
 * with the index its text starts at.
 */
function fill(
  element: HTMLElement,
  text: string,
  hangs: readonly Hang[],
  tightened: readonly Tightened[]
): { node: Text; start: number }[] {
  element.textContent = "";
  return splitSettled(text, hangs, tightened).map(piece => {
    const node = document.createTextNode(piece.text);
    if (piece.hang !== undefined) {
      const span = document.createElement("span");
      span.style.letterSpacing = `${piece.letterSpacing ?? -piece.hang}px`;
      span.append(node);
      element.append(span);
    } else if (piece.wordSpacing !== undefined) {
      const span = document.createElement("span");
      span.style.wordSpacing = `${piece.wordSpacing}px`;
      if (piece.letterSpacing) {
        span.style.letterSpacing = `${piece.letterSpacing}px`;
      }
      span.append(node);
      element.append(span);
    } else {
      element.append(node);
    }
    return { node, start: piece.start };
  });
}

/**
 * True when the copy, filled with `text` and its hangs and tightened lines,
 * breaks every line exactly where the plan says: at each planned break, the
 * characters on its two sides sit on different lines, and there are no more
 * lines than planned.
 */
function setsAsPlanned(
  copy: HTMLElement,
  text: string,
  {
    hangs,
    tightened,
    ends,
    lines,
  }: Pick<BreakPlan, "hangs" | "tightened" | "ends" | "lines">
): boolean {
  const nodes = fill(copy, text, hangs, tightened);
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
    const before = topAt(end.before);
    const after = topAt(end.after);
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

/** A computed `word-spacing` or `letter-spacing` in px: `normal` is 0. */
function spacingOf(value: string): number {
  const px = Number.parseFloat(value);
  return Number.isFinite(px) ? px : 0;
}

/**
 * What `settleRag` decides: the breaks to forbid, the line ends that overhang,
 * and the lines that set tighter. A tightened line's spacing is the CSS value
 * to set, the element's own spacing included.
 */
export type RagPlan = { forbidden: number[]; hangs: Hang[]; tightened: Tightened[] };

/** A plan that changes nothing. */
export const NO_CHANGE: RagPlan = Object.freeze({
  forbidden: [],
  hangs: [],
  tightened: [],
}) as RagPlan;

/**
 * Layouts the plan cannot model: justified text, right to left, an indented
 * first line, preserved newlines, or the browser's own hyphenation.
 */
function unsupported(style: CSSStyleDeclaration): boolean {
  return (
    style.textAlign === "justify" ||
    style.direction === "rtl" ||
    Number.parseFloat(style.textIndent) !== 0 ||
    style.whiteSpace.startsWith("pre") ||
    style.hyphens === "auto"
  );
}

/**
 * Settles the rag of `element` the way a typesetter would: it finds the best
 * line breaks for the whole paragraph (`bestBreaks`) and returns the break
 * opportunities to forbid so the browser sets exactly those, and the line
 * ends that may go a little past the edge where that helps (`overhang`), and
 * the lines that may take a little less space between words (`tighten`).
 * Apply them with `applyRag`, in an element that wraps greedily (`text-wrap:
 * wrap`; `useRagPlan` sets that), drawing each overhang as a span around the
 * line's last character with a negative `letter-spacing` of the overhang, and
 * each tightened line as a span with its negative `word-spacing` (and
 * `letter-spacing`).
 *
 * It measures a hidden copy of the element with the same classes and width,
 * so the page never shows a trial, and checks the plan there: if the browser
 * would not break every line where planned, it returns no change. It also
 * returns no change for text it cannot model: justified, right to left, an
 * indented first line, preserved newlines, or `hyphens: auto`. The text is
 * measured as plain text in the element's own font.
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
  const own = getComputedStyle(element);
  if (unsupported(own)) {
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
    // The used width, in the element's own box sizing, before any transform.
    width: own.width === "auto" ? `${element.offsetWidth}px` : own.width,
    boxSizing: own.boxSizing,
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
    const overhang = overhangAllowance(options.overhang ?? 0, fontSize);
    // Em of the element's own size, whatever the size: no shrinking with it.
    const tightenWord = Math.max(0, options.tighten ?? 0) * fontSize;
    const tightenLetter = Math.max(0, options.tightenLetters ?? 0) * fontSize;
    const key = `${fontKey(style)}|${text}`;
    let known = measurements.get(element);
    if (known?.key !== key) {
      const measured = measureText(copy, text, measure, overhang);
      known = { key, x: measured.x, hyphen: measured.hyphen };
      measurements.set(element, known);
    }
    const metrics: Metrics = {
      x: known.x,
      hyphen: known.hyphen,
      measure,
      overhang,
      tightenWord,
      tightenLetter,
    };
    const found = bestBreaks(text, metrics, options);
    if (!found) {
      return NO_CHANGE;
    }
    // The search gives how much each tightened line shrinks and how far each
    // line end hangs. A span's spacing replaces the spacing it inherits,
    // which the measurement included, so the element's own spacing is added
    // back: a heading set with tracking tightens and hangs from that
    // tracking, not from zero.
    const baseWord = spacingOf(style.wordSpacing);
    const baseLetter = spacingOf(style.letterSpacing);
    const plan = {
      ...found,
      hangs: found.hangs.map(hang => ({
        ...hang,
        letterSpacing: baseLetter - hang.width,
      })),
      tightened: found.tightened.map(line => ({
        ...line,
        wordSpacing: baseWord + line.wordSpacing,
        letterSpacing: line.letterSpacing === 0 ? 0 : baseLetter + line.letterSpacing,
      })),
    };
    const planned = setsAsPlanned(
      copy,
      forbidBreaks(text, plan.forbidden, { keepLength: true }),
      plan
    );
    return planned
      ? { forbidden: plan.forbidden, hangs: plan.hangs, tightened: plan.tightened }
      : NO_CHANGE;
  } finally {
    copy.remove();
  }
}

/** What makes a judgement: the first one, a new width, or a font that finished loading. */
export type RagCause = "first" | "resize" | "font";

/**
 * Watches `element` and judges its rag (`settleRag`) for `text`: once now,
 * again whenever its width changes, and whenever fonts finish loading, since
 * all of them move the line breaks. `onPlan` gets every plan with what caused
 * it; the first call happens before `watchRag` returns. While watched, the
 * element wraps greedily (`text-wrap: wrap`), which the plan relies on.
 * Returns a function that stops watching and puts `text-wrap` back.
 */
export function watchRag(
  element: HTMLElement,
  text: string,
  options: RagOptions,
  onPlan: (plan: RagPlan, cause: RagCause) => void
): () => void {
  const wrapBefore = element.style.getPropertyValue("text-wrap");
  element.style.setProperty("text-wrap", "wrap");
  let lastWidth = -1;
  const judge = (cause: RagCause) => {
    // The layout width, which a transform such as a scale-in does not change.
    // Forbidding a break changes the height, not the width, so the same width
    // is not judged twice.
    const width = element.offsetWidth;
    if (width === lastWidth) {
      return;
    }
    lastWidth = width;
    onPlan(settleRag(element, text, options), cause);
  };

  judge("first");
  const observer = new ResizeObserver(() => judge("resize"));
  observer.observe(element);
  // Fonts that are still loading move the breaks once they arrive, and so
  // does a face first used later (an italic, a heavier weight).
  const fonts = document.fonts;
  const onFonts = () => {
    forgetMeasurements(element);
    lastWidth = -1;
    judge("font");
  };
  fonts?.addEventListener("loadingdone", onFonts);
  let alive = true;
  if (fonts && fonts.status !== "loaded") {
    fonts.ready.then(() => alive && onFonts());
  }
  return () => {
    alive = false;
    observer.disconnect();
    fonts?.removeEventListener("loadingdone", onFonts);
    element.style.setProperty("text-wrap", wrapBefore);
  };
}

/**
 * Settles the rag of a plain DOM element, for pages without React: puts
 * `text` in `element` with the breaks a typesetter would choose and its
 * overhangs and tightened lines drawn, and keeps it settled as the width and fonts change.
 * `text` is the element's text, hyphenated with soft hyphens. Returns a
 * function that stops and puts `text` back as it was.
 *
 * ```js
 * const stop = settle(document.querySelector("p"), hyphenate(text), { overhang: 0.5 });
 * ```
 */
export function settle(
  element: HTMLElement,
  text: string,
  options: RagOptions = {}
): () => void {
  const stop = watchRag(element, text, options, plan => {
    const settled = applyRag(text, plan.forbidden, plan.hangs, plan.tightened);
    fill(element, settled.text, settled.hangs, settled.tightened);
  });
  return () => {
    stop();
    element.textContent = text;
  };
}
