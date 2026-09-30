import type { ReactElement, ReactNode } from "react";
import { cloneElement, createElement, Fragment, isValidElement } from "react";

/**
 * Host elements whose text is not prose: code, machine output, markup that
 * is not text flow. Their subtree passes through byte for byte.
 */
const SKIPPED_TAGS: ReadonlySet<string> = new Set([
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "script",
  "style",
  "textarea",
  "svg",
  "math",
]);

/**
 * Host elements that flow inside a line of text. Their text stays in the same
 * run as the text around them, so a quote can open outside `<strong>` and
 * close inside it. Every other host element, including any tag not listed
 * here, starts and ends a run. Unknown tags are blocks on purpose: joining
 * two blocks gives wrong results (a quote pairs across paragraphs, and
 * `afþreying.` + `Sveitarstjórnarkosningar` looks like a domain), while
 * splitting an inline element only loses a cross-element rule.
 */
export const INLINE_TAGS: ReadonlySet<string> = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "big",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "mark",
  "output",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

type ElementProps = {
  children?: ReactNode;
  translate?: unknown;
  lang?: unknown;
  "data-skiptingar"?: unknown;
};

/** True for `is`, `is-IS` and any `is-*` tag, in any case. */
export function isIcelandic(lang: string): boolean {
  return /^is(?:-|$)/i.test(lang.trim());
}

/**
 * Whether text under `element` is in a foreign language. An element with a
 * `lang` prop sets it: Icelandic turns processing on, anything else turns it
 * off. An empty `lang=""` means unknown language in HTML, so it turns
 * processing off too. An element without `lang` keeps what its parent had, so
 * a `lang="is"` inside a `lang="en"` subtree is processed again.
 */
function isForeignIn(element: ReactElement<ElementProps>, inherited: boolean): boolean {
  const { lang } = element.props;
  return typeof lang === "string" ? !isIcelandic(lang) : inherited;
}

/**
 * The children to walk into, or `undefined` when the node is a leaf, has no
 * children, or is an opted-out subtree.
 *
 * Function and class components, client components, lazy, memo, context and
 * Suspense elements are never rendered or called. Only their `children` prop
 * is visited, because that is the only text this walk can see.
 */
function descendInto(element: ReactElement<ElementProps>): ReactNode | undefined {
  return isSkipped(element) ? undefined : (element.props.children ?? undefined);
}

/** An opted-out subtree: a skipped tag, `translate="no"` or `data-skiptingar="off"`. */
function isSkipped(element: ReactElement<ElementProps>): boolean {
  const { props, type } = element;
  return (
    (typeof type === "string" && SKIPPED_TAGS.has(type)) ||
    props.translate === "no" ||
    props["data-skiptingar"] === "off"
  );
}

function isChildArray(node: ReactNode): node is readonly ReactNode[] {
  return Array.isArray(node);
}

/** Text segments grouped into runs. A run is text with no block boundary in it. */
type Runs = { done: string[][]; current: string[] };

function endRun(runs: Runs): void {
  if (runs.current.length > 0) {
    runs.done.push(runs.current);
    runs.current = [];
  }
}

/**
 * Appends every text segment under `node` to `runs`, in document order. A
 * block host element ends the run before and after it, and so does a skipped
 * subtree. Components are transparent: their children join the current run.
 *
 * Text in a foreign language is not collected. Where the language changes,
 * the run ends, so Icelandic rules never work across English text.
 */
function collectText(node: ReactNode, runs: Runs, foreign: boolean): void {
  if (typeof node === "string") {
    if (!foreign) {
      runs.current.push(node);
    }
  } else if (typeof node === "number") {
    if (!foreign) {
      runs.current.push(String(node));
    }
  } else if (isChildArray(node)) {
    for (const child of node) {
      collectText(child, runs, foreign);
    }
  } else if (isValidElement<ElementProps>(node)) {
    const foreignHere = isForeignIn(node, foreign);
    // A skipped subtree ends the run even when it is an inline tag, so text on
    // both sides is not read as one piece: `555<code>x</code> 1234`.
    const isBoundary =
      foreignHere !== foreign ||
      isSkipped(node) ||
      (typeof node.type === "string" && !INLINE_TAGS.has(node.type));
    if (isBoundary) {
      endRun(runs);
    }
    const children = descendInto(node);
    if (children !== undefined) {
      collectText(children, runs, foreignHere);
    }
    if (isBoundary) {
      endRun(runs);
    }
  }
}

/**
 * Rebuilds `node`, replacing each text segment with `next()`. Visits segments
 * in the same order as `collectText`. Untouched elements are returned as the
 * same object. Changed elements are cloned, which keeps key, ref and props.
 */
function replaceText(node: ReactNode, next: () => string, foreign: boolean): ReactNode {
  if (typeof node === "string") {
    return foreign ? node : next();
  }
  if (typeof node === "number") {
    if (foreign) {
      return node;
    }
    const before = String(node);
    const after = next();
    return after === before ? node : after;
  }
  if (isChildArray(node)) {
    return node.map(child => replaceText(child, next, foreign));
  }
  if (!isValidElement<ElementProps>(node)) {
    return node;
  }
  const children = descendInto(node);
  if (children === undefined) {
    return node;
  }
  return withChildren(node, replaceText(children, next, isForeignIn(node, foreign)));
}

/**
 * Clones an element with new children and keeps the shape of the old ones: a
 * one-item array stays an array, so a component that calls `children.map`
 * still works.
 *
 * In development React warns about missing keys on cloned elements in an
 * array, unless they were passed to `createElement` as separate arguments, the
 * way the JSX runtime passes static children. So the array is built by
 * `createElement` first, and the array React holds is used as the prop.
 */
function withChildren(
  element: ReactElement<ElementProps>,
  children: ReactNode
): ReactElement<ElementProps> {
  if (!isChildArray(children)) {
    return cloneElement(element, undefined, children);
  }
  const checked = createElement(Fragment, null, ...children).props.children;
  return cloneElement(element, {
    children: children.length > 1 ? checked : children.length === 1 ? [checked] : [],
  });
}

/**
 * Wraps walked children in a fragment without adding a DOM element. Use this
 * instead of `<>{children}</>`, so an array result is passed as static
 * children and React does not warn about missing keys.
 */
export function toFragment(children: ReactNode): ReactElement {
  return isChildArray(children)
    ? createElement(Fragment, null, ...children)
    : createElement(Fragment, null, children);
}

/**
 * Maps all text in a React tree. Text is grouped into runs, split at block
 * elements such as `<p>`, `<div>`, `<li>` and `<br>`. `transform` is called
 * once for each run, with the run's text segments in document order. It must
 * return the same number of segments. Inside a run, rules can work across
 * inline elements such as `<em>` or `<a>`. Rules never work across runs.
 *
 * Text under an element whose `lang` is not Icelandic is skipped, and it ends
 * the run. Pass `foreign: true` when the whole tree starts in another language.
 */
export function mapTextSegments(
  children: ReactNode,
  transform: (segments: string[]) => string[],
  { foreign = false }: { foreign?: boolean } = {}
): ReactNode {
  const runs: Runs = { done: [], current: [] };
  collectText(children, runs, foreign);
  endRun(runs);
  if (runs.done.length === 0) {
    return children;
  }

  const mapped = runs.done.flatMap(run => {
    const result = transform(run);
    if (result.length !== run.length) {
      throw new Error("transform must return one string for every text segment");
    }
    return result;
  });
  let index = 0;
  return replaceText(children, () => mapped[index++] ?? "", foreign);
}
