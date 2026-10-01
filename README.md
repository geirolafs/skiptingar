# skiptingar

Icelandic text set the way a typesetter would: hyphenation, a calm ragged
edge, titles that break at the right joint, and numbers, dates and names kept
together.

Long Icelandic compounds overflow narrow columns and headings, and browsers
mostly can't help. Only Firefox ships an Icelandic hyphenation dictionary;
Chrome, Edge and Safari have none on any system (MDN browser-compat-data,
`hyphens.language_icelandic`). `skiptingar` puts soft hyphens into the text
itself, on the server, so every browser gets the same places to break, and
hyphenating ships no JavaScript. Which of those places a line uses is still up
to the browser and the font, unless you settle the rag (layer 3).

```
Vaðla·heiðar·vega·vinnu·verk·færa·geymslu·skúr
Hann sagði „Verð 1.000⍽kr. frá 30.⍽september“
```

`·` is a soft hyphen (invisible until a line breaks there), `⍽` a no-break space.

## Status

Not on npm yet. It lives in a website repo while the API settles; the
`package.json` is marked private so it can't be published by accident. To
try it in another project, build it (`bun run build` in this folder writes
`dist/` with the three entry points and their types) and depend on the
folder. It has no runtime dependencies. React is only needed for the React
and client entry points. `bun run size` prints what each entry costs a
browser, and `bun run bench` how fast the core runs.

## Three layers

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
| `mode`                                 | `"body"`        | `"heading"` only breaks long words, and at compound joints when it finds them |
| `rules`                                | `"typographic"` | `"ritreglur"` allows every break the patterns allow, including `ó-lán`        |
| `joints`                               | `"only"`        | heading mode: `"prefer"` also keeps other breaks, for Settle rag to weigh     |
| `minWordLength`, `leftMin`, `rightMin` | from the preset | override one number, keep the rest                                            |
| `hyphenChar`                           | `"­"`           | use `"-"` to see the breaks                                                   |
| `exceptions`                           | `true`          | uses the exception list and the joints; `false` gives raw patterns            |
| `dictionary`                           | none            | your own words in the exception list's format, e.g. `["forn=aldar=frægð"]`    |
| `skipAcronyms`                         | `true`          | all-caps words of 4 to 8 letters (`UNESCO`, `NATO`) never break               |

The presets:

|               | body                                                   | heading                            |
| ------------- | ------------------------------------------------------ | ---------------------------------- |
| `typographic` | words of 6+ letters, 2 letters before a break, 3 after | 12+ letters, 3 before, 4 after     |
| `ritreglur`   | 4+ letters, 1 before, 2 after (see below)              | same limits, compound joints first |

Ritreglur §33.1 prefers to break a compound at its joint. The patterns know
syllables, not joints, so `typographic` adds two rules on top of them:

- **Linking syllables.** When the patterns allow a break on both sides of
  `ar`, `ur`, `is` or `ir` and a part of 3 or more letters follows, the break
  before it is dropped: `stjórnar-völd`, not `stjórn-ar-völd`;
  `sveitar-stjórnar-kosningum`, not `sveit-ar-stjórn-ar-…`. The break that is
  kept counts as a compound joint.
- **Name endings.** `NAME_ENDINGS` is an exported list of productive second
  elements of place names and patronymics (`-eyri`, `-dóttir`, `-son`,
  `-staðir`, `-vík`, and so on). In a capitalised word that ends with one
  (with 3 or more letters before it), that boundary counts as a joint, when
  the patterns allow a break there (`Akur-eyri`, `Sigurðar-dóttir`).

- **Foreign names.** A capitalised word with c, q or w (letters Icelandic
  spelling does not use) stays whole: `Icelandair`, not `Ic-elandair`. Give
  one breaks with the exception list or `dictionary`.

In heading mode a word breaks only at its joints (the `=` of a listed word,
or the two rules above), as long as one fits the limits; otherwise it keeps
its other breaks (`Aðal-steinsson`). Body mode keeps every break the limits
allow (`majónes` stays `maj-ónes`). `ritreglur` uses neither rule.
`ACRONYM_LENGTH` holds the 4 to 8 letter range for `skipAcronyms`; it is a
design choice, not a spelling rule.

The `ritreglur` limits of 1 letter before and 2 after come from the data: the
Árni Magnússon patterns set `LEFTHYPHENMIN 1` and `RIGHTHYPHENMIN 2`. The
4-letter minimum word length is skiptingar's own choice.

`typographic` never produces a break that the `ritreglur` preset does not
offer. It only drops the ones that look bad. Both follow the patterns, which
miss some legal breaks (`ástríða`, `vefslóð`); the exception list and your
`dictionary` add those.

