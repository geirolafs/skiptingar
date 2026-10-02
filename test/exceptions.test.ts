import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookupException, parseExceptions } from "../src/exceptions";
import { EXCEPTION_COUNT } from "../src/generated/data";
import { hyphenate } from "../src/hyphenate";

const RAW_FILE = readFileSync(
  join(import.meta.dir, "..", "data", "exceptions.txt"),
  "utf8"
);

describe("parseExceptions", () => {
  test("reads breaks and joints as letter positions", () => {
    const entries = parseExceptions("eyja=fjalla=jök-ull\n");
    expect(entries.get("eyjafjallajökull")).toEqual({
      breaks: [4, 10, 13],
      joints: [4, 10],
    });
  });

  test("ignores comments and blank lines", () => {
    const entries = parseExceptions("# comment\n\n  \nreykja=vík\r\n");
    expect([...entries.keys()]).toEqual(["reykjavík"]);
  });

  test("the bundled list parses and matches the file on disk", () => {
    const fromDisk = parseExceptions(RAW_FILE);
    expect(fromDisk.size).toBe(EXCEPTION_COUNT);
    expect(EXCEPTION_COUNT).toBe(36);
    expect(lookupException("reykjavík")).toEqual({ breaks: [6], joints: [6] });
    expect(lookupException("karfa")).toBeUndefined();
  });

  test("the official Ritreglur examples from R800 section 33 are listed", () => {
    expect(lookupException("vítamín")).toEqual({ breaks: [4], joints: [4] });
    expect(lookupException("ástríða")).toEqual({ breaks: [1], joints: [] });
  });

  test("the bundled list carries the license and review notice", () => {
    expect(RAW_FILE).toContain("CC0");
    expect(RAW_FILE).toContain("first pass by a native speaker");
  });

  test.each([
    ["a separator at the start", "-reykjavík", /line 2: separator at the start/],
    ["a separator at the end", "reykjavík=", /line 2: separator at the end/],
    ["two separators in a row", "reykja=-vík", /line 2: two separators/],
    ["a digit", "reykja=vík2", /line 2: the word must contain letters only/],
    ["a space", "reykja vík", /line 2: the word must contain letters only/],
    ["upper case", "Reykja=vík", /line 2: the word must be lowercase/],
  ])("throws for %s and names the line", (_name, line, message) => {
    expect(() => parseExceptions(`# header\n${line}`)).toThrow(message);
  });

  test("throws for a duplicate word, even with different breaks", () => {
    expect(() => parseExceptions("reykja=vík\nreykja-vík")).toThrow(
      /line 2: duplicate word "reykjavík"/
    );
  });
});

describe("a caller's dictionary", () => {
  const lines = Array.from({ length: 200 }, (_, index) => {
    const id = [0, 1, 2, 3]
      .map(place => String.fromCharCode(97 + (Math.floor(index / 26 ** place) % 26)))
      .join("");
    return `${id}${"x".repeat(29)}-${"y".repeat(30)}`;
  });

  test("is joined and compared once for an array, not once for a word", () => {
    let joins = 0;
    const dictionary = [...lines];
    const join = dictionary.join.bind(dictionary);
    dictionary.join = (separator?: string) => {
      joins += 1;
      return join(separator);
    };
    const words = "orðabókin hraðbraut ".repeat(8000).split(" ");
    for (const word of words) {
      lookupException(word, { dictionary, bundled: false });
    }
    expect(words).toHaveLength(16_001);
    expect(joins).toBe(1);
  });

  test("a new array with the same lines gives the same answer", () => {
    const word = (lines[3] ?? "").replace("-", "");
    const ask = () => lookupException(word, { dictionary: [...lines], bundled: false });
    expect(ask()?.breaks).toEqual([33]);
    // A fresh array each time, as a component that writes the array inline does.
    for (let i = 0; i < 100; i++) {
      expect(ask()).toBe(ask());
    }
  });

  test("16 000 words against 200 lines of 64 characters stay fast", () => {
    const words = "orðabókin hraðbraut ".repeat(8000);
    const started = performance.now();
    hyphenate(words, { dictionary: lines });
    // Joining and hashing the dictionary for each word took 360 ms here, and
    // the whole text takes about 100 ms now. The bound is loose, for slow CI.
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
