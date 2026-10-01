import {
  type BreakPlan,
  bestBreaks,
  breakOpportunities,
  forbidBreaks,
  type Hang,
  hangCharacter,
  type Metrics,
  type RagOptions,
} from "../rag";

/**
 * Sets the text on one line in the hidden copy (`nowrap`) and reads where
 * every character starts, so the width of any stretch of it is a
 * subtraction. A soft hyphen draws nothing, so it takes the next
 * character's position. Also reads the width of the hyphen the browser
 * draws at a break.
 */
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
 * the size), so a title cheats less than body text, down to 0.15 em, and
 * never more than `overshoot` itself.
 */
export function overhangAllowance(overshoot: number, fontSize: number): number {
  if (overshoot <= 0 || fontSize <= 0) {
    return 0;
  }
  const em = Math.min(overshoot, Math.max(0.15, overshoot * Math.sqrt(16 / fontSize)));
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
    const character = hangCharacter(text, hang.index);
    add(text.slice(from, hang.index), from);
    add(character, hang.index, hang.width);
    from = hang.index + character.length;
  }
  add(text.slice(from), from);
  return nodes;
}

/**
 * True when the copy, filled with `text` and its hangs, breaks every line
 * exactly where the plan says: at each planned break, the characters on its
 * two sides sit on different lines, and there are no more lines than planned.
 */
function setsAsPlanned(
  copy: HTMLElement,
  text: string,
  { hangs, ends, lines }: Pick<BreakPlan, "hangs" | "ends" | "lines">
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

/** What `settleRag` decides: the breaks to forbid, and the line ends that overhang. */
export type RagPlan = { forbidden: number[]; hangs: Hang[] };

const NO_CHANGE: RagPlan = { forbidden: [], hangs: [] };

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
 * ends that may go a little past the edge where that helps (`overshoot`).
 * Apply them with `applyRag`, in an element that wraps greedily (`text-wrap:
 * wrap`; `useRagPlan` sets that), drawing each overhang as a span around the
 * line's last character with a negative `letter-spacing` of the overhang.
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
    const overshoot = overhangAllowance(options.overshoot ?? 0, fontSize);
    const key = `${fontKey(style)}|${text}`;
    let known = measurements.get(element);
    if (known?.key !== key) {
      const measured = measureText(copy, text, measure, overshoot);
      known = { key, x: measured.x, hyphen: measured.hyphen };
      measurements.set(element, known);
    }
    const metrics: Metrics = { x: known.x, hyphen: known.hyphen, measure, overshoot };
    const plan = bestBreaks(text, metrics, options);
    if (!plan) {
      return NO_CHANGE;
    }
    const planned = setsAsPlanned(
      copy,
      forbidBreaks(text, plan.forbidden, { keepLength: true }),
      plan
    );
    return planned ? { forbidden: plan.forbidden, hangs: plan.hangs } : NO_CHANGE;
  } finally {
    copy.remove();
  }
}
