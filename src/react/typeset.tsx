import type { ReactNode } from "react";
import type { TypesetOptions } from "../index";
import { transformChildren } from "./transform";
import { toFragment } from "./walk";

export type TypesetProps = TypesetOptions & {
  /**
   * Language of the children. Default `"is"`. Any other language processes
   * nothing, except inside an element with `lang="is"`.
   */
  lang?: string;
  children: ReactNode;
};

/**
 * Typesets Icelandic text in its children without hyphenating it. Renders no
 * wrapper element. Same tree walk, skipped elements and `lang` handling as
 * `<Hyphenate>`.
 */
export function Typeset({ children, lang, ...typesetOptions }: TypesetProps) {
  return toFragment(transformChildren(children, { typeset: typesetOptions, lang }));
}
