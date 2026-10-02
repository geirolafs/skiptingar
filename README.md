# skiptingar

Icelandic text set the way a typesetter would: hyphenation, and numbers,
dates and names kept together.

Version 1 is three layers, and they are the defaults:

1. **Hyphenation.** The 2020 letter patterns from the Árni Magnússon
   Institute, put into the text as soft hyphens on the server. The new
   **typographic rules** are on by default: they drop legal breaks that read
   badly (see below). They are experimental and may change; pass
   `rules: "ritreglur"` for the official Ritreglur minimums alone.
2. **Typeset.** No-break spaces and Icelandic quotes, also on the server
   (including en dashes in ranges). On by default in
   the components, the hooks and the handler; pass `typeset={false}` (or
   `typeset: false`) to hyphenate only.
3. **Wrapping.** CSS `text-wrap: pretty` for body text and `balance` for
   titles. This is CSS you add, not part of the package, and you can leave it
   out (see "CSS to pair it with").

Because the work is done on the server, the browser runs no hyphenation or
typeset code (0 kB), every browser gets the same places to break, and
`<CleanCopy />` puts clean text on the clipboard.

Long Icelandic compounds overflow narrow columns and headings, and browsers
mostly can't help. Only Firefox ships an Icelandic hyphenation dictionary;
Chrome, Edge and Safari have none on any system (MDN browser-compat-data,
`hyphens.language_icelandic`). `skiptingar` puts soft hyphens into the text
itself, on the server, so every browser gets the same places to break, and
hyphenating ships no JavaScript. Which of those places a line uses is still up
to the browser and the font. CSS `text-wrap` (the third v1 layer) helps it
choose. Settling the rag (below) is a separate, later add-on.

```
Vaðla·heið·ar·vega·vinnu·verk·færa·geymslu·skúr
Hann sagði „Verð 1.000⍽kr. frá 30.⍽september“
```

`·` is a soft hyphen (invisible until a line breaks there), `⍽` a no-break space.

## Status

Not on npm yet. It lives in a website repo while the API settles; the
`package.json` is marked private so it can't be published by accident. To
try it in another project, build it (`bun run build` in this folder writes
`dist/` with the three entry points and their types) and depend on the
folder. It has no runtime dependencies. React 18 or newer is only needed for
the React and client entry points (they use no React 19-only API; the tests
run on React 19). `bun run size` prints what each entry costs a
browser, and `bun run bench` how fast the core runs.

## Three ways to use it

### 1. Plain functions, anywhere

```ts
import { hyphenate, typeset } from "skiptingar";

hyphenate("Hraðbrautarframkvæmdir á landsbyggðinni");
// "Hrað­brautar­fram­kvæmdir á lands­byggð­inni"

typeset('Verð 1.000 kr. frá 30. september, sagði "hann"');
// no-break spaces in "1.000 kr." and "30. september", quotes become „hann“
```

`hyphenate(text, options)`

| Option                                 | Default         |                                                                               |
| -------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `rules`                                | `"typographic"` | new, experimental: drops breaks that read badly. `"ritreglur"` turns it off   |
| `minWordLength`, `leftMin`, `rightMin` | from `rules`    | override one number, keep the rest (`4`, `1`, `2` with `"ritreglur"`)         |
| `hyphenChar`                           | `"­"`           | use `"-"` to see the breaks                                                   |
| `dictionary`                           | none            | your own words, e.g. `["forn=aldar=frægð"]` (format below)                    |

The official spelling rules (Ritreglur §33) allow a break in words of 4 letters
or more, with at least 1 letter before it and 2 after. The 1 and the 2 come
from the data: the Árni Magnússon patterns set `LEFTHYPHENMIN 1` and
`RIGHTHYPHENMIN 2`. The 4-letter minimum word length is skiptingar's own
choice. That is `rules: "ritreglur"`.

The default, `rules: "typographic"`, is new and under development, and it may
give odd results. Turn it off with `rules: "ritreglur"` if it does. It drops
legal breaks that read badly:

| Rule                      | Ritreglur                    | Typographic (default)     |
| ------------------------- | ---------------------------- | ------------------------- |
| Room: body words need 6+ letters, 2 before and 3 after a break | `ó·lán` | `ólán` |
| Linking syllable (`ar`, `ur`, `is`, `ir`): no break before it | `sveit·ar·stjórn·ar·kosn·ing·um` | `sveitar·stjórnar·kosn·ingum` |
| Foreign names with c, q or w stay whole | `Ic·elandair`  | `Icelandair`              |

Not part of v1, and off or absent by default: a list of corrected words, a
skip for all-caps acronyms and a heading mode that breaks a title at its
compound joints. Their options (`exceptions`, `skipAcronyms`,
`mode: "heading"`) are still in the code, and they may come in a later
version.

