# skiptingar

Icelandic hyphenation and typography for the web.

Long Icelandic compounds overflow narrow columns and headings, and browsers
mostly can't help. Firefox ships an Icelandic hyphenation dictionary; Chrome
does not; Safari does not appear to (it uses the operating system's
dictionaries, and Icelandic was not among them in a published probe), so test
it.
`skiptingar` puts soft hyphens into the text itself, on the server, so every
browser breaks words the same way and the page ships no extra JavaScript.

```
Vaðla·heiðar·vega·vinnu·verkfæra·geymslu·skúr
Hann sagði „Verð 1.000⍽kr. frá 30.⍽september“
```

`·` is a soft hyphen (invisible until a line breaks there), `⍽` a no-break space.

## Status

Not on npm yet. It lives in a website repo while the API settles. Copy the
folder if you want it now. It has no runtime dependencies. React is only
needed for the React and client entry points.

## Three layers

### 1. Plain functions, anywhere

```ts
import { hyphenate, typeset } from "skiptingar";

hyphenate("Hraðbrautarframkvæmdir á landsbyggðinni");
// "Hrað­braut­ar­fram­kvæmdir á lands­byggð­inni"

typeset('Verð 1.000 kr. frá 30. september, sagði "hann"');
// no-break spaces in "1.000 kr." and "30. september", quotes become „hann“
```

`hyphenate(text, options)`

| Option                                 | Default         |                                                                               |
| -------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `mode`                                 | `"body"`        | `"heading"` only breaks long words, and at compound joints when it knows them |
| `rules`                                | `"typographic"` | `"ritreglur"` allows every legal break, including `ó-lán`                     |
| `minWordLength`, `leftMin`, `rightMin` | from the preset | override one number, keep the rest                                            |
| `hyphenChar`                           | `"­"`           | use `"-"` to see the breaks                                                   |
| `exceptions`                           | `true`          | uses the exception list and `NAME_ENDINGS` joints; `false` gives raw patterns |
| `skipAcronyms`                         | `true`          | all-caps words of 4 to 8 letters (`UNESCO`, `NATO`) never break               |

The presets:

|               | body                                                   | heading                            |
| ------------- | ------------------------------------------------------ | ---------------------------------- |
| `typographic` | words of 6+ letters, 2 letters before a break, 3 after | 12+ letters, 3 before, 4 after     |
| `ritreglur`   | 4+ letters, 1 before, 2 after (see below)              | same limits, compound joints first |

`NAME_ENDINGS` is an exported list of productive second elements of place
names and patronymics (`-eyri`, `-dóttir`, `-son`, `-staðir`, `-vík`, and so
on). Ritreglur §33.1 prefers to break a compound at its joint, but the patterns
alone give `Ak-ur-eyri` and `Sig-urð-ar-dóttir`. In heading mode a word that
ends with one of these (with 3 or more letters before it) prefers that
boundary, but only when the patterns already allow a break there
(`Akur-eyri`, `Sigurðar-dóttir`). It never adds or removes a break, and body
mode is not changed (`majónes` stays `maj-ónes`). Words in the exception list
win. `ACRONYM_LENGTH` holds the 4 to 8 letter range for `skipAcronyms`; it is
a design choice, not a spelling rule.

The `ritreglur` limits of 1 letter before and 2 after come from the data: the
Árni Magnússon patterns set `LEFTHYPHENMIN 1` and `RIGHTHYPHENMIN 2`. The
4-letter minimum word length is skiptingar's own choice.

`typographic` never produces a break that `ritreglur` forbids. It only drops
the ones that look bad.

`typeset(text, options)` only swaps characters, it never adds or removes any.

| Rule                 | Example                                                                                        | Default                       |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Number and unit      | `1.000 kr.`, `5 km`, `20 °C`                                                                   | on                            |
| Ordinal and date     | `30. september 2026`, `1. sæti`                                                                | on                            |
| Abbreviation, number | `nr. 5`, `bls. 12`, `kl. 14.30`                                                                | on                            |
| Kennitala, phone     | `010190-2939`, `555-1234`, `+354 555 1234` never split                                         | on (`numbers: false` to skip) |
| Title and name       | `dr. Jón`                                                                                      | on                            |
| Quotes               | `"orð"` → `„orð“`; a paired `'orð'` → `‚orð‘`, the mark for a word's meaning (Ritreglur §28.2) | on                            |
| One-letter words     | `á`, `í` never end a line                                                                      | `singleLetter: true`          |
| Last two words       | no one-word last line                                                                          | `lastWords: true`             |
| Dashes               | `1990-2000` → `1990–2000`                                                                      | `dashes: true`                |

