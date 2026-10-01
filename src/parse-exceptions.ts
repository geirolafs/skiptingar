/**
 * Parser for the exception list: words whose breaks are given by hand and
 * fully replace the pattern breaks. It has no imports, so the data generator
 * can run it before the generated module exists.
 *
 * Format, one word per line, lowercase:
 *   -  a normal break
 *   =  a compound joint (also a break)
 * Lines starting with `#` are comments. Blank lines are ignored.
 */
export type ExceptionEntry = {
  /** Every break, joints included, as "after N letters". Ascending. */
  breaks: number[];
  /** Only the compound joints. Ascending. */
  joints: number[];
};

const LETTERS_ONLY = /^\p{L}+$/u;
const NEWLINES = /\r?\n/;
const SEPARATOR = /[-=]/;

function parseLine(line: string, lineNumber: number): [string, ExceptionEntry] {
  const fail = (reason: string): never => {
    throw new Error(`exceptions line ${lineNumber}: ${reason} (${JSON.stringify(line)})`);
  };

  let word = "";
  const breaks: number[] = [];
  const joints: number[] = [];
  let previousWasSeparator = true; // true at the start rejects a leading separator

  for (const ch of line) {
    if (SEPARATOR.test(ch)) {
      if (previousWasSeparator) {
        fail(
          word === "" ? "separator at the start" : "two separators next to each other"
        );
      }
      const position = [...word].length;
      breaks.push(position);
      if (ch === "=") {
        joints.push(position);
      }
      previousWasSeparator = true;
    } else {
      word += ch;
      previousWasSeparator = false;
    }
  }

  if (previousWasSeparator && line !== "") {
    fail("separator at the end");
  }
  if (!LETTERS_ONLY.test(word)) {
    fail("the word must contain letters only");
  }
  if (word !== word.toLowerCase()) {
    fail("the word must be lowercase");
  }
  return [word, { breaks, joints }];
}

/** Parses exception text into a map keyed by the lowercase word. */
export function parseExceptions(text: string): Map<string, ExceptionEntry> {
  const entries = new Map<string, ExceptionEntry>();
  const lines = text.split(NEWLINES);

  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const [word, entry] = parseLine(line, index + 1);
    if (entries.has(word)) {
      throw new Error(`exceptions line ${index + 1}: duplicate word "${word}"`);
    }
    entries.set(word, entry);
  }
  return entries;
}
