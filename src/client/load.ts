type Core = typeof import("../index");

export type Loader = {
  /** Starts loading on the first call. Every call while loading or after a success returns one promise. */
  load: () => Promise<Core>;
  /** The core once it has loaded, otherwise `undefined`. */
  loaded: () => Core | undefined;
};

/**
 * A loader around one import function. A failed load is forgotten, so the next
 * `load()` tries again: a network error on the lazy chunk must not stay for
 * the rest of the page's life.
 */
export function createLoader(importCore: () => Promise<Core>): Loader {
  let loading: Promise<Core> | undefined;
  let core: Core | undefined;

  return {
    load() {
      loading ??= importCore().then(
        loaded => {
          core = loaded;
          return loaded;
        },
        (error: unknown) => {
          loading = undefined;
          throw error;
        }
      );
      return loading;
    },
    loaded: () => core,
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
 * The core if it has already loaded, otherwise `undefined`. It never starts a
 * load. Use it to render processed text at once on a later mount.
 */
export function loadedSkiptingar(): Core | undefined {
  return loader.loaded();
}
