export { NO_BREAK_SPACE, NON_BREAKING_HYPHEN, SOFT_HYPHEN } from "./characters";
/** Where each slot's winning pattern digit is, for drawing how a word is broken. */
export { patternPoints } from "./engine";
export { type ExceptionEntry, parseExceptions } from "./exceptions";
export { EXCEPTION_COUNT, PATTERN_COUNT } from "./generated/data";
export type { HyphenateOptions } from "./hyphenate";
export {
  ACRONYM_LENGTH,
  analyzeWord,
  breakOffsets,
  hyphenate,
  hyphenateWord,
  NAME_ENDINGS,
} from "./hyphenate";
export type { LocaleDetailsOptions } from "./locale-details";
export {
  LOCALE_RULE_COUNT,
  LOCALE_RULES,
  localeDetails,
  localeDetailsSegments,
  NUMBER_PREFIXES,
  NUMBER_UNITS,
  SPACED_ABBREVIATIONS,
} from "./locale-details";
export type { ProcessOptions } from "./process";
export { processSegments, resolveLocaleDetails } from "./process";
export { LINKING_SYLLABLES, RAG_LANGUAGE, SHORT_WORDS } from "./rag-language";
export type { HandlerLimits, RemoteItem, RemoteOptions, RemoteResult } from "./server";
export { handleSkiptingarRequest, runRemoteItems } from "./server";
