"use client";

import { useMemo } from "react";
import type { UseHyphenateOptions } from "./options";
import { applyOptionsKey, optionsKey } from "./options";
import { useSkiptingar } from "./use-skiptingar";

/**
 * Hyphenates (and typesets) a string in the browser. The core loads lazily.
 * Until it has loaded, on the server, and if loading fails, the hook returns
 * the text as given. Then it returns the processed text. A component that
 * mounts after the core has loaded gets the processed text on its first
 * render. Options are compared by value.
 */
export function useHyphenate(text: string, options?: UseHyphenateOptions): string {
  const core = useSkiptingar();
  const key = optionsKey(options);

  return useMemo(
    () => (core ? applyOptionsKey(core, text, key) : text),
    [core, text, key]
  );
}
