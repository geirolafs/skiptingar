import type { ReactNode } from "react";
import type { HyphenateOptions, LocaleDetailsOptions } from "../index";
// From the module, not the `.` entry: an entry importing another entry makes
// Bun (1.2.21, `splitting: true`) export these names twice, which no runtime loads.
import { processSegments } from "../process";
import { isIcelandic, mapTextSegments } from "./walk";

export type TransformOptions = {
  /** Hyphenation options. Omit or `false` to skip hyphenation. */
  hyphenate?: HyphenateOptions | false;
  /** Locale details options. Omit or `false` to skip them. */
  localeDetails?: LocaleDetailsOptions | false;
  /**
   * Language of the whole tree. Default `"is"`. Any other language means
   * nothing is processed, except inside an element with `lang="is"`.
   */
  lang?: string;
};

/**
 * Adds the locale details to and hyphenates all text in a React tree.
 *
 * Text is found in strings, numbers, arrays, fragments and host elements, and
 * in the `children` prop of components. Text that a component renders by
 * itself is not reached, because components are never called. To cover it,
 * call `hyphenate()` in the server parent and pass the string down.
 *
 * Text is grouped into runs, split at block elements (`p`, `div`, `li`, `br`
 * and every tag not in `INLINE_TAGS`) and at skipped subtrees such as
 * `<code>`. Each run goes through `processSegments` as a whole: the locale details and
 * hyphenation both see the joined text of the run, and never reach across
 * blocks. So quote pairs work across inline elements, a word split by inline
 * markup (`hest<span>arnir</span>`) is hyphenated as one word, and a web
 * address split across inline elements (`<em>orð</em>.is`) is found and left
 * alone, like the unsplit string.
 *
 * Language: text under an element with a `lang` that is not Icelandic (`is`,
 * `is-*`, any case; an empty `lang=""` is an unknown language) is left alone
 * by both passes. Icelandic quote, number and hyphenation rules do not fit
 * English text, and the spelling rules say English words follow English
 * division. The element also ends the run, so rules do not reach across it. A
 * `lang="is"` inside it turns processing back on. An element without `lang`
 * keeps the language of its parent.
 *
 * The walk is recursive. Its depth is the nesting depth of the tree, and it
 * overflows the stack only beyond about 10,000 levels.
 */
export function transformChildren(
  children: ReactNode,
  options: TransformOptions = {}
): ReactNode {
  const {
    hyphenate: hyphenateOptions,
    localeDetails: localeDetailsOptions,
    lang = "is",
  } = options;
  if (!(hyphenateOptions || localeDetailsOptions)) {
    return children;
  }

  const foreign = !isIcelandic(lang);
  return mapTextSegments(
    children,
    segments =>
      processSegments(segments, {
        hyphenate: hyphenateOptions,
        localeDetails: localeDetailsOptions,
      }),
    { foreign }
  );
}
