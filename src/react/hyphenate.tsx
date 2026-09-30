import type { ReactNode } from "react";
import type { HyphenateOptions, TypesetOptions } from "../index";
import { resolveTypeset, transformChildren } from "./transform";
import { toFragment } from "./walk";

export type HyphenateProps = Omit<HyphenateOptions, "hyphenChar"> & {
  /**
   * Typeset rules (no-break spaces, Icelandic quotes). `true` uses the
   * defaults, `false` hyphenates only. Default `true`.
   */
  typeset?: boolean | TypesetOptions;
  /**
   * Language of the children. Default `"is"`. Any other language processes
   * nothing, except inside an element with `lang="is"`.
   */
  lang?: string;
  children: ReactNode;
};

/**
 * Hyphenates Icelandic text in its children. Renders no wrapper element.
 *
 * ```tsx
 * <Hyphenate mode="heading">
 *   <h1>Hraðbrautarframkvæmdir á <em>landsbyggðinni</em></h1>
 * </Hyphenate>
 * ```
 *
 * This is a server component. It reads the element tree it is given and
 * rewrites the text in it.
 *
 * - Text in `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`,
 *   `svg` and `math` is left alone. So is any element with `translate="no"` or
 *   `data-skiptingar="off"`.
 * - Text under an element with a `lang` that is not Icelandic (`is`, `is-*`,
 *   any case) is left alone, and it also ends the run for typesetting. English
 *   words follow English division, and Icelandic quotes do not fit English text.
 *   A `lang="is"` inside it turns processing back on.
 * - Attributes such as `title` and `aria-label` are not changed.
 * - Components are never called. Only their `children` prop is visited. Text
 *   that a component renders by itself is not reached. To cover it, call
 *   `hyphenate()` in the server parent and pass the string down.
 */
export function Hyphenate({
  children,
  typeset = true,
  lang,
  ...hyphenateOptions
}: HyphenateProps) {
  return toFragment(
    transformChildren(children, {
      hyphenate: hyphenateOptions,
      typeset: resolveTypeset(typeset),
      lang,
    })
  );
}
