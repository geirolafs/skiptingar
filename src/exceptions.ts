/**
 * The bundled exception list: words whose breaks are given by hand and fully
 * replace the pattern breaks. The format and the parser are in
 * ./parse-exceptions.
 */
import { EXCEPTIONS } from "./generated/data";
import { type ExceptionEntry, parseExceptions } from "./parse-exceptions";

export { type ExceptionEntry, parseExceptions };

let bundled: Map<string, ExceptionEntry> | undefined;

/** Looks up a lowercase word in the bundled exception list. */
export function lookupException(lowerWord: string): ExceptionEntry | undefined {
  bundled ??= parseExceptions(EXCEPTIONS);
  return bundled.get(lowerWord);
}