The patterns know syllables, not compounds, so they may break inside a
compound's parts, and they miss some legal breaks (`ástríða`, `vefslóð`). Your
own `dictionary` can add those. A line in it is one lowercase word where `-`
is a break and `=` is a compound joint, which is a break too:

```
þjóð=fé-lags=um=ræða
```

A word in your `dictionary` replaces the pattern result, and a malformed line
throws.

Typeset is on by default where it is a switch. `hyphenate()` never typesets
(it has no `typeset` option), and `typeset()` never hyphenates. The React
components (`<Hyphenate>`), the client hooks and the server handler hyphenate
and typeset unless you pass `typeset={false}` (or `typeset: false`);
`typeset: true` or an options object sets the rules. `processSegments` does
what you ask: it typesets only when you give it `typeset`. `<Typeset>` and
`typeset()` typeset, because that is all they do.

`typeset(text, options)` swaps characters one for one (after turning the text
into NFC), with one difference: the `dashes` rule also adds an invisible word
joiner (U+2060) after the en dash of a range, so `1990-2000` becomes
`1990–⁠2000`, one character longer. Every rule has an option of its own:

| Rule                 | Example                                                                                        | Option              |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| Number and unit      | `1.000 kr.`, `5 km`, `20 °C`                                                                   | `units`, on         |
| Month and year       | `sept. 2027`, `ág. 2026`                                                                       | `dates`, on         |
| Ordinal              | `30. september`, `1. sæti`                                                                     | `ordinals`, on      |
| Abbreviation, number | `nr. 5`, `bls. 12`, `kl. 14.30`, `kt. 011390-2939`                                             | `prefixes`, on      |
| Kennitala, phone     | `011390-2939`, `588-5522`, `+354 588 5522` never split                                         | `numbers`, on       |
| Title, initial       | `dr. Jón`, `Jón G. Sigurðsson`                                                                 | `titles`, on        |
| Quotes               | `"orð"` → `„orð“`; a paired `'orð'` → `‚orð‘`, the mark for a word's meaning (Ritreglur §28.2) | `quotes`, on        |
| One-letter words     | `á`, `í` never end a line                                                                      | `singleLetter`, off |
| Last two words       | no one-word last line                                                                          | `lastWords`, off    |
| Dashes               | `1990-2000` → `1990–2000`, `18.-21.`, `kl. 14.30-16.00`; a spaced dash stays on its line       | `dashes`, on        |

`{ preset: "typographic" }` also turns on the two rules that are off by
default, `singleLetter` and `lastWords`.

For a quote inside a quote, Icelandic uses `„…“` again (Ritreglur §28.1), so
type it that way.

Standard abbreviations (`t.d.`, `o.s.frv.`) need no help, because they contain
no spaces and so never break across lines.

`hyphenate()`, `typeset()` and the React components turn their input into NFC
first, so a decomposed `á` (`a` plus a combining accent) still hyphenates and
typesets. The text that comes back is NFC. Apart from that, `typeset()` swaps
characters one for one, apart from the word joiner that `dashes` adds.

Both functions leave URLs, email addresses and domains alone, and running
them twice gives the same result as running them once.

The invisible characters have names, so you do not have to paste them into
source code: `SOFT_HYPHEN` (U+00AD), `NO_BREAK_SPACE` (U+00A0) and
`NON_BREAKING_HYPHEN` (U+2011).

#### Text in pieces: `processSegments`

```ts
import { processSegments } from "skiptingar";

processSegments(["Hraðbrautar", "framkvæmdir"], { hyphenate: {}, typeset: {} });
// ["Hrað­braut­ar­", "fram­kvæmd­ir"]
```

This is what `<Hyphenate>` runs on each run of text. Give it the text pieces
of one run (for example the text nodes of a paragraph split by `<em>`). It puts
each piece in NFC, removes soft hyphens, typesets across the pieces, then
hyphenates the joined text and cuts the breaks back into the pieces. So a word
split by markup breaks like the whole word, and a web address split by markup
is still found. A break on the border between two pieces goes at the end of the
earlier piece. It returns one string for each piece. Pass `false`, or leave out
`hyphenate` or `typeset`, to skip that step. `resolveTypeset(true | false |
options)` turns the `typeset` prop of the components into these options; left
out, it is on (`{}`).
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

### 2. React Server Components

```tsx
import { Hyphenate } from "skiptingar/react";

<Hyphenate>
  <h1>
    Sveitarstjórnarkosningar á <em>landsbyggðinni</em>
  </h1>
</Hyphenate>;
```

