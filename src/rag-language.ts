/**
 * Icelandic words that read badly at the end of a line: conjunctions,
 * prepositions and the infinitive marker, which all lean on the word after
 * them. For Settle Rag, which counts every one-letter word as short too.
 */
export const SHORT_WORDS: readonly string[] = [
  "og",
  "en",
  "eða",
  "né",
  "sem",
  "ef",
  "þó",
  "að",
  "um",
  "við",
  "til",
  "frá",
  "með",
  "úr",
  "af",
  "hjá",
  "yfir",
  "undir",
  "eftir",
  "gegn",
  "er",
];

/** The syllables that link an Icelandic compound's parts: `sveitar·stjórnar`. */
export const LINKING_SYLLABLES = ["ar", "ur", "is", "ir"] as const;

/**
 * Icelandic for Settle Rag: pass it as `language` in its options
 * (`{ language: RAG_LANGUAGE }`). A plain object, so this package needs
 * nothing from Settle Rag.
 */
export const RAG_LANGUAGE = {
  shortWords: SHORT_WORDS,
  linkingSyllables: LINKING_SYLLABLES,
  locale: "is",
} as const;
