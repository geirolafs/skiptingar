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
import type { LocaleDetailsOptions } from "./locale-details";
import { parseExceptions } from "./parse-exceptions";
import { processSegments, resolveLocaleDetails } from "./process";
import { findProtectedMask } from "./url";

/**
 * The options a request may carry: what `useHyphenate` takes. A request
 * adds the locale details unless it says `localeDetails: false`.
 */
export type RemoteOptions = HyphenateOptions & {
  localeDetails?: boolean | LocaleDetailsOptions;
};

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
  /**
   * The longest run of characters between spaces. Default 200. Web addresses
   * are exempt, because the package leaves them alone. Hyphenating one word
   * takes time that grows with the square of its length.
   */
  maxWordLength?: number;
};

/** Runs the jobs of one request. Throws on a malformed one. */
export function runRemoteItems(items: readonly RemoteItem[]): RemoteResult[] {
  return items.map(item => {
    if (item.op === "process") {
      const { localeDetails, ...hyphenate } = item.options ?? {};
      const [output = item.text] = processSegments([item.text], {
        localeDetails: resolveLocaleDetails(localeDetails),
        hyphenate,
      });
      return output;
    }
    return analyzeWord(item.word, item.options);
  });
}

type Check = (value: unknown) => boolean;

const oneOf =
  (...allowed: readonly string[]): Check =>
  value =>
    typeof value === "string" && allowed.includes(value);
const isBoolean: Check = value => typeof value === "boolean";
/** A small whole number: a letter count, never a size to allocate. */
const isSmallInteger: Check = value =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 64;
/**
 * One character, as a person counts it: a code point, so an emoji is one and
 * the two halves of a broken pair are two. A lone surrogate is refused because
 * JSON writes each one as 6 bytes (`\\ud800`), and a control or line-separator
 * character because it would split the text. `isWellFormed` is left out: it is
 * not in the ES2022 lib or in Node 18, which the package supports, and
 * `\\p{Cs}` finds a lone surrogate in a `u` regex just as well.
 */
const isHyphenChar: Check = value =>
  typeof value === "string" &&
  [...value].length === 1 &&
  !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
const MAX_DICTIONARY_ENTRIES = 200;
const MAX_DICTIONARY_ENTRY_LENGTH = 64;
/**
 * A short list of lines that parse as exceptions. It is parsed here, so a
 * malformed or duplicate line is a 400 before any text is processed, and not
 * an error part way through the first word that needs the dictionary.
 */
const isDictionary: Check = value => {
  if (
    !(
      Array.isArray(value) &&
      value.length <= MAX_DICTIONARY_ENTRIES &&
      value.every(
        entry => typeof entry === "string" && entry.length <= MAX_DICTIONARY_ENTRY_LENGTH
      )
    )
  ) {
    return false;
  }
  try {
    parseExceptions(value.join("\n"));
    return true;
  } catch {
    return false;
  }
};

/**
 * What each option may be. `satisfies` makes a new option in `HyphenateOptions`
 * or `LocaleDetailsOptions` a type error here until it is checked: an option the
 * handler does not know is refused, never passed through.
 */
const HYPHENATE_CHECKS = {
  mode: oneOf("body", "heading"),
  joints: oneOf("only", "prefer"),
  betterBreaks: isBoolean,
  minWordLength: isSmallInteger,
  leftMin: isSmallInteger,
  rightMin: isSmallInteger,
  hyphenChar: isHyphenChar,
  exceptions: isBoolean,
  dictionary: isDictionary,
  skipAcronyms: isBoolean,
} satisfies Record<keyof HyphenateOptions, Check>;

const LOCALE_DETAILS_CHECKS = {
  quotes: isBoolean,
  singleLetter: isBoolean,
  lastWords: isBoolean,
  dashes: isBoolean,
  units: isBoolean,
  dates: isBoolean,
  ordinals: isBoolean,
  prefixes: isBoolean,
  titles: isBoolean,
  numbers: isBoolean,
} satisfies Record<keyof LocaleDetailsOptions, Check>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Why `value` is not an object of these options, or `undefined` when it is. */
function optionsError(
  name: string,
  value: unknown,
  checks: Record<string, Check>
): string | undefined {
  if (!isRecord(value)) {
    return `${name} must be an object`;
  }
  for (const [key, option] of Object.entries(value)) {
    const check = Object.hasOwn(checks, key) ? checks[key] : undefined;
    if (check === undefined) {
      return `${name}: unknown option ${JSON.stringify(key.slice(0, 32))}`;
    }
    if (!check(option)) {
      return `${name}.${key}: not an allowed value`;
    }
  }
  return;
}