`{ preset: "typographic" }` turns every opt-in rule on.

For a quote inside a quote, Icelandic uses `„…“` again (Ritreglur §28.1), so
type it that way.

Standard abbreviations (`t.d.`, `o.s.frv.`) need no help, because they contain
no spaces and so never break across lines.

`hyphenate()`, `typeset()` and the React components turn their input into NFC
first, so a decomposed `á` (`a` plus a combining accent) still hyphenates and
typesets. The text that comes back is NFC. Apart from that, `typeset()` only
swaps characters one for one.

Both functions leave URLs, email addresses and domains alone, and running
them twice gives the same result as running them once.

The invisible characters have names, so you do not have to paste them into
source code: `SOFT_HYPHEN` (U+00AD), `NO_BREAK_SPACE` (U+00A0) and
`NON_BREAKING_HYPHEN` (U+2011).

#### Text in pieces: `processSegments`

```ts
import { processSegments } from "skiptingar";

processSegments(["Hraðbrautar", "framkvæmdir"], { hyphenate: {}, typeset: {} });
// ["Hrað­braut­ar­", "fram­kvæmdir"]
```

This is what `<Hyphenate>` runs on each run of text. Give it the text pieces
of one run (for example the text nodes of a paragraph split by `<em>`). It puts
each piece in NFC, removes soft hyphens, typesets across the pieces, then
hyphenates the joined text and cuts the breaks back into the pieces. So a word
split by markup breaks like the whole word, and a web address split by markup
is still found. A break on the border between two pieces goes at the end of the
earlier piece. It returns one string for each piece. Pass `false`, or leave out
`hyphenate` or `typeset`, to skip that step. `resolveTypeset(true | false |
options)` turns the `typeset` prop of the components into these options.
`breakOffsets(text, options)` is the lower level: the offsets where
`hyphenate()` would insert a break.

#### One word: `analyzeWord`

```ts
import { analyzeWord } from "skiptingar";

analyzeWord("vítamín", { rules: "ritreglur" });
// { breaks: [4], joints: [4] }
```

`breaks` is what `hyphenateWord()` returns in body mode: every break the word
allows, as "after N letters". `joints` is where heading mode prefers to break:
the `=` joints of a listed word, or the `NAME_ENDINGS` joint. It is always a
subset of `breaks`. Both obey `leftMin` and `rightMin`.

### 2. React Server Components

```tsx
import { Hyphenate } from "skiptingar/react";

<Hyphenate mode="heading">
  <h1>
    Sveitarstjórnarkosningar á <em>landsbyggðinni</em>
  </h1>
</Hyphenate>;
```

`<Hyphenate>` walks the JSX you give it and changes only text. It hyphenates
and typesets (pass `typeset={false}` to skip typesetting). Quotes pair across
inline elements, and a word split by inline markup (`hest<span>arnir</span>`)
is hyphenated as one word. It skips `code`, `pre`, `kbd`, `samp`, `var`, `svg`,
`math`, and anything marked `translate="no"` or `data-skiptingar="off"`. The
`lang` and `translate` props count on HTML elements only, never on your own
components. `<Typeset>` does the typesetting only.

Both components rebuild their children with `createElement`, so React's
missing-key warning for a list inside them is not shown. Add the keys yourself.

It can't see inside components. Text you pass as children is reached; text a
component renders on its own is not. For that, call `hyphenate()` in the server
parent and pass the string down as a prop.

### 3. The browser, when you must

```tsx
"use client";
import { useHyphenate } from "skiptingar/client";

function Caption({ text }: { text: string }) {
  return <p>{useHyphenate(text)}</p>;
}
```

