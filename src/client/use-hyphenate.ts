"use client";

import { useMemo, useSyncExternalStore } from "react";
import { loadedSkiptingar, loadSkiptingar } from "./load";
import type { UseHyphenateOptions } from "./options";
import { applyOptionsKey, optionsKey } from "./options";

/** Starts loading the core and tells React when it arrives. A failed load is ignored. */
function subscribe(onChange: () => void): () => void {
  let active = true;
  loadSkiptingar().then(
    () => {
      if (active) {
        onChange();
      }
    },
    () => undefined
  );
  return () => {
    active = false;
  };
}

/** On the server there is no core, and the first client render of a hydrating tree must match it. */
function getServerSnapshot(): undefined {
  return undefined;
}

/**
 * Hyphenates (and typesets) a string in the browser. The core loads lazily.
 * Until it has loaded, on the server, and if loading fails, the hook returns
 * the text as given. Then it returns the processed text. A component that
 * mounts after the core has loaded gets the processed text on its first
 * render. Options are compared by value.
 */
export function useHyphenate(text: string, options?: UseHyphenateOptions): string {
  const core = useSyncExternalStore(subscribe, loadedSkiptingar, getServerSnapshot);
  const key = optionsKey(options);

  return useMemo(
    () => (core ? applyOptionsKey(core, text, key) : text),
    [core, text, key]
  );
}
