export { NO_BREAK_SPACE, NON_BREAKING_HYPHEN, SOFT_HYPHEN } from "./characters";
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
export type { TypesetOptions } from "./typeset";
export {
  NUMBER_PREFIXES,
  NUMBER_UNITS,
  SPACED_ABBREVIATIONS,
  typeset,
  typesetSegments,
} from "./typeset";