Use this for text that only exists in the browser, like something a user
types. The patterns load lazily the first time, about 54 kB compressed (brotli); the
rest of the client entry is about 8 kB. Until then the hook returns the text as
it is, and so does it if the chunk fails to load. The next component that
mounts tries the load again. A component that mounts after the load gets the
processed text on its first render. Anything you can do on the server, do on
the server.

For the core itself, `useSkiptingar()` returns it once it has loaded and `null`
before that, on the server and if the load fails. Mounting starts the load.

```tsx
"use client";
import { useSkiptingar } from "skiptingar/client";

function Breaks({ word }: { word: string }) {
  const core = useSkiptingar();
  return <p>{core ? core.analyzeWord(word).breaks.join(", ") : word}</p>;
}
```

The client entry also re-exports `SOFT_HYPHEN`, `NO_BREAK_SPACE` and
`NON_BREAKING_HYPHEN`, so a client component can name them without importing
the core and its pattern data.

`<CleanCopy />` mounts once per page and takes soft hyphens and no-break
spaces out of copied text, so pasted text and search stay clean.

## Browser support

The typeset rules use regular expression lookbehind, which needs Safari 16.4
or newer (Chrome 62 and Firefox 78 are older than that). The client entry
needs it too, because it runs the same code. Server-side use has no browser
limit.

## CSS to pair it with

```css
.prose {
  text-wrap: pretty;
} /* fewer bad breaks and short last lines */
h1,
h2 {
  text-wrap: balance;
}
* {
  hyphens: manual;
} /* the default: use our breaks, add none */
```

Set `lang="is"`; browsers use it for language rules. Screen readers differ on
soft hyphens (NVDA has been reported to announce them), so test with yours.

## Exceptions

`data/exceptions.txt` is one word per line. `-` is a break, `=` is a compound
joint, which heading mode prefers:

```
þjóð=fé-lags=um=ræða
```

A listed word replaces the pattern result. The same file is the test corpus.
Found a wrong break? Add the line, run `bun run generate:skiptingar`, open a PR.
The list is CC0, so other Icelandic tools can take it as it is.

## Icelandic on the platform

Some things the browser does for Icelandic and some it does not. These notes
say what to use instead of writing it yourself.

- **Chrome and Edge on the desktop ship no Icelandic `Intl` data.** Tested in
  Chrome 154, macOS: `Intl.DateTimeFormat.supportedLocalesOf(["is"])` is `[]`,
  dates render in English, and `Intl.Collator("is")` sorts þ after z. Node,
  Bun, Firefox and Safari are fine. Format dates and numbers on the server, and
  for client-side sorting use [cldr-is](https://github.com/gudrodur/cldr-is).
- **Plurals:** `Intl.PluralRules("is")` works everywhere. It treats 21, 31 and
  101 as singular (`one`), as Icelandic does.
- **Slugs:** [`slugify`](https://www.npmjs.com/package/slugify) already maps
  þ→th, ð→d, æ→ae and ö→o, the ÍST 130 table.
- **Names in a sentence** (`til Jóns`, `Jóni`) need declension. Use
  [beygla](https://www.npmjs.com/package/beygla).
- **Kennitala:** format it (`typeset()` keeps `010190-2939` on one line), but do
  not validate the check digit. Þjóðskrá stopped using it for new numbers on
  18 February 2026. See
  [kennitölur án vartölu](https://www.skra.is/folk/eg-i-thjodskra/um-kennitolur/kennitolur-an-vartolu/).
- **Phone numbers:** `555-1234` and `555 1234` are kept together by `typeset()`.
  Chrome otherwise breaks after the hyphen (tested in Chrome 154, macOS).

## Credits

The hyphenation patterns are the 2020 Icelandic hyphenation data from the
Árni Magnússon Institute for Icelandic Studies (Kristján Rúnarsson), CC BY 4.0,
[icelandic-lt/hyphenation-is](https://github.com/icelandic-lt/hyphenation-is).
They fix compound joints that the older TeX patterns get wrong
(`þjóð-fé-lags-um-ræða`, not `þjóð-fé-lagsum-ræða`).

The Ritreglur rules for one-letter breaks follow
[skiptir](https://github.com/sveinbjornt/skiptir), the Python package.

## License

Code: MIT. Exception list: CC0. Patterns: CC BY 4.0. See `NOTICE`.
