"use client";

import { useSyncExternalStore } from "react";
import { loadedSkiptingar, subscribeSkiptingar } from "./load";

type Core = typeof import("../index");

function getSnapshot(): Core | null {
  return loadedSkiptingar() ?? null;
}

/** On the server there is no core, and the first client render of a hydrating tree must match it. */
function getServerSnapshot(): null {
  return null;
}

/**
 * The hyphenation core, or `null` until it has loaded. Mounting starts the
 * load, so a component that needs the core (to call `analyzeWord`, say) uses
 * this hook. On the server, during hydration and if loading fails it returns
 * `null`. A component that mounts after the load gets the core at once.
 */
export function useSkiptingar(): Core | null {
  return useSyncExternalStore(subscribeSkiptingar, getSnapshot, getServerSnapshot);
}
