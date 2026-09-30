import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookupException, parseExceptions } from "../src/exceptions";
import { EXCEPTION_COUNT } from "../src/generated/data";

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
    expect(EXCEPTION_COUNT).toBe(33);
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
