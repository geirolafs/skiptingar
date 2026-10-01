/**
 * Hyphenation over HTTP, so a browser can process text without downloading
 * the patterns: mount `handleSkiptingarRequest` on a POST route, and point
 * the client at it with `configureSkiptingar({ endpoint })`. It speaks the
 * standard `Request` and `Response`, so a Next.js route handler, Bun, Deno or
 * a worker can serve it as it is.
 *
 * ```ts
 * // app/api/skiptingar/route.ts
 * import { handleSkiptingarRequest } from "skiptingar";
 * export const POST = (request: Request) => handleSkiptingarRequest(request);
 * ```
 */
import { analyzeWord, type HyphenateOptions } from "./hyphenate";
import { processSegments, resolveTypeset } from "./process";
import type { TypesetOptions } from "./typeset";

/** The options a request may carry: what `useHyphenate` takes. */
export type RemoteOptions = HyphenateOptions & { typeset?: boolean | TypesetOptions };

/** One job in a request. */
export type RemoteItem =
  | { op: "process"; text: string; options?: RemoteOptions }
  | { op: "analyze"; word: string; options?: HyphenateOptions };

/** The answer to each job, in order. */
export type RemoteResult = string | { breaks: number[]; joints: number[] };

export type HandlerLimits = {
  /** The most jobs in one request. Default 200. */
  maxItems?: number;
  /** The most characters across a request's texts and words. Default 50 000. */
  maxCharacters?: number;
};

/** Runs the jobs of one request. Throws on a malformed one. */
export function runRemoteItems(items: readonly RemoteItem[]): RemoteResult[] {
  return items.map(item => {
    if (item.op === "process") {
      const { typeset, ...hyphenate } = item.options ?? {};
      const [output = item.text] = processSegments([item.text], {
        typeset: resolveTypeset(typeset),
        hyphenate,
      });
      return output;
    }
    return analyzeWord(item.word, item.options);
  });
}

function isItem(value: unknown): value is RemoteItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  const options = item.options;
  const optionsOk =
    options === undefined || (typeof options === "object" && options !== null);
  return (
    optionsOk &&
    ((item.op === "process" && typeof item.text === "string") ||
      (item.op === "analyze" && typeof item.word === "string"))
  );
}

function sizeOf(item: RemoteItem): number {
  return (item.op === "process" ? item.text : item.word).length;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/**
 * Answers a POST with `{ items: RemoteItem[] }` with `{ results }`, one for
 * each item. A malformed or oversized request gets a 400; any other method
 * a 405. The work is synchronous and fast (a paragraph takes well under a
 * millisecond), so the limits only guard against abuse.
 */
export async function handleSkiptingarRequest(
  request: Request,
  { maxItems = 200, maxCharacters = 50_000 }: HandlerLimits = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "the body must be JSON" }, 400);
  }
  const items = (body as { items?: unknown } | null)?.items;
  if (!(Array.isArray(items) && items.length <= maxItems && items.every(isItem))) {
    return json({ error: `items: up to ${maxItems} process or analyze jobs` }, 400);
  }
  if (items.reduce((total, item) => total + sizeOf(item), 0) > maxCharacters) {
    return json({ error: `at most ${maxCharacters} characters in one request` }, 400);
  }
  try {
    return json({ results: runRemoteItems(items) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "bad request" }, 400);
  }
}
