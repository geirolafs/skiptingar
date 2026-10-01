/**
 * The bundled exception list: words whose breaks are given by hand and fully
 * replace the pattern breaks. The format and the parser are in
 * ./parse-exceptions.
 */
import { EXCEPTIONS } from "./generated/data";
import { type ExceptionEntry, parseExceptions } from "./parse-exceptions";

export { type ExceptionEntry, parseExceptions };

let bundled: Map<string, ExceptionEntry> | undefined;

/** The last few dictionaries a caller passed, parsed, by their text. */
const dictionaries = new Map<string, Map<string, ExceptionEntry>>();
const DICTIONARY_CACHE = 8;

function parsedDictionary(lines: readonly string[]): Map<string, ExceptionEntry> {
  const text = lines.join("\n");
  let parsed = dictionaries.get(text);
  if (!parsed) {
    parsed = parseExceptions(text);
    if (dictionaries.size >= DICTIONARY_CACHE) {
      dictionaries.delete(dictionaries.keys().next().value ?? "");
    }
    dictionaries.set(text, parsed);
  }
  return parsed;
}

/**
 * Looks up a lowercase word: in the caller's own `dictionary` first (lines
 * in the exception list's format), then, unless `bundled` is false, in the
 * bundled exception list.
 */
export function lookupException(
  lowerWord: string,
  {
    dictionary,
    bundled: useBundled = true,
  }: { dictionary?: readonly string[]; bundled?: boolean } = {}
): ExceptionEntry | undefined {
  const own =
    dictionary && dictionary.length > 0
      ? parsedDictionary(dictionary).get(lowerWord)
      : undefined;
  if (own || !useBundled) {
    return own;
  }
  bundled ??= parseExceptions(EXCEPTIONS);
  return bundled.get(lowerWord);
}
