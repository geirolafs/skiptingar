/**
 * Hyphenation by asking a server instead of loading the patterns: after
 * `configureSkiptingar({ endpoint })`, the hooks send their texts to that
 * endpoint (`handleSkiptingarRequest` on the server) and the 47 kB pattern
 * chunk is never downloaded. Requests made in the same tick go out as one,
 * answers are cached, and if the endpoint fails (the network, or a 5xx) the
 * hooks fall back to loading the patterns, for the rest of the page's life.
 * A request the endpoint refuses for its size or content (400, 413) is not a
 * failure of the endpoint: that batch comes back as given, unhyphenated, and
 * the next one goes to the endpoint as usual.
 */
import type { RemoteItem, RemoteResult } from "../server";

let endpoint: string | undefined;
let failed = false;
let version = 0;
const listeners = new Set<() => void>();
const results = new Map<string, RemoteResult>();
const queued = new Map<string, RemoteItem>();
const inFlight = new Set<string>();
let scheduled = false;

/** How many answers stay cached; the oldest go first. */
const CACHE_LIMIT = 2000;

/**
 * What one request may carry: the defaults of `handleSkiptingarRequest`. A
 * bigger queue goes out as several requests.
 */
const MAX_BATCH_ITEMS = 200;
const MAX_BATCH_CHARACTERS = 50_000;

/** The statuses for a request refused for what is in it: malformed or too big. */
const REFUSED = new Set([400, 413]);

type Entry = [key: string, item: RemoteItem];

/**
 * Sends the hooks' work to `endpoint`, a POST route that runs
 * `handleSkiptingarRequest`, instead of loading the patterns in the browser.
 * Call it once, at module scope, before the first hook renders. Pass
 * `{ endpoint: undefined }` to go back to loading the patterns.
 */
export function configureSkiptingar(options: { endpoint?: string }): void {
  endpoint = options.endpoint;
  failed = false;
  notify();
}

/** True while hooks should ask the endpoint: one is set and it has not failed. */
export function usesEndpoint(): boolean {
  return endpoint !== undefined && !failed;
}

function notify(): void {
  version += 1;
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Tells React when answers arrive, or the endpoint fails. */
export function subscribeRemote(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever an answer arrives or the endpoint fails. */
export function remoteVersion(): number {
  return version;
}

/** The cached answer for `key`, if it has arrived. */
export function remoteResult(key: string): RemoteResult | undefined {
  return results.get(key);
}

/** Asks for `item` unless it is answered, queued or on its way. */
export function requestRemote(key: string, item: RemoteItem): void {
  if (!usesEndpoint() || results.has(key) || queued.has(key) || inFlight.has(key)) {
    return;
  }
  queued.set(key, item);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

function remember(key: string, result: RemoteResult): void {
  results.set(key, result);
  if (results.size > CACHE_LIMIT) {
    results.delete(results.keys().next().value ?? "");
  }
}

/** What the endpoint counts: the text or word, and the lines of a `dictionary`. */
function sizeOf(item: RemoteItem): number {
  const base = (item.op === "process" ? item.text : item.word).length;
  return (item.options?.dictionary ?? []).reduce(
    (total, line) => total + line.length,
    base
  );
}

/** The queue in requests that stay under the endpoint's default limits, in order. */
export function splitBatches(entries: readonly Entry[]): Entry[][] {
  const batches: Entry[][] = [];
  let current: Entry[] = [];
  let characters = 0;
  for (const entry of entries) {
    const size = sizeOf(entry[1]);
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_ITEMS || characters + size > MAX_BATCH_CHARACTERS)
    ) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(entry);
    characters += size;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

/** An item the endpoint refused: the text as given, or no breaks. */
function unchanged(item: RemoteItem): RemoteResult {
  return item.op === "process" ? item.text : { breaks: [], joints: [] };
}

function flush(): void {
  scheduled = false;
  const url = endpoint;
  if (url === undefined || queued.size === 0) {
    return;
  }
  const batches = splitBatches([...queued]);
  queued.clear();
  for (const batch of batches) {
    for (const [key] of batch) {
      inFlight.add(key);
    }
    send(url, batch);
  }
}

/** One request. Only the network and the endpoint's own errors set `failed`. */
async function send(url: string, batch: Entry[]): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: batch.map(([, item]) => item) }),
    });
    if (REFUSED.has(response.status)) {
      for (const [key, item] of batch) {
        remember(key, unchanged(item));
      }
      return;
    }
    if (!response.ok) {
      throw new Error(`the endpoint answered ${response.status}`);
    }
    const body = (await response.json()) as { results?: RemoteResult[] };
    const answers = body.results ?? [];
    if (answers.length !== batch.length) {
      throw new Error("the endpoint answered a different number of items");
    }
    for (const [index, [key]] of batch.entries()) {
      remember(key, answers[index] as RemoteResult);
    }
  } catch {
    failed = true;
  } finally {
    for (const [key] of batch) {
      inFlight.delete(key);
    }
    notify();
  }
}
