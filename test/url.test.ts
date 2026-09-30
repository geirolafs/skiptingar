import { describe, expect, test } from "bun:test";
import { findProtectedMask, isProtected } from "../src/url";

/** The parts of `text` the detector protects, in order. */
function protectedParts(text: string): string[] {
  const mask = findProtectedMask(text);
  const parts: string[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    if (mask[i] === 1 && start === -1) {
      start = i;
    } else if (mask[i] !== 1 && start !== -1) {
      parts.push(text.slice(start, i));
      start = -1;
    }
  }
  return parts;
}

describe("protected addresses", () => {
  test.each([
    ["Sjá https://example.is/x-y.", ["https://example.is/x-y"]],
    ["Sjá ftp://example.is/a", ["ftp://example.is/a"]],
    ["Sjá www.example.is.", ["www.example.is"]],
    ["Sjá geirolafs.com.", ["geirolafs.com"]],
    ["Sjá geirolafs.com, og fleira", ["geirolafs.com"]],
    [
      "þjóðfélagsumræða.is og sub.hraðbrautarframkvæmdir.is",
      ["þjóðfélagsumræða.is", "sub.hraðbrautarframkvæmdir.is"],
    ],
    ["Sjá example.is/1990-2000", ["example.is/1990-2000"]],
    ["Skrifa á jon.jonsson@example.is núna", ["jon.jonsson@example.is"]],
    ['Sjá "geirolafs.com" núna', ["geirolafs.com"]],
    ["(sjá example.co.uk)", ["example.co.uk"]],
    ["Sjá example.xn--p1ai/1990-2000", ["example.xn--p1ai/1990-2000"]],
    ["Sjá localhost:3000/1990-2000 núna", ["localhost:3000/1990-2000"]],
    ["Sjá 192.168.0.1/1990-2000 núna", ["192.168.0.1/1990-2000"]],
    ["Sjá 192.168.0.1:8080 núna.", ["192.168.0.1:8080"]],
    ["Sjá 192.168.0.1.", ["192.168.0.1"]],
    ["Sjá example.is:3000/1990-2000", ["example.is:3000/1990-2000"]],
    ["Sjá example.is:3000, núna", ["example.is:3000"]],
    ["Sjá example.is?years=1990-2000", ["example.is?years=1990-2000"]],
    ["Sjá geirolafs.is? Já", ["geirolafs.is"]],
    ["Sjá example.is#top núna", ["example.is#top"]],
    [
      "Sendu mailto:jon@example.is?subject=1990-2000 núna",
      ["mailto:jon@example.is?subject=1990-2000"],
    ],
    ["Hringdu tel:+3545551990 núna", ["tel:+3545551990"]],
    ["Sjá [::1]:3000/x núna", ["[::1]:3000/x"]],
    ["Sjá [2001:db8::1] núna", ["[2001:db8::1]"]],
  ])("finds the address in %p", (text, expected) => {
    expect(protectedParts(text)).toEqual(expected);
  });

  test.each([
    "Um landsbyggðinni. Næsta",
    "Hann fór heim.",
    "landsbyggðinni.",
    "Hann kom kl. 5 t. d. í dag",
    "Kostar 1.000 kr. í dag",
    "þ. e. a. s.",
    "t.d. og o.s.frv. og m.a.",
    "t.d. o.s.frv. þ.e. þ.e.a.s. m.a. o.fl. u.þ.b. a.m.k.",
    "Sjá u.þ.b. 50 og nr. 5 og kl. 14:30",
    "Fundur kl. 14:30 í 1. sal",
    "Staðan var 2:1 og 3,5 og 3.5 og 1.000",
    "Athugið: orð:5 og hotel:5",
    "[2:1] og [a:b] og [1]",
    "Sjá 192.168.0 og 1.2.3",
    "orð",
    "",
  ])("finds nothing in %p", text => {
    expect(protectedParts(text)).toEqual([]);
  });

  test("isProtected reports overlap with any protected character", () => {
    const text = "Sjá geirolafs.com núna";
    const mask = findProtectedMask(text);
    expect(isProtected(mask, 0, 3)).toBe(false);
    expect(isProtected(mask, 2, 5)).toBe(true);
    expect(isProtected(mask, 4, 13)).toBe(true);
    expect(isProtected(mask, 18, 22)).toBe(false);
  });

  test.each([
    ["40,000 letters", "a".repeat(40_000)],
    ["dotted letters", "a.".repeat(20_000)],
    ["short words with dots", "orð.".repeat(10_000)],
    ["words with spaces", "orð ".repeat(10_000)],
    ["a scheme and 40,000 dots", `https://${".".repeat(40_000)}`],
    ["40,000 characters of a: pairs", "a:".repeat(20_000)],
    ["a long run of digits and dots", "1.".repeat(20_000)],
    ["a long run of bracketed colons", `[${":".repeat(40_000)}`],
    ["many opening brackets", "[a:".repeat(13_000)],
  ])("scans %s in under 200 ms", (_name, input) => {
    const start = performance.now();
    findProtectedMask(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
