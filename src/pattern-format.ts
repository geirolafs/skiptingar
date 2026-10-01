/**
 * How the patterns are stored in `generated/data.ts`: sorted and
 * front-coded. Each line starts with one letter, `A` for 0 up to `Z`, that
 * says how many characters it shares with the line before it, followed by
 * the rest of the pattern. Sorted patterns share long prefixes, so this
 * shrinks the data by about a seventh after brotli (49 → 42 kB). It has no
 * imports, so the data generator can run it before the generated module
 * exists.
 */

const FIRST = "A".charCodeAt(0);
const MAX_SHARED = 25;

/** Front-codes sorted pattern lines into one string, a line each. */
export function encodePatterns(sorted: readonly string[]): string {
  let previous = "";
  const lines = sorted.map(pattern => {
    let shared = 0;
    while (
      shared < MAX_SHARED &&
      shared < previous.length &&
      shared < pattern.length &&
      previous[shared] === pattern[shared]
    ) {
      shared += 1;
    }
    previous = pattern;
    return String.fromCharCode(FIRST + shared) + pattern.slice(shared);
  });
  return lines.join("\n");
}

/** The pattern lines back from `encodePatterns`, in order. */
export function decodePatterns(encoded: string): string[] {
  const patterns: string[] = [];
  let previous = "";
  for (const line of encoded.split("\n")) {
    if (line === "") {
      continue;
    }
    const shared = line.charCodeAt(0) - FIRST;
    if (shared < 0 || shared > MAX_SHARED) {
      throw new Error(`patterns: bad front-coded line ${JSON.stringify(line)}`);
    }
    previous = previous.slice(0, shared) + line.slice(1);
    patterns.push(previous);
  }
  return patterns;
}
