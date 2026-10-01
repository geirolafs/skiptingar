/**
 * How fast the core runs: hyphenating and typesetting a long text, and the
 * rag search on paragraphs of 50, 200 and 1000 words at two measures, with
 * made-up character widths (the browser's measuring is not included). Run
 * from the package folder: `bun run bench`.
 */
import { bestBreaks, hyphenate, typeset } from "../src";

const SENTENCE =
  "Mörður hét maður er kallaður var gígja. Hann var sonur Sighvats hins rauða. Hann bjó á Velli á Rangárvöllum. Hann var ríkur höfðingi og málafylgjumaður mikill og svo mikill lögmaður að engir þóttu löglegir dómar dæmdir nema hann væri við.";
const WORDS = SENTENCE.split(" ");
const words = (count: number) =>
  Array.from({ length: count }, (_, index) => WORDS[index % WORDS.length]).join(" ");

/** Runs `run` for about 300 ms and returns the mean time in ms. */
function time(run: () => unknown): number {
  const start = performance.now();
  let runs = 0;
  do {
    run();
    runs += 1;
  } while (performance.now() - start < 300);
  return (performance.now() - start) / runs;
}

const long = words(20_000);
const hyphenMs = time(() => hyphenate(long));
const typesetMs = time(() => typeset(long));
console.log(
  `hyphenate: ${Math.round(20_000 / (hyphenMs / 1000)).toLocaleString()} words/s`
);
console.log(
  `typeset:   ${Math.round(20_000 / (typesetMs / 1000)).toLocaleString()} words/s`
);

for (const count of [50, 200, 1000]) {
  const text = hyphenate(words(count));
  const x = new Float64Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    // About 7 px a character, varied a little; a soft hyphen draws nothing.
    x[index + 1] =
      (x[index] ?? 0) + (text[index] === "­" ? 0 : 6 + (text.charCodeAt(index) % 3));
  }
  for (const measure of [320, 640]) {
    const ms = time(() => bestBreaks(text, { x, hyphen: 7, measure, overhang: 0 }));
    console.log(`bestBreaks: ${count} words at ${measure}px: ${ms.toFixed(1)} ms`);
  }
}
