/**
 * How fast the core runs: hyphenating a long text and adding the locale details. Run from
 * the package folder: `bun run bench`.
 */
import { hyphenate, localeDetails } from "../src";

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
const localeDetailsMs = time(() => localeDetails(long));
console.log(
  `hyphenate:     ${Math.round(20_000 / (hyphenMs / 1000)).toLocaleString()} words/s`
);
console.log(
  `localeDetails: ${Math.round(20_000 / (localeDetailsMs / 1000)).toLocaleString()} words/s`
);
