import type { HyphenateOptions, TypesetOptions } from "../index";

export type UseHyphenateOptions = HyphenateOptions & {
  /** `true` uses the default typeset rules, `false` hyphenates only. Default `true`. */
  typeset?: boolean | TypesetOptions;
};

/** The two core functions the hook needs. A type only: the core loads lazily. */
type Core = Pick<typeof import("../index"), "processSegments" | "resolveTypeset">;

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
 * inline options object does not cause new work on every render.
 */
export function optionsKey(options: object | undefined): string {
  return JSON.stringify(sortKeys(options ?? {}));
}

/** Runs the core on one string, with options from `optionsKey`. */
export function applyOptionsKey(core: Core, text: string, key: string): string {
  const { typeset, ...hyphenateOptions } = JSON.parse(key) as UseHyphenateOptions;
  const [processed] = core.processSegments([text], {
    typeset: core.resolveTypeset(typeset),
    hyphenate: hyphenateOptions,
  });
  return processed ?? text;
}
