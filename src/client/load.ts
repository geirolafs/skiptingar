type Core = typeof import("../index");

export type Loader = {
  /** Starts loading on the first call. Every call while loading or after a success returns one promise. */
  load: () => Promise<Core>;
  /** The core once it has loaded, otherwise `undefined`. */
  loaded: () => Core | undefined;
  /**
   * Calls `listener` once when a load succeeds, for every listener subscribed
   * at that moment, whichever call started that load. Subscribing also starts a
   * load, or retries a failed one. A failed load tells nobody. Returns the
   * unsubscribe function.
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * A loader around one import function. A failed load is forgotten, so the next
 * `load()` tries again: a network error on the lazy chunk must not stay for
 * the rest of the page's life.
 */
export function createLoader(importCore: () => Promise<Core>): Loader {
  let loading: Promise<Core> | undefined;
  let core: Core | undefined;
  const listeners = new Set<() => void>();

  const load = (): Promise<Core> => {
    loading ??= importCore().then(
      loaded => {
        core = loaded;
        for (const listener of [...listeners]) {
          listener();
        }
        return loaded;
      },
      (error: unknown) => {
        loading = undefined;
        throw error;
      }
    );
    return loading;
  };

  return {
    load,
    loaded: () => core,
    subscribe(listener) {
      listeners.add(listener);
      // A failed load is not reported here; the next subscriber retries it.
      load().catch(() => undefined);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// This is the only way the client entry reaches the core, so the pattern data
// ships as its own lazy chunk and not in the main bundle.
const loader = createLoader(() => import("../index"));

/**
 * Loads the hyphenation core on first call. Calls share one promise. If the
 * load fails, the promise rejects and the next call tries again.
 */
export function loadSkiptingar(): Promise<Core> {
  return loader.load();
}

/**
 * Tells React when the core arrives and starts the load. Every subscriber is
 * told on a successful load, even when another subscriber's call started it.
 */
export function subscribeSkiptingar(listener: () => void): () => void {
  return loader.subscribe(listener);
}

/**
 * The core if it has already loaded, otherwise `undefined`. It never starts a
 * load. Use it to render processed text at once on a later mount.
 */
export function loadedSkiptingar(): Core | undefined {
  return loader.loaded();
}