/** Why `options` are not what a job may carry, or `undefined` when they are. */
function jobOptionsError(item: RemoteItem): string | undefined {
  const options: unknown = item.options;
  if (options === undefined) {
    return;
  }
  if (item.op === "analyze") {
    return optionsError("options", options, HYPHENATE_CHECKS);
  }
  // `localeDetails` is the one key a process job has beyond the hyphenate options.
  const error = optionsError("options", options, {
    ...HYPHENATE_CHECKS,
    localeDetails: () => true,
  });
  if (error !== undefined || !isRecord(options)) {
    return error;
  }
  const { localeDetails } = options;
  return localeDetails === undefined || typeof localeDetails === "boolean"
    ? undefined
    : optionsError("options.localeDetails", localeDetails, LOCALE_DETAILS_CHECKS);
}

function isItem(value: unknown): value is RemoteItem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.op === "process" && typeof value.text === "string") ||
    (value.op === "analyze" && typeof value.word === "string")
  );
}

/**
 * What a job costs against `maxCharacters`: its text or word and the lines of
 * its `dictionary`, which every word of the text is looked up in. The options
 * are not checked yet, so anything that is not a list of strings counts as 0.
 */
function sizeOf(item: RemoteItem): number {
  const base = (item.op === "process" ? item.text : item.word).length;
  const dictionary: unknown = item.options?.dictionary;
  if (!Array.isArray(dictionary)) {
    return base;
  }
  return dictionary.reduce<number>(
    (total, line) => total + (typeof line === "string" ? line.length : 0),
    base
  );
}

const SPACE = /\s/;

/**
 * True when `text` holds a run of more than `max` characters between spaces,
 * not counting web addresses. The package leaves an address alone however long
 * it is (one of 50 000 characters takes about 10 ms), so a pasted link passes.
 */
function hasLongWord(text: string, max: number): boolean {
  const long = new RegExp(`\\S{${max + 1}}`);
  if (!long.test(text)) {
    return false;
  }
  const mask = findProtectedMask(text);
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    run = mask[i] === 1 || SPACE.test(text.charAt(i)) ? 0 : run + 1;
    if (run > max) {
      return true;
    }
  }
  return false;
}

/** The body as text, or `undefined` when it is longer than `maxBytes`. */
async function readBody(request: Request, maxBytes: number): Promise<string | undefined> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) {
    return;
  }
  // The header can be missing or wrong, so the stream is counted as well.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/**
 * Answers a POST with `{ items: RemoteItem[] }` with `{ results }`, one for
 * each item. A malformed or oversized request gets a 400 (a body over the
 * size limit a 413); any other method a 405. The work is synchronous and fast
 * (a paragraph takes well under a millisecond), so the limits only guard
 * against abuse: the options are checked against what the package has, the
 * body is read with a size limit, and a word has a length limit.
 */
export async function handleSkiptingarRequest(
  request: Request,
  { maxItems = 200, maxCharacters = 50_000, maxWordLength = 200 }: HandlerLimits = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }
  // A page on another origin can send JSON only with a header that makes the
  // browser ask first (a preflight), which this route does not answer. So the
  // header is what keeps a form or a no-cors `fetch` from posting here.
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "content-type must be application/json" }, 415);
  }
  // 4 bytes for a character covers any text; each job adds room for its keys
  // and options. The limit is for what is read, not for what is valid.
  const maxBytes = maxCharacters * 4 + maxItems * 1024 + 4096;
  const text = await readBody(request, maxBytes);
  if (text === undefined) {
    return json({ error: `the body is over ${maxBytes} bytes` }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
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
  for (const item of items) {
    const error = jobOptionsError(item);
    if (error !== undefined) {
      return json({ error }, 400);
    }
  }
  const tooLong = items.some(item =>
    item.op === "analyze"
      ? item.word.length > maxWordLength
      : hasLongWord(item.text, maxWordLength)
  );
  if (tooLong) {
    return json({ error: `no word longer than ${maxWordLength} characters` }, 400);
  }
  try {
    return json({ results: runRemoteItems(items) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "bad request" }, 400);
  }
}
