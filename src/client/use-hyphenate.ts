"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSkiptingar } from "./load";
import type { UseHyphenateOptions } from "./options";
import { applyOptionsKey, optionsKey } from "./options";

type Core = Awaited<ReturnType<typeof loadSkiptingar>>;

/**
 * Hyphenates (and typesets) a string in the browser. The core loads lazily.
 * Until it has loaded, and on the server, the hook returns the text as given.
 * Then it returns the processed text. Options are compared by value.
 */
export function useHyphenate(text: string, options?: UseHyphenateOptions): string {
  const [core, setCore] = useState<Core | null>(null);
  const key = optionsKey(options);

  useEffect(() => {
    let active = true;
    loadSkiptingar().then(loaded => {
      if (active) {
        setCore(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () => (core ? applyOptionsKey(core, text, key) : text),
    [core, text, key]
  );
}
