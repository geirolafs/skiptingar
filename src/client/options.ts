import type { HyphenateOptions, TypesetOptions } from "../index";

export type UseHyphenateOptions = HyphenateOptions & {
  /** `true` uses the default typeset rules, `false` hyphenates only. Default `true`. */
  typeset?: boolean | TypesetOptions;
};

type Core = Pick<typeof import("../index"), "hyphenate" | "typesetSegments">;

/**
 * A string that is equal for equal options, whatever the key order and object
 * identity. React can use it as a dependency, so an inline options object does
 * not cause new work on every render.
 */
export function optionsKey(options: UseHyphenateOptions | undefined): string {
  return JSON.stringify(
    Object.entries(options ?? {})
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
  );
}

/** Runs the core on one string, with options from `optionsKey`. */
export function applyOptionsKey(core: Core, text: string, key: string): string {
  const { typeset = true, ...hyphenateOptions } = Object.fromEntries(
    JSON.parse(key) as [string, unknown][]
  ) as UseHyphenateOptions;
  const typesetted = typeset === false ? text : typesetOne(core, text, typeset);
  return core.hyphenate(typesetted, hyphenateOptions);
}

function typesetOne(core: Core, text: string, typeset: true | TypesetOptions): string {
  return core.typesetSegments([text], typeset === true ? {} : typeset)[0] ?? text;
}
