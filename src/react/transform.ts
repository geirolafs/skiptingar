import type { ReactNode } from "react";
import type { HyphenateOptions, TypesetOptions } from "../index";
import { hyphenate, typesetSegments } from "../index";
import { findProtectedMask } from "../url";
import { isIcelandic, mapTextSegments } from "./walk";

export type TransformOptions = {
  /** Hyphenation options. Omit or `false` to skip hyphenation. */
  hyphenate?: HyphenateOptions | false;
  /** Typeset options. Omit or `false` to skip typesetting. */
  typeset?: TypesetOptions | false;
  /**
   * Language of the whole tree. Default `"is"`. Any other language means
   * nothing is processed, except inside an element with `lang="is"`.
   */
  lang?: string;
};

/**
 * Typesets and hyphenates all text in a React tree.
 *
 * Text is found in strings, numbers, arrays, fragments and host elements, and
 * in the `children` prop of components. Text that a component renders by
 * itself is not reached, because components are never called. To cover it,
 * call `hyphenate()` in the server parent and pass the string down.
 *
 * Text is grouped into runs, split at block elements (`p`, `div`, `li`, `br`
 * and every tag not in `INLINE_TAGS`) and at skipped subtrees such as `<code>`. Typeset runs once over each run, so
 * quote pairs and similar rules work across inline elements but never across
 * blocks. Hyphenation then runs on each segment, but web addresses are found
 * in the joined text of the run, so a domain split across inline elements
 * (`<em>orð</em>.is`) is left alone, like the unsplit string.
 *
 * Language: text under an element with a `lang` that is not Icelandic (`is`,
 * `is-*`, any case; an empty `lang=""` is an unknown language) is left alone by both passes. Icelandic quote, number and
 * hyphenation rules do not fit English text, and the spelling rules say
 * English words follow English division. The element also ends the run, so
 * rules do not reach across it. A `lang="is"` inside it turns processing back
 * on. An element without `lang` keeps the language of its parent.
 *
 * The walk is recursive. Its depth is the nesting depth of the tree, and it
 * overflows the stack only beyond about 10,000 levels.
 */
export function transformChildren(
  children: ReactNode,
  options: TransformOptions = {}
): ReactNode {
  const { hyphenate: hyphenateOptions, typeset: typesetOptions, lang = "is" } = options;
  if (!(hyphenateOptions || typesetOptions)) {
    return children;
  }

  const foreign = !isIcelandic(lang);
  return mapTextSegments(
    children,
    rawSegments => {
      // typeset keeps text length, so it cannot normalise. Do it here, once,
      // before both passes, so their segment lengths agree. Each segment is
      // written back on its own, so it may be shorter than the original.
      const segments = rawSegments.map(segment => segment.normalize("NFC"));
      const typeset = typesetOptions
        ? typesetSegments(segments, typesetOptions)
        : segments;
      return hyphenateOptions ? hyphenateSegments(typeset, hyphenateOptions) : typeset;
    },
    { foreign }
  );
}

const SOFT_HYPHENS = /\u00AD/g;

/** Hyphenates each segment, except the parts that sit inside a web address. */
function hyphenateSegments(
  segments: readonly string[],
  options: HyphenateOptions
): string[] {
  // hyphenate() removes soft hyphens first, so offsets must be counted without them.
  const clean = segments.map(segment => segment.replace(SOFT_HYPHENS, ""));
  const mask = findProtectedMask(clean.join(""));

  let offset = 0;
  return clean.map(segment => {
    const start = offset;
    offset += segment.length;

    let out = "";
    for (let from = 0; from < segment.length; ) {
      const flag = mask[start + from];
      let to = from + 1;
      while (to < segment.length && mask[start + to] === flag) {
        to += 1;
      }
      const part = segment.slice(from, to);
      out += flag === 1 ? part : hyphenate(part, options);
      from = to;
    }
    return out;
  });
}

/** `true` means the default rules, `false` means off. */
export function resolveTypeset(
  value: boolean | TypesetOptions | undefined
): TypesetOptions | false {
  if (value === undefined || value === true) {
    return {};
  }
  return value;
}
