let loading: Promise<typeof import("../index")> | undefined;

/**
 * Loads the hyphenation core on first call. Every call returns the same
 * promise. This is the only way the client entry reaches the core, so the
 * pattern data ships as its own lazy chunk and not in the main bundle.
 */
export function loadSkiptingar(): Promise<typeof import("../index")> {
  loading ??= import("../index");
  return loading;
}
