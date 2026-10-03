import type { LocaleDetailsOptions } from "./locale-details";

/**
 * Locale details are on by default: left out (`undefined`) or `true` means the default
 * rules, an options object sets them, and `false` means off. This file has no
 * imports of code, so the client entry can use it without the pattern data.
 */
export function resolveLocaleDetails(
  value: boolean | LocaleDetailsOptions | undefined
): LocaleDetailsOptions | false {
  if (value === undefined || value === true) {
    return {};
  }
  return value;
}
