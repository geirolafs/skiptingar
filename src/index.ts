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
export type { ProcessOptions } from "./process";
export { processSegments, resolveTypeset } from "./process";
export type {
  BreakPlan,
  Hang,
  HangPiece,
  Metrics,
  RagOptions,
  SettledPiece,
  Tightened,
} from "./rag";
export {
  applyRag,
  bestBreaks,
  DEFAULT_RAG_OPTIONS,
  SHORT_WORDS,
  splitHangs,
  splitSettled,
} from "./rag";
export type { HandlerLimits, RemoteItem, RemoteOptions, RemoteResult } from "./server";
export { handleSkiptingarRequest, runRemoteItems } from "./server";
export type { TypesetOptions } from "./typeset";
export {
  NUMBER_PREFIXES,
  NUMBER_UNITS,
  SPACED_ABBREVIATIONS,
  typeset,
  typesetSegments,
} from "./typeset";
