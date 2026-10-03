# skiptingar

Icelandic text, set well.

Letter patterns, better breaks and locale details, all on the server. Pair
them with CSS `text-wrap`. The browser runs no hyphenation code, and copied
text comes out clean.

The page, with a live editor and every rule shown: [skiptingar.geir.studio](https://skiptingar.geir.studio)

```
Vaðla·heiðar·vega·vinnu·verk·færa·geymslu·skúr
Hann sagði „Verð 1.000⍽kr. frá 30.⍽september“
```

`·` is a soft hyphen (invisible until a line breaks there), `⍽` a no-break space.

## What it fixes

Browsers mostly can't help with Icelandic. Only Firefox ships an Icelandic
hyphenation dictionary; Chrome, Edge and Safari have none on any system (MDN
browser-compat-data, `hyphens.language_icelandic`). So:

1. **A long word runs past the measure.** `Hrafnafjarðarbyggð` overflows a
   narrow column or a heading at phone width. Skiptingar breaks it.
2. **A unit drops to a line of its own.** `1.000` ends one line and `kr.`
   starts the next. Skiptingar keeps them together.
3. **Straight quotes stay straight.** Skiptingar sets Icelandic „quotes“.
4. **A hyphen stands in for a dash.** `1990-2010` becomes `1990–2010`.

## Install

```sh
npm install skiptingar
```

On npm, with provenance. The API may still change before 1.0. It is ESM only
and has no runtime dependencies. Only `skiptingar/react` and
`skiptingar/client` need React 18 or newer (tested with React 19). On the
server you need Node 18 or newer.

## A first page

```tsx
// app/page.tsx
import { Hyphenate } from "skiptingar/react";
import { CleanCopy } from "skiptingar/client";

export default function Page() {
  return (
    <main lang="is">
      <CleanCopy />
      <Hyphenate>
        <h1 className="text-balance">Sveitarstjórnarkosningar á landsbyggðinni</h1>
        <p className="text-pretty">Verð 1.000 kr. frá 30. september.</p>
      </Hyphenate>
    </main>
  );
}
```

Wrap the text in `<Hyphenate>` where the page renders on the server. It adds
all three layers. Pass `localeDetails={false}` to leave out the locale details.
`text-balance` and `text-pretty` are Tailwind's names for CSS `text-wrap`.
Add `<CleanCopy />` once, so copied text has no soft hyphens.

## How it works

Three layers, all on the server and all on by default:

1. **Letter patterns.** The 2020 patterns from the Árni Magnússon Institute,
   with the minimums of the official spelling rules (Ritreglur §33). They say
   where a word may break, and the server puts a soft hyphen there. This is
   Franklin Liang's algorithm from 1983, the one TeX uses, so no word list is
   needed and new compounds break too.
2. **Better breaks.** They keep only the legal breaks that read well. They
   drop 29% of the breaks Ritreglur allows (122 032 of 416 492 across the
   218 308 words the 2020 patterns were trained on). They are new and under
   development, so they may change. `betterBreaks: false` turns them off.
3. **Locale details.** No-break spaces keep a number with its unit
   (`1.000 kr.`), a day with its month (`30. september`), an ordinal with its
   word (`1. sæti`), an abbreviation with its number (`bls. 12`) and a title
   with its name (`dr. Jón`). A no-break hyphen keeps kennitölur and phone
   numbers whole (`011390-2939`, `588-5522`). Straight quotes become Icelandic
   `„…“`, and a hyphen in a range becomes an en dash (`1990–2000`). This is
   `localeDetails()` in the API; `hyphenate()` alone does not do it. It is on
   by default in `<Hyphenate>` (`localeDetails={false}` turns it off) and in
   the client hooks and the endpoint (`localeDetails: false`). Eight rules are
   on by default and two, `singleLetter` and `lastWords`, are off. Each one can
   be turned on or off on its own; see
   [Where Icelandic doesn't break](#where-icelandic-doesnt-break).

Then **CSS `text-wrap`**, which I recommend. It is your CSS, not package
code. Soft hyphens only say where a line may break, and the browser still picks
the break on each line. `text-wrap: pretty` for body text and `balance` for
titles help it choose. See [CSS to pair it with](#css-to-pair-it-with).

Because the work is done on the server, a server-rendered page gets plain
HTML: 0 kB of JavaScript for any layer, the same break points in every
browser, and no flash while text is processed. Which break a line uses is
still up to the browser and the font.

### Where Icelandic breaks

The letter patterns give every break the spelling rules allow: in words of 4
letters or more, with at least 1 letter before a break and 2 after. The 1 and
the 2 come from the data: the patterns set `LEFTHYPHENMIN 1` and
`RIGHTHYPHENMIN 2`. Better breaks then drop the ones that read badly:

| Rule | Ritreglur only | Better breaks (default) |
| --- | --- | --- |
| Room: body words need 6+ letters, 2 before a break and 3 after | `ó·lán` | `ólán` |
| Linking syllable (`ar`, `ur`, `is`, `ir`): the break before it goes, so a genitive stays with its stem | `sveit·ar·stjórn·ar·kosn·ing·um` | `sveitar·stjórnar·kosn·ingum` |
| Foreign names with c, q or w stay whole | `Ic·elandair` | `Icelandair` |

The patterns know syllables, not compounds, so they may break inside a
compound's parts, and they miss some legal breaks (`ástríða`, `vefslóð`). Your
own `dictionary` can add those (see below).

### Where Icelandic doesn't break

Good line breaking also means knowing where not to break. The locale details
put a no-break space (or a no-break hyphen, U+2011) where a break would read
badly:

| Rule | Example | Option |
| --- | --- | --- |
| Number and unit | `1.000 kr.`, `5 km`, `20 °C` | `units`, on |
| Day, month and year | `30. september`, `sept. 2027`, `ág. 2026` | `dates`, on |
| Ordinal | `1. sæti`, `3. grein` | `ordinals`, on |
| Abbreviation and number | `nr. 5`, `bls. 12`, `kl. 14.30`, `kt. 011390-2939` | `prefixes`, on |
| Kennitala and phone | `011390-2939`, `588-5522`, `+354 588 5522` never split | `numbers`, on |
| Title and initial | `dr. Jón`, `Jón G. Sigurðsson` | `titles`, on |
| Quotes | `"orð"` → `„orð“`; a paired `'orð'` → `‚orð‘`, the mark for a word's meaning (Ritreglur §28.2) | `quotes`, on |
| Dashes | `1990-2000` → `1990–2000`, `18.-21.`, `kl. 14.30-16.00`; a spaced dash stays on its line | `dashes`, on |
| One-letter words | `á`, `í` never end a line | `singleLetter`, off |
| Last two words | no one-word last line | `lastWords`, off |

`singleLetter` and `lastWords` are off by default. Turn each on by name:
`localeDetails(text, { singleLetter: true, lastWords: true })`, or
`<Hyphenate localeDetails={{ singleLetter: true }}>`. Prefer `text-wrap: pretty`
to `lastWords` where the browser supports it.

For a quote inside a quote, Icelandic uses `„…“` again (Ritreglur §28.1), so
type it that way. Standard abbreviations (`t.d.`, `o.s.frv.`) need no help:
they have no spaces, so they never break across lines.

### Safety

The layers never touch URLs, email addresses or domains, and running any of
them twice gives the same result. Input becomes NFC first, so decomposed
letters, like those in macOS file names, still hyphenate and add the locale details.

## Entry points

Import only what the page needs. The first two run on the server and send
nothing to the browser.

| Entry | Where | What |
| --- | --- | --- |
| `skiptingar` | Anywhere: Node, the edge, a build step | `hyphenate()`, `localeDetails()`, `processSegments()` and `analyzeWord()`: plain functions on strings, and `handleSkiptingarRequest()`, the endpoint for the client |
| `skiptingar/react` | React Server Components | `<Hyphenate>` (all three layers) and `<LocaleDetails>` (locale details only) |
| `skiptingar/client` | The browser | `useHyphenate()` and its sibling hooks for text that exists only in the browser, `configureSkiptingar()` to use a server endpoint, `<CleanCopy />`, and the Icelandic word lists for `settle-rag` |

## API

### Plain functions: `skiptingar`

```ts
import { hyphenate, localeDetails } from "skiptingar";

hyphenate("Hraðbrautarframkvæmdir á landsbyggðinni");
// "Hrað­brautar­fram­kvæmdir á lands­byggð­inni"

localeDetails('Verð 1.000 kr. frá 30. september, sagði "hann"');
// no-break spaces in "1.000 kr." and "30. september", quotes become „hann“
```

`hyphenate(text, options)` puts in the soft hyphens. It never adds the locale details.

| Option | Default | |
| --- | --- | --- |
| `betterBreaks` | `true` | better breaks; `false` gives the Ritreglur minimums |
| `minWordLength`, `leftMin`, `rightMin` | from `betterBreaks` | override one number, keep the rest (`4`, `1`, `2` with `betterBreaks: false`) |
| `hyphenChar` | `"\u00AD"` (soft hyphen) | use `"-"` to see the breaks |
| `dictionary` | none | your own words, e.g. `["forn=aldar=frægð"]` |

A line in a `dictionary` is one lowercase word where `-` is a break and `=` is
a compound joint, which is a break too:

```
þjóð=fé-lags=um=ræða
```

A word in your `dictionary` replaces the pattern result, and a malformed line
throws.

`localeDetails(text, options)` adds the locale details and never hyphenates. It
swaps characters one for one (after turning the text into NFC), with one
difference: the `dashes` rule also adds an invisible word joiner (U+2060)
after the en dash of a range, so `1990-2000` becomes `1990–⁠2000`, one
character longer. Every rule in the table above has an option of its own.

The invisible characters have names, so you do not have to paste them into
source code: `SOFT_HYPHEN` (U+00AD), `NO_BREAK_SPACE` (U+00A0) and
`NON_BREAKING_HYPHEN` (U+2011).

#### Text in pieces: `processSegments`

```ts
import { processSegments } from "skiptingar";

processSegments(["Hraðbrautar", "framkvæmdir"], { hyphenate: {}, localeDetails: {} });
// ["Hrað­brautar­", "fram­kvæmdir"]
```

This is what `<Hyphenate>` runs on each run of text. Give it the text pieces
of one run (for example the text nodes of a paragraph split by `<em>`). It puts
each piece in NFC, removes soft hyphens, adds the locale details across the
pieces, then hyphenates the joined text and cuts the breaks back into the
pieces. So a word split by markup breaks like the whole word, and a web address
split by markup is still found. A break on the border between two pieces goes at the end of the
earlier piece. It returns one string for each piece. Pass `false`, or leave out
`hyphenate` or `localeDetails`, to skip that step: unlike the components, it
adds the locale details only when you give it `localeDetails`.
`resolveLocaleDetails(true | false | options)` turns the `localeDetails` prop
of the components into these options; left out, it is on (`{}`).
`breakOffsets(text, options)` is the lower level: the offsets where
`hyphenate()` would insert a break.

#### One word: `analyzeWord`

```ts
import { analyzeWord } from "skiptingar";

analyzeWord("hraðbraut");
// { breaks: [4], joints: [] }
```

`breaks` is what `hyphenateWord()` returns: every break the word allows, as
"after N letters". `joints` are the compound joints the word is known to have,
which the patterns do not give: the `=` marks of a word in your `dictionary`
(`{ dictionary: ["hrað=braut"] }` gives `joints: [4]`). It is always a subset
of `breaks`. Both obey `leftMin` and `rightMin`.

### React Server Components: `skiptingar/react`

```tsx
import { Hyphenate } from "skiptingar/react";

<Hyphenate>
  <h1>
    Sveitarstjórnarkosningar á <em>landsbyggðinni</em>
  </h1>
</Hyphenate>;
```

`<Hyphenate>` walks the JSX you give it and changes only text. It hyphenates,
and, unless you pass `localeDetails={false}`, adds the locale details;
`localeDetails={{ … }}` sets their rules. `<LocaleDetails>` adds the locale
details only. `<Hyphenate>` takes the `hyphenate()` options except
`hyphenChar`, plus `localeDetails` and `lang`. Quotes pair across inline
elements, and a word split by inline markup
(`hest<span>arnir</span>`) is hyphenated as one word.

It skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`,
`svg`, `math`, and anything marked `translate="no"` or
`data-skiptingar="off"`. The `lang` and `translate` props count on HTML
elements only, never on your own components. Text under a `lang` other than
Icelandic is left alone, and a nested `lang="is"` turns the layers back on. A
`lang` outside `<Hyphenate>` can't be seen, so pass the `lang` prop when the
whole tree is in another language.

Block elements end a run of text, so rules never work across two paragraphs.
A component counts as inline when it sits among text or inline elements
(`"<Link>orð</Link>"`) and as a block otherwise (`<Card>…</Card><Card>…</Card>`);
`data-skiptingar="inline"` or `"block"` on it decides instead.

Both components rebuild their children with `createElement`, so React's
missing-key warning for a list inside them is not shown. Add the keys yourself.

They can't see inside components. Text you pass as children is reached; text a
component renders on its own is not. For that, call `hyphenate()` in the server
parent and pass the string down as a prop.

### The browser: `skiptingar/client`

```tsx
"use client";
import { useHyphenate } from "skiptingar/client";

function Caption({ text }: { text: string }) {
  return <p>{useHyphenate(text)}</p>;
}
```

Use this for text that exists only in the browser, like something a user
types. It adds the locale details too, unless you pass `localeDetails: false`. The
patterns load lazily the first time: <!-- size:patterns -->49.7 kB<!-- /size --> brotli for the core and its
patterns, while the client entry itself is <!-- size:client -->3.1 kB<!-- /size --> brotli. Until then the hook
returns the text as it is, and so it does if the chunk fails to load. The next
component that mounts tries the load again. A component that mounts after the
load gets the processed text on its first render. Anything you can do on the
server, do on the server.

#### Hyphenate browser text on your server

A page that has a server can skip the patterns: mount the handler on a POST
route and point the client at it once. The browser then sends the text and
gets it back hyphenated, for <!-- size:endpoint -->2.2 kB<!-- /size --> brotli.

```ts
// app/api/skiptingar/route.ts
import { handleSkiptingarRequest } from "skiptingar";
export const POST = (request: Request) => handleSkiptingarRequest(request);
```

```tsx
"use client";
import { configureSkiptingar } from "skiptingar/client";
configureSkiptingar({ endpoint: "/api/skiptingar" });
```

`useHyphenate`, `useHyphenateAll`, `useHyphenateResult` (the text and whether
it is processed yet) and `useAnalyzeWord` then ask the endpoint. Requests in
one tick go out as one, answers are cached, and if the endpoint fails the
hooks load the patterns instead. The handler uses the standard `Request` and
`Response`, so it also runs in Bun, Deno or a worker. It limits a request to
200 jobs and 50 000 characters and a word to 200 characters (web addresses
excepted). It refuses unknown options, a large body (413) and a request that
is not `application/json` (415). The lines of a `dictionary` count as
characters.

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

#### Clean copied text: `<CleanCopy />`

`<CleanCopy />` mounts once per page and cleans copied text: soft hyphens are
removed, no-break spaces become spaces and U+2011 becomes a normal hyphen.
Icelandic quotes and dashes stay, because they are the right characters. It
doesn't change what find-in-page sees. On its own it is <!-- size:cleanCopy -->0.6 kB<!-- /size --> brotli.

### Icelandic data for settle-rag

`settle-rag` is a separate package for line breaking. It is not on npm yet. It
ships no language of its own, so Skiptingar exports the Icelandic one as three
plain objects:

- `SHORT_WORDS`: the words that read badly at the end of a line, like `og`,
  `að` and `með`.
- `LINKING_SYLLABLES`: the syllables that link a compound's parts, like
  `sveitar·stjórnar`.
- `RAG_LANGUAGE`: both lists and the locale, ready to pass as `language`.

```ts
RAG_LANGUAGE;
// { shortWords: SHORT_WORDS, linkingSyllables: LINKING_SYLLABLES, locale: "is" }
```

In a client component, import them from `skiptingar/client`, so the pattern
data stays out of the browser. On the server, import them from `skiptingar`.

```tsx
"use client";
import { RAG_LANGUAGE } from "skiptingar/client";
```

## What it costs a browser

| Job | Setup | Brotli |
| --- | --- | --- |
| Hyphenate Icelandic | Skiptingar on the server | 0 kB |
| | Skiptingar via your server (`useHyphenate` with an endpoint) | <!-- size:endpoint -->2.2 kB<!-- /size --> |
| | [hyphen](https://www.npmjs.com/package/hyphen)/is, the old TeX patterns | 12.9 kB |
| | [Hyphenopoly](https://mnater.github.io/Hyphenopoly/), the old TeX patterns as WebAssembly | 14.8 kB |
| | Skiptingar in the browser, for a page with no server to ask | <!-- size:browser -->52 kB<!-- /size --> |
| Locale details | Skiptingar on the server | 0 kB |
| | [Typeset.js](https://typeset.lllllllllllllllll.com/) in the browser, English rules | 29.7 kB |

The Skiptingar sizes come from `bun run size` in this repo. The other packages
were measured on 1 October 2026, each bundled with a minimal use, minified,
React left out. The 2020 patterns are larger than the old TeX ones because
they break better: they fix compound joints the TeX patterns get wrong
(`þjóð-fé-lags-um-ræða`, not `þjóð-fé-lagsum-ræða`).

## CSS to pair it with

```css
.prose {
  text-wrap: pretty;
} /* fewer short last lines; Safari 26+ also evens the edge */
h1,
h2 {
  text-wrap: balance;
}
* {
  hyphens: manual;
} /* the default: use the soft hyphens, add none */
```

`text-wrap: pretty` stops a paragraph from ending on one short word (Chrome
117+, Safari 26+; Firefox falls back to normal wrapping). `balance` evens out
the lines of a title. Both are optional: the soft hyphens work the same with
or without them.

Set `lang="is"`; browsers use it for language rules and screen readers for
the voice. Screen readers differ on soft hyphens (NVDA has been reported to
announce them), so test with yours.

## Support

- **Browsers.** The locale details use regular expression lookbehind, so a
  browser needs Safari 16.4 or newer (Chrome 62 and Firefox 78 support it
  earlier). The client entry has the same limit. Server-side use has no
  browser limit.
- **Fonts.** Check that your font has U+00A0, the no-break space, and U+2011,
  the no-break hyphen `localeDetails()` puts in kennitala and phone numbers. Many
  fonts have no U+2011 (ABC Areal and Bespoke Serif among them), and the
  browser then draws that hyphen from a fallback font.

## Icelandic on the platform

The browser does some things for Icelandic and not others. These notes say
what to use instead of writing it yourself.

- **Dates and numbers.** Chrome and Edge on the desktop ship no Icelandic
  `Intl` data. Tested in Chrome 154, macOS:
  `Intl.DateTimeFormat.supportedLocalesOf(["is"])` is `[]`, dates render in
  English, and `Intl.Collator("is")` sorts in the root order: æ next to a, ö
  with o, and á, é and í as plain a, e and i. Node, Bun, Firefox and Safari
  are fine. Format dates and numbers on the server, and for client-side
  sorting use [cldr-is](https://github.com/gudrodur/cldr-is) (on GitHub, not
  on npm yet).
- **Plurals.** `Intl.PluralRules("is")` works everywhere. It treats 21, 31 and
  101 as singular (`one`), as Icelandic does.
- **Slugs.** [`slugify`](https://www.npmjs.com/package/slugify) already maps
  þ→th, ð→d, æ→ae and ö→o, the ÍST 130 table.
- **Names in a sentence** (`til Jóns`, `Jóni`) need declension. Use
  [beygla](https://www.npmjs.com/package/beygla).
- **Kennitala.** Format it (`localeDetails()` keeps `011390-2939` on one line), but
  do not validate the check digit. Þjóðskrá stopped using it for new numbers on
  18 February 2026. See
  [kennitölur án vartölu](https://www.skra.is/folk/eg-i-thjodskra/um-kennitolur/kennitolur-an-vartolu/).
- **Phone numbers.** `588-5522` and `588 5522` stay together with the locale
  details. Browsers otherwise break after the hyphen.

## Works well with

- **[Hyphenopoly](https://mnater.github.io/Hyphenopoly/)**, hyphenation for
  many languages. Skiptingar leaves text under another `lang` alone, so the two
  can share a page.
- **[Typeset](https://typeset.lllllllllllllllll.com/)**, a server-side HTML
  pre-processor for hanging punctuation, optical margin alignment and small
  caps. Turn off its `quotes` and `hyphenate` and let Skiptingar do those for
  Icelandic.
- **[`hanging-punctuation`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/hanging-punctuation)**
  hangs an opening „ outside the text's edge. Few browsers support it, and the
  rest ignore it, so it is safe to add.

## Planned

Nothing here is promised.

- **Markdown and HTML.** A rehype plugin and a small CLI that hyphenate and
  add the locale details, for sites that are not built with React.
- **More opinionated breaks.** The first version follows the official
  spelling rules and adds better breaks. Later: a list of words with corrected
  breaks, a skip for all-caps acronyms such as UNESCO, and a heading mode that
  breaks a title where its compounds join.
- **Smaller patterns, maybe.** A smaller pattern set trained from the same
  word list, for pages that must hyphenate in the browser without a server.
  Only if size matters.

## Credits

The hyphenation patterns are the 2020 Icelandic hyphenation data © Kristján
Rúnarsson, Árni Magnússon Institute for Icelandic Studies, built on version 1
(1985) by Baldur Jónsson and Magnús Gíslason. CC BY 4.0,
[icelandic-lt/hyphenation-is](https://github.com/icelandic-lt/hyphenation-is).

The Ritreglur rules for breaking after one letter follow
[skiptir](https://github.com/sveinbjornt/skiptir), the Python package.

## License

Code: MIT. Word data: CC0. Patterns: CC BY 4.0, so keep their credit. See
`NOTICE`.
