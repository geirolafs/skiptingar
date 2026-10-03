import type { HyphenateOptions, LocaleDetailsOptions } from "../index";
// From its own module: the `../index` core loads lazily, and this file must not pull it in.
import { resolveLocaleDetails } from "../resolve-locale-details";

export type UseHyphenateOptions = HyphenateOptions & {
  /**
   * Locale details are on by default. `true` or leaving it out uses the default
   * rules, an options object sets them, `false` hyphenates only.
   * Default `true`.
   */
  localeDetails?: boolean | LocaleDetailsOptions;
};

/** The core function the hook needs. A type only: the core loads lazily. */
type Core = Pick<typeof import("../index"), "processSegments">;

/** The same value with every object's keys sorted and `undefined` values dropped. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, item]) => [name, sortKeys(item)])
    );
  }
  return value;
}

/**
 * A string that is equal for equal options, whatever the key order (nested
 * objects too) and object identity. React can use it as a dependency, so an
 * inline options object does not cause new work on every render. Options that
 * give the same output share a key: `localeDetails` left out, `true` and `{}` are all
 * the default rules. `localeDetails: false` stays apart.
 */
export function optionsKey(options: object | undefined): string {
  const sorted = sortKeys(options ?? {}) as Record<string, unknown>;
  const { localeDetails } = sorted;
  const isDefaultLocaleDetails =
    localeDetails === true ||
    (typeof localeDetails === "object" &&
      localeDetails !== null &&
      !Array.isArray(localeDetails) &&
      Object.keys(localeDetails).length === 0);
  if (isDefaultLocaleDetails) {
    // `sorted` is a fresh object from `sortKeys`, so it is safe to edit.
    delete sorted.localeDetails;
  }
  return JSON.stringify(sorted);
}

/** Runs the core on one string, with options from `optionsKey`. */
export function applyOptionsKey(core: Core, text: string, key: string): string {
  const { localeDetails, ...hyphenateOptions } = JSON.parse(key) as UseHyphenateOptions;
  const [processed] = core.processSegments([text], {
    localeDetails: resolveLocaleDetails(localeDetails),
    hyphenate: hyphenateOptions,
  });
  return processed ?? text;
}
