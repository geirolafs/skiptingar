import { describe, expect, test } from "bun:test";
import {
  applyRag,
  breakOpportunities,
  forbidBreaks,
  isShortWord,
  ragCost,
  shortWordSpaces,
} from "../src";
import { overhangAllowance } from "../src/client/rag";

const NBSP = " ";
const SHY = "­";
const WJ = "⁠";

describe("isShortWord", () => {
  test("knows the listed words in any case", () => {
    expect(isShortWord("og")).toBe(true);
    expect(isShortWord("Og")).toBe(true);
    expect(isShortWord("EÐA")).toBe(true);
    expect(isShortWord("eftir")).toBe(true);
  });

  test("counts every one-letter word", () => {
    expect(isShortWord("á")).toBe(true);
    expect(isShortWord("Í")).toBe(true);
  });

  test("leaves other words alone", () => {
    expect(isShortWord("hestur")).toBe(false);
    expect(isShortWord("fara")).toBe(false);
  });
});

describe("shortWordSpaces", () => {
  test("finds the space after each short word", () => {
    const text = "Ísland farsældafrón og hagsælda í dag";
    expect(shortWordSpaces(text).map(index => text.slice(index - 2, index + 1))).toEqual([
      "og ",
      " í ",
    ]);
  });

  test("ignores a short word inside a longer one", () => {
    expect(shortWordSpaces("hog dagur")).toEqual([]);
    expect(shortWordSpaces(`ver${SHY}og dagur`)).toEqual([]);
  });

  test("skips spaces that are already no-break", () => {
    expect(shortWordSpaces(`og${NBSP}dagur`)).toEqual([]);
  });

  test("counts a word after an opening quote", () => {
    expect(shortWordSpaces("„og þá")).toEqual([3]);
  });

  test("never offers the last word, which has no space after it", () => {
    expect(shortWordSpaces("dagur og")).toEqual([]);
  });
});

describe("breakOpportunities", () => {
  test("lists plain spaces and soft hyphens, not no-break spaces", () => {
    expect(breakOpportunities(`a b${SHY}c${NBSP}d`)).toEqual([1, 3]);
  });
});

describe("forbidBreaks", () => {
  test("turns a forbidden space into a no-break space", () => {
    expect(forbidBreaks("a og b", [4])).toBe(`a og${NBSP}b`);
  });

  test("removes a forbidden soft hyphen", () => {
    expect(forbidBreaks(`fram${SHY}kvæmd`, [4])).toBe("framkvæmd");
  });

  test("keeps the length for a trial, with a word joiner", () => {
    const text = `fram${SHY}kvæmd og`;
    const trial = forbidBreaks(text, [4], { keepLength: true });
    expect(trial).toBe(`fram${WJ}kvæmd og`);
    expect(trial.length).toBe(text.length);
  });

  test("leaves other characters alone", () => {
    expect(forbidBreaks("a og b", [0, 2])).toBe("a og b");
  });

  test("changes nothing with no indices", () => {
    expect(forbidBreaks("a og b", [])).toBe("a og b");
  });
});