`<Hyphenate>` walks the JSX you give it and changes only text. It hyphenates,
and, unless you pass `typeset={false}`, typesets. Quotes pair across inline
elements, and a word split by inline markup (`hest<span>arnir</span>`)
is hyphenated as one word. It skips `code`, `pre`, `kbd`, `samp`, `var`,
`script`, `style`, `textarea`, `svg`, `math`, and anything marked
`translate="no"` or `data-skiptingar="off"`. The `lang` and `translate` props
count on HTML elements only, never on your own components. Text under a
`lang` other than Icelandic is left alone; a `lang` outside `<Hyphenate>`
can't be seen, so pass the `lang` prop when the whole tree is in another
language. `<Typeset>` does the typesetting only.

Block elements end a run of text, so rules never work across two paragraphs.
A component counts as inline when it sits among text or inline elements
(`"<Link>orð</Link>"`) and as a block otherwise (`<Card>…</Card><Card>…</Card>`);
`data-skiptingar="inline"` or `"block"` on it decides instead.

Both components rebuild their children with `createElement`, so React's
missing-key warning for a list inside them is not shown. Add the keys yourself.

It can't see inside components. Text you pass as children is reached; text a
component renders on its own is not. For that, call `hyphenate()` in the server
parent and pass the string down as a prop.

### 3. The browser: settled rag, and text that only exists there

```tsx
"use client";
import { useHyphenate } from "skiptingar/client";

function Caption({ text }: { text: string }) {
  return <p>{useHyphenate(text)}</p>;
}
```

Use this for text that only exists in the browser, like something a user
types. The patterns load lazily the first time, <!-- size:patterns -->49.8 kB<!-- /size --> brotli for the core
and its patterns; the full client entry is <!-- size:client -->7.9 kB<!-- /size --> brotli,
and Settle rag alone (`SettledText`) <!-- size:rag -->5.4 kB<!-- /size -->. Until then the
hook returns the text as it is, and so does it if the chunk fails to load. The
next component that mounts tries the load again. A component that mounts after
the load gets the processed text on its first render. Anything you can do on
the server, do on the server.

#### Settle the rag

Soft hyphens say where a line may break; the browser still breaks each line
at the last place that fits. Settling the rag chooses the breaks for the whole
paragraph the way a typesetter would (a Knuth–Plass search with a cost for a
ragged edge): lines that are full enough, no line jutting out past the one
above or leaving a hole, short words such as `og` and `í` kept off line ends
when that does not cost more elsewhere, few hyphens and no 3-letter pieces,
and a last line of one word or the tail of a broken one only when the edge is
better for it. It needs the real line widths, so it runs in the browser.

```tsx
"use client";
import { SettledText } from "skiptingar/client";

<SettledText as="p" text={hyphenatedOnTheServer} options={{ overhang: 0.5 }} />;
```

It forbids the breaks a greedy browser would otherwise take (a space becomes a
no-break space, a soft hyphen is removed) and checks the result in a hidden
copy; if the browser would not set it exactly, it changes nothing. It judges
again when the width changes and when fonts load, and keeps the element on
`text-wrap: wrap` meanwhile, since `pretty` and `balance` would move the breaks
again. Options (`RagOptions`): `balance: true` for titles (as few lines as
possible, made even, with short words at line ends, stacked hyphens and breaks
away from a joint costing more), `overhang` (in em at 16px, 0.5 is about one letter) lets
a line's last character go a little past the edge when that helps, `tighten`
(in em, 0.05 is a good size) lets a line take that much less space at each
word space, and `tightenLetters` (in em, 0.01) that much less at each
character on a line with too few spaces for that, and `tightenWeight` is what
tightening costs. Tightening is the typesetter's second cheat: it only
tightens, never loosens, and a line uses it only when it would not fit
otherwise and the paragraph is better for it. A line uses the overhang or
tightening, never both, and the overhang comes first. All three are 0 (off)
by default. The rest are the weights of each fault (`DEFAULT_RAG_OPTIONS`).

- `SettledText` renders it. `useSettledRag(ref, text, options)` gives the text,
  its overhangs and its tightened lines (`splitSettled` cuts them out to draw;
  `splitHangs` does it for overhangs alone), and
  `useRagPlan(ref, text, options)` the plan itself, for text split over
  several elements (`applyRag`). Pass `enabled: false` to turn it off.
- A span's `letter-spacing` replaces the one it inherits, so each overhang
  carries the value to set, the element's own tracking included
  (`Hang.letterSpacing`, and `letterSpacing` on its piece from `splitSettled`).
  Draw a hang with `piece.letterSpacing ?? -piece.hang` px. Without it, as from
  `bestBreaks`, that is `-hang`.
