# Changelog

## 0.3.0 (2026-10-03)

Breaking: `localeDetails()` no longer takes `preset`. It only turned on
`singleLetter` and `lastWords`, and it shared a name with
`rules: "typographic"`, which is unrelated. Pass
`{ singleLetter: true, lastWords: true }` instead. The endpoint now refuses
`preset` with a 400.

## 0.2.0 (2026-10-02)

Breaking: `typeset` is now `localeDetails` everywhere, so the code uses the
same name as the docs. The old names are gone, with no aliases. A client and
a server must both be on 0.2.0, because the key in the endpoint request
changed.

- `typeset()` is now `localeDetails()`
- `typesetSegments()` is now `localeDetailsSegments()`
- `resolveTypeset()` is now `resolveLocaleDetails()`
- `TypesetOptions` is now `LocaleDetailsOptions`
- `<Typeset>` is now `<LocaleDetails>`, and `TypesetProps` is now
  `LocaleDetailsProps`
- The `typeset` option is now `localeDetails`: the prop of `<Hyphenate>`, the
  option of `processSegments`, the client hooks and `RemoteOptions`, and the
  `typeset` key in the endpoint request JSON. The values are the same: `true`
  or left out is the default rules, an options object sets rules, `false`
  hyphenates only.

Also in this release:

- README: the "Locale details" layer now names every rule it applies,
  says kennitölur and phone numbers get a no-break hyphen, not a space, and
  says two rules are off by default.

## 0.1.3 (2026-10-02)

- `skiptingar/client` now re-exports `RAG_LANGUAGE`, `SHORT_WORDS` and
  `LINKING_SYLLABLES`, and the README documents them.
- Heading mode and `analyzeWord` docs now say when joints are found: from a
  `dictionary` `=` line, and with `exceptions: true` also from the exception
  list, name endings and linking syllables. Otherwise there are none.
- README: `30. september` moved to the date row, since `dates` binds day and
  month; a note that the `typeset` preset is not `rules: "typographic"`; the
  entry points table lists `analyzeWord()`, `handleSkiptingarRequest()`,
  the client hooks, `configureSkiptingar()` and `<CleanCopy />`; the
  `<Hyphenate>` props are described.
- RELEASING: removed the steps that applied only to `0.1.0`, and added the
  build and `check:dist` step.

## 0.1.2 (2026-10-02)

- README rewritten to match the package page: three layers on the server
  (letter patterns, better breaks, locale details), with CSS `text-wrap` as a
  recommendation, not a layer. It now leads with install and a first page,
  and adds what it fixes, the cost against other packages, support, the
  roadmap and the full pattern credits. No code changes.

## 0.1.1 (2026-10-02)

- Fixed: 0.1.0 did not load. Its `dist/index.js` exported `processSegments`
  and `resolveTypeset` twice, so `import "skiptingar"` threw a `SyntaxError`,
  and so did `skiptingar/react` and `skiptingar/client`. Use 0.1.1 or newer.
- Every built entry is now loaded in Node before a release, so a bundle that
  does not load cannot be published again.
- README: the `processSegments` example shows the default typographic rules,
  and the Ritreglur minimums are described as they are in Ritreglur.

## 0.1.0 (2026-10-02)

The first version meant for npm. The API may still change before 1.0.

- `hyphenate()` and `processSegments()`: Icelandic hyphenation with the 2020
  patterns from the Árni Magnússon Institute, and a `dictionary` option for
  your own words. The breaks go into the text as soft hyphens on the server,
  so the browser runs no hyphenation code.
- The typographic rules are on by default (`rules: "typographic"`). They are
  new, experimental and under development, so they may change and may give
  odd results. They drop legal breaks that read badly: body words need 6
  letters or more, with 2 letters before a break and 3 after (`ólán` stays
  whole); the break before a linking syllable `ar`, `ur`, `is` or `ir` goes
  (`sveitar·stjórnar·kosn·ingum`); and a capitalised foreign name with c, q or
  w stays whole (`Icelandair`). Pass `rules: "ritreglur"` for the official
  Ritreglur minimums alone: words of 4 letters or more, at least 1 letter
  before a break and 2 after.
- Not part of v1, and off by default: the bundled list of corrected words
  (`exceptions: true`), the skip for all-caps words of 4 to 8 letters such as
  `UNESCO` (`skipAcronyms: true`) and the heading mode that breaks a word at
  its compound joints (`mode: "heading"`). They are still in the code and may
  change. A more opinionated layer built from them is planned for a later
  version.
- Typeset is on by default where it is a switch: `<Hyphenate>`, the client
  hooks (`useHyphenate`, `useHyphenateAll`) and the server handler hyphenate
  and typeset unless you pass `typeset={false}` or `typeset: false`.
  `hyphenate()` never typesets, and `processSegments` only does when given
  `typeset`.
- `typeset()`: no-break spaces for numbers and units, dates, ordinals,
  abbreviations with numbers, titles and initials; kennitala and phone
  numbers kept on one line; Icelandic quotes; en dashes in ranges. One-letter
  words and the last two words are opt-in. Every rule has its own option.
- `skiptingar/react`: `<Hyphenate>` and `<Typeset>` for server components.
- `skiptingar/client`: `useHyphenate` with lazily loaded patterns, and
  `CleanCopy`.
- `RAG_LANGUAGE`, `LINKING_SYLLABLES` and `SHORT_WORDS`: the Icelandic short
  words and linking syllables, ready to pass to the `settle-rag` package as
  `language`. Settle rag itself is its own package.
- `handleSkiptingarRequest()` and `configureSkiptingar({ endpoint })`: hyphenate
  browser text on your server, so the patterns do not download unless the
  server cannot be reached.
- The patterns are front-coded: 48.9 kB brotli (`sizes.json`) instead of 54.
