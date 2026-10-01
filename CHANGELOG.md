# Changelog

## 0.1.0 (not released)

The first version meant for npm. The API may still change before 1.0.

- `hyphenate()` and `processSegments()`: Icelandic hyphenation with the 2020
  patterns from the Árni Magnússon Institute, typographic and Ritreglur
  presets, body and heading modes, an exception list, and a `dictionary`
  option for your own words. Typographic rules drop the break before a
  linking syllable (`stjórnar-völd`), and heading mode breaks at compound
  joints.
- `typeset()`: no-break spaces for numbers and units, dates, ordinals,
  abbreviations with numbers, titles and initials; kennitala and phone
  numbers kept on one line; Icelandic quotes; opt-in en dashes, one-letter
  words and last two words. Every rule has its own option.
- `skiptingar/react`: `<Hyphenate>` and `<Typeset>` for server components.
- `skiptingar/client`: Settle rag (`SettledText`, `useSettledRag`,
  `useRagPlan`, `settle` for plain DOM), `useHyphenate` with lazily loaded
  patterns, and `CleanCopy`.
- `bestBreaks()`: the rag search alone, without a browser.