- Without React: `const stop = settle(element, text, options)`.
- `bestBreaks(text, metrics, options)` in the core is the search alone, given
  where each character starts; it needs no browser.

It measures the text as plain text in the element's own font, so inline
markup with other metrics is not modelled. It changes nothing for justified
or right-to-left text, an indented first line, preserved newlines or
`hyphens: auto`. The first judgement runs after hydration, so a
server-rendered paragraph can move slightly once.

#### Hyphenate browser text on your server

The hyphenation core and its patterns are <!-- size:patterns -->49.8 kB<!-- /size --> brotli. A page
that has a server can skip them:
mount the handler on a POST route and point the client at it once.

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
`Response`, so it also runs in Bun, Deno or a worker; it limits a request to
200 jobs and 50 000 characters, a word to 200 characters (web addresses
excepted), and refuses unknown options, a large body (413) and a request
that is not `application/json` (415). The lines of a `dictionary` count as
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

`<CleanCopy />` mounts once per page and cleans copied text: soft hyphens are
removed, no-break spaces become spaces and U+2011 becomes a normal hyphen, so
pasted text is clean. It doesn't change what find-in-page sees. On its own
it is <!-- size:cleanCopy -->0.6 kB<!-- /size --> brotli.

## Browser support

The typeset rules use regular expression lookbehind, which needs Safari 16.4
or newer (Chrome 62 and Firefox 78 are older than that). The client entry
needs it too, because it runs the same code. Server-side use has no browser
limit.

## CSS to pair it with

Wrapping is the third layer of v1, and it is your CSS, not package code. Add
`text-wrap: pretty` to body text and `text-wrap: balance` to titles. Why:
soft hyphens only say where a line may break, and the browser still picks the
break on each line. `pretty` keeps a paragraph from ending on one short word,
and `balance` evens out the lines of a title, so the breaks the package offers
get used well. The rules are optional: the soft hyphens work the same with or
without them.

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
} /* the default: use our breaks, add none */
```

Settled text sets its own `text-wrap: wrap` while settled; `pretty` and
`balance` are for text you don't settle.

Set `lang="is"`; browsers use it for language rules. Screen readers differ on
soft hyphens (NVDA has been reported to announce them), so test with yours.

Check that your font has U+2011, the non-breaking hyphen `typeset()` puts in
kennitala and phone numbers. Many don't (Geist and Bespoke Serif among them),
and the browser then draws that one hyphen from a fallback font.

## Icelandic on the platform

Some things the browser does for Icelandic and some it does not. These notes
say what to use instead of writing it yourself.

- **Chrome and Edge on the desktop ship no Icelandic `Intl` data.** Tested in
  Chrome 154, macOS: `Intl.DateTimeFormat.supportedLocalesOf(["is"])` is `[]`,
  dates render in English, and `Intl.Collator("is")` sorts in the root order:
  æ next to a, ö with o, and á, é and í as plain a, e and i. Node, Bun,
  Firefox and Safari are fine. Format dates and numbers on the server, and
  for client-side sorting use [cldr-is](https://github.com/gudrodur/cldr-is).
- **Plurals:** `Intl.PluralRules("is")` works everywhere. It treats 21, 31 and
  101 as singular (`one`), as Icelandic does.
- **Slugs:** [`slugify`](https://www.npmjs.com/package/slugify) already maps
  þ→th, ð→d, æ→ae and ö→o, the ÍST 130 table.
- **Names in a sentence** (`til Jóns`, `Jóni`) need declension. Use
  [beygla](https://www.npmjs.com/package/beygla).
- **Kennitala:** format it (`typeset()` keeps `011390-2939` on one line), but do
  not validate the check digit. Þjóðskrá stopped using it for new numbers on
  18 February 2026. See
  [kennitölur án vartölu](https://www.skra.is/folk/eg-i-thjodskra/um-kennitolur/kennitolur-an-vartolu/).
- **Phone numbers:** `588-5522` and `588 5522` are kept together by `typeset()`.
  Browsers otherwise break after the hyphen.

## Credits

The hyphenation patterns are the 2020 Icelandic hyphenation data from the
Árni Magnússon Institute for Icelandic Studies (Kristján Rúnarsson), CC BY 4.0,
[icelandic-lt/hyphenation-is](https://github.com/icelandic-lt/hyphenation-is).
They fix compound joints that the older TeX patterns get wrong
(`þjóð-fé-lags-um-ræða`, not `þjóð-fé-lagsum-ræða`).

The Ritreglur rules for one-letter breaks follow
[skiptir](https://github.com/sveinbjornt/skiptir), the Python package.

## License

Code: MIT. Word data: CC0. Patterns: CC BY 4.0. See `NOTICE`.
