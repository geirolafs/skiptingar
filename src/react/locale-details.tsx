import type { ReactNode } from "react";
import type { LocaleDetailsOptions } from "../index";
import { transformChildren } from "./transform";
import { toFragment } from "./walk";

export type LocaleDetailsProps = LocaleDetailsOptions & {
  /**
   * Language of the children. Default `"is"`. Any other language processes
   * nothing, except inside an element with `lang="is"`.
   */
  lang?: string;
  children: ReactNode;
};

/**
 * Adds the locale details to Icelandic text in its children without hyphenating it. Renders no
 * wrapper element. Same tree walk, skipped elements and `lang` handling as
 * `<Hyphenate>`.
 */
export function LocaleDetails({
  children,
  lang,
  ...localeDetailsOptions
}: LocaleDetailsProps) {
  return toFragment(
    transformChildren(children, { localeDetails: localeDetailsOptions, lang })
  );
}