describe("ragCost", () => {
  test("is zero for full lines", () => {
    expect(ragCost([{ width: 100 }, { width: 100 }, { width: 20 }], 100)).toBe(0);
  });

  test("ignores the last line", () => {
    expect(ragCost([{ width: 100 }, { width: 10 }], 100)).toBe(0);
  });

  test("squares each gap, so one big gap costs more than two small ones", () => {
    const options = { holeWeight: 0, stepWeight: 0 };
    const one = ragCost([{ width: 60 }, { width: 100 }, { width: 50 }], 100, options);
    const two = ragCost([{ width: 80 }, { width: 80 }, { width: 50 }], 100, options);
    expect(one).toBeCloseTo(0.16);
    expect(two).toBeCloseTo(0.08);
  });

  test("charges a line shorter than both its neighbours for the hole", () => {
    const lines = [{ width: 95 }, { width: 75 }, { width: 95 }, { width: 40 }];
    const flat = ragCost(lines, 100, { holeWeight: 0, stepWeight: 0 });
    const withHoles = ragCost(lines, 100, { holeWeight: 6, stepWeight: 0 });
    // The hole is 20 deep: 6 × 0.2² on top of the gaps.
    expect(withHoles - flat).toBeCloseTo(0.24);
  });

  test("does not count a line as a hole when the next line is shorter", () => {
    const lines = [{ width: 95 }, { width: 75 }, { width: 60 }, { width: 40 }];
    expect(ragCost(lines, 100, { holeWeight: 6 })).toBeCloseTo(
      ragCost(lines, 100, { holeWeight: 0 })
    );
  });

  test("charges a step between two lines, squared", () => {
    const lines = [{ width: 70 }, { width: 100 }, { width: 40 }];
    const flat = ragCost(lines, 100, { stepWeight: 0 });
    // The second line juts out 30 past the first: 2 × 0.3².
    expect(ragCost(lines, 100, { stepWeight: 2 }) - flat).toBeCloseTo(0.18);
  });

  test("charges a hyphen, more for a short piece and more for a ladder", () => {
    const options = { stepWeight: 0, holeWeight: 0 };
    const plain = ragCost([{ width: 100 }, { width: 100 }, { width: 50 }], 100, options);
    const hyphen = { before: 6, after: 6 };
    const one = ragCost(
      [{ width: 100, hyphen }, { width: 100 }, { width: 50 }],
      100,
      options
    );
    const short = ragCost(
      [{ width: 100, hyphen: { before: 3, after: 6 } }, { width: 100 }, { width: 50 }],
      100,
      options
    );
    const ladder = ragCost(
      [{ width: 100, hyphen }, { width: 100, hyphen }, { width: 50 }],
      100,
      options
    );
    expect(one - plain).toBeCloseTo(0.01);
    expect(short - plain).toBeCloseTo(0.26);
    expect(ladder - plain).toBeCloseTo(0.04);
  });

  test("charges each hanging short word its weight", () => {
    const lines = [{ width: 100, hangingShortWord: true }, { width: 50 }];
    expect(ragCost(lines, 100, { shortWordWeight: 0.05 })).toBeCloseTo(0.05);
  });

  test("makes an overflowing line far worse than any gap", () => {
    expect(ragCost([{ width: 120 }, { width: 50 }], 100)).toBeGreaterThan(5);
  });
});

describe("applyRag", () => {
  test("forbids the breaks and moves each overhang past a removed soft hyphen", () => {
    const text = `fram${SHY}kvæmd og dómur.`;
    expect(text[13]).toBe(" ");
    expect(text[19]).toBe(".");
    const result = applyRag(text, [4, 13], [{ index: 19, width: 3 }]);
    expect(result.text).toBe(`framkvæmd og${NBSP}dómur.`);
    // One soft hyphen before it went, so the period moved one place left.
    expect(result.hangs).toEqual([{ index: 18, width: 3 }]);
    expect(result.text[18]).toBe(".");
  });
});

describe("overhangAllowance", () => {
  test("is the allowance in em at 16px", () => {
    expect(overhangAllowance(0.5, 16)).toBeCloseTo(8);
  });

  test("shrinks as a share of the type as the type grows", () => {
    const body = overhangAllowance(0.5, 20) / 20;
    const title = overhangAllowance(0.5, 44) / 44;
    expect(title).toBeLessThan(body);
    expect(title).toBeCloseTo(0.5 * Math.sqrt(16 / 44));
  });

  test("never goes below 0.15 em", () => {
    expect(overhangAllowance(0.5, 400) / 400).toBeCloseTo(0.15);
  });

  test("is off at 0", () => {
    expect(overhangAllowance(0, 20)).toBe(0);
  });
});

describe("overhangAllowance never exceeds what was asked", () => {
  test("a small allowance stays small", () => {
    expect(overhangAllowance(0.1, 16) / 16).toBeCloseTo(0.1);
  });
});
