/**
 * Franklin Liang's hyphenation algorithm over the 2020 Icelandic patterns.
 *
 * A pattern is letters with digits in between, e.g. `af4lið.`. A dot marks a
 * word boundary. Every inter-letter slot takes the highest digit of any
 * pattern that covers it. Odd means a break is allowed, even means forbidden.
 */
import { PATTERNS } from "./generated/data";

type PatternTable = {
  /** Digit weights per pattern, keyed by the pattern without its digits. */
  weights: Map<string, Uint8Array>;
  /** Length in characters of the longest pattern key. */
  maxKeyLength: number;
};

const DIGIT = /\d/;
const CACHE_LIMIT = 20_000;

let table: PatternTable | undefined;
const cache = new Map<string, readonly number[]>();

function parsePatterns(source: string): PatternTable {
  const weights = new Map<string, Uint8Array>();
  let maxKeyLength = 0;

  for (const line of source.split("\n")) {
    if (line === "") {
      continue;
    }
    let key = "";
    let slot = 0;
    const slotWeights: number[] = [0];
    for (const ch of line) {
      if (DIGIT.test(ch)) {
        slotWeights[slot] = Number(ch);
      } else {
        key += ch;
        slot += 1;
        slotWeights.push(0);
      }
    }
    weights.set(key, Uint8Array.from(slotWeights));
    maxKeyLength = Math.max(maxKeyLength, slot);
  }
  return { weights, maxKeyLength };
}

function getTable(): PatternTable {
  table ??= parsePatterns(PATTERNS);
  return table;
}

/**
 * The winning digit at every slot of a lowercase word, as Liang's algorithm
 * finds it: the word is wrapped in boundary dots, and slot `i` sits before
 * `chars[i]`. So the slot between letter `n` and letter `n + 1` (1-based) is
 * `points[n + 1]`. Odd allows a break there, even forbids one. Exported for
 * the playground's diagram; `patternBreaks` is the API.
 */
export function patternPoints(lowerWord: string): Uint8Array {
  const { weights, maxKeyLength } = getTable();
  const chars = [".", ...lowerWord, "."];
  const points = new Uint8Array(chars.length + 1);

  for (let start = 0; start < chars.length; start++) {
    const last = Math.min(chars.length, start + maxKeyLength);
    let key = "";
    for (let end = start; end < last; end++) {
      key += chars[end];
      const found = weights.get(key);
      if (!found) {
        continue;
      }
      for (let slot = 0; slot < found.length; slot++) {
        const weight = found[slot] ?? 0;
        if (weight > (points[start + slot] ?? 0)) {
          points[start + slot] = weight;
        }
      }
    }
  }
  return points;
}

/**
 * Break positions the patterns allow in a lowercase word, with no minimum
 * left or right margin applied. A position `i` means "after `i` letters", so
 * every value lies in `1..letters - 1`. Letters are counted in code points.
 */
export function patternBreaks(lowerWord: string): readonly number[] {
  const cached = cache.get(lowerWord);
  if (cached) {
    return cached;
  }

  const points = patternPoints(lowerWord);
  const chars = [".", ...lowerWord, "."];

  // chars[0] is the leading dot, so a break after `i` letters sits before
  // chars[i + 1], which is points[i + 1].
  const letters = chars.length - 2;
  const breaks: number[] = [];
  for (let i = 1; i < letters; i++) {
    if (((points[i + 1] ?? 0) & 1) === 1) {
      breaks.push(i);
    }
  }

  if (cache.size >= CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(lowerWord, breaks);
  return breaks;
}