`typeset(text, options)` only swaps characters one for one (after turning the
text into NFC). Every rule has an option of its own:

| Rule                 | Example                                                                                        | Option              |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| Number and unit      | `1.000 kr.`, `5 km`, `20 °C`                                                                   | `units`, on         |
| Month and year       | `sept. 2027`, `ág. 2026`                                                                       | `dates`, on         |
| Ordinal              | `30. september`, `1. sæti`                                                                     | `ordinals`, on      |
| Abbreviation, number | `nr. 5`, `bls. 12`, `kl. 14.30`, `kt. 450190-2939`                                             | `prefixes`, on      |
| Kennitala, phone     | `010190-2939`, `555-1234`, `+354 555 1234` never split                                         | `numbers`, on       |
| Title, initial       | `dr. Jón`, `Jón G. Sigurðsson`                                                                 | `titles`, on        |
| Quotes               | `"orð"` → `„orð“`; a paired `'orð'` → `‚orð‘`, the mark for a word's meaning (Ritreglur §28.2) | `quotes`, on        |
| One-letter words     | `á`, `í` never end a line                                                                      | `singleLetter`, off |
| Last two words       | no one-word last line                                                                          | `lastWords`, off    |
| Dashes               | `1990-2000` → `1990–2000`, `18.-21.`, `kl. 14.30-16.00`; a spaced dash stays on its line       | `dashes`, off       |

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
// ["Hrað­brautar­", "fram­kvæmdir"]
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
the `=` joints of a listed word, or, with typographic rules, the breaks after
linking syllables and the `NAME_ENDINGS` joint. It is always a subset of
`breaks`. Both obey `leftMin` and `rightMin`.

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
types. The patterns load lazily the first time, <!-- size:patterns -->48.9 kB<!-- /size --> brotli for the core
and its patterns; the full client entry is <!-- size:client -->7.5 kB<!-- /size --> brotli,
and Settle rag alone (`SettledText`) <!-- size:rag -->5.3 kB<!-- /size -->. Until then the
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
away from a joint costing more; pair it with `hyphenate(…, { mode: "heading",
joints: "prefer" })` so it has the breaks to choose from), `overhang` (in em at 16px, 0.5 is about one letter) lets
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
- Without React: `const stop = settle(element, text, options)`.
- `bestBreaks(text, metrics, options)` in the core is the search alone, given
  where each character starts; it needs no browser.

It measures the text as plain text in the element's own font, so inline
markup with other metrics is not modelled. It changes nothing for justified
or right-to-left text, an indented first line, preserved newlines or
`hyphens: auto`. The first judgement runs after hydration, so a
server-rendered paragraph can move slightly once.

#### Hyphenate browser text on your server

The hyphenation core and its patterns are <!-- size:patterns -->48.9 kB<!-- /size --> brotli. A page
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
200 jobs and 50 000 characters.

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
pasted text is clean. It doesn't change what find-in-page sees.

## Browser support

The typeset rules use regular expression lookbehind, which needs Safari 16.4
or newer (Chrome 62 and Firefox 78 are older than that). The client entry
needs it too, because it runs the same code. Server-side use has no browser
limit.

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
} /* the default: use our breaks, add none */
```

Settled text sets its own `text-wrap: wrap` while settled; `pretty` and
`balance` are for text you don't settle.

Set `lang="is"`; browsers use it for language rules. Screen readers differ on
soft hyphens (NVDA has been reported to announce them), so test with yours.

Check that your font has U+2011, the non-breaking hyphen `typeset()` puts in
kennitala and phone numbers. Many don't (Geist and Bespoke Serif among them),
and the browser then draws that one hyphen from a fallback font.

## Exceptions

`data/exceptions.txt` is one word per line. `-` is a break, `=` is a compound
joint, which heading mode prefers:

```
þjóð=fé-lags=um=ræða
```

A listed word replaces the pattern result. The file has two parts:
corrections (words the patterns break wrongly or not at all, such as
`víta=mín`) and joint marks (words the patterns already break right, listed
for their joints). Found a wrong break? Add the line, run
`bun run generate:skiptingar`, open a PR. Until then, pass it in `dictionary`.
The list is CC0, so other Icelandic tools can take it as it is.

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
- **Kennitala:** format it (`typeset()` keeps `010190-2939` on one line), but do
  not validate the check digit. Þjóðskrá stopped using it for new numbers on
  18 February 2026. See
  [kennitölur án vartölu](https://www.skra.is/folk/eg-i-thjodskra/um-kennitolur/kennitolur-an-vartolu/).
- **Phone numbers:** `555-1234` and `555 1234` are kept together by `typeset()`.
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

Code: MIT. Exception list: CC0. Patterns: CC BY 4.0. See `NOTICE`.
