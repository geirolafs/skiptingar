import { describe, expect, test } from "bun:test";
import { hyphenate } from "../src";
import {
  bestBreaks,
  forbidBreaks,
  hangCharacter,
  lastCharacterStart,
  type Metrics,
  splitHangs,
  splitSettled,
  type Tightened,
} from "../src/rag";

const SHY = "­";

/** Every character 10px wide, a soft hyphen 0 (it draws nothing until a break). */
function monospace(
  text: string,
  measure: number,
  overhang = 0,
  tightenWord = 0,
  tightenLetter = 0
): Metrics {
  const x = new Float64Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    x[index + 1] = (x[index] ?? 0) + (text[index] === SHY ? 0 : 10);
  }
  return { x, hyphen: 10, measure, overhang, tightenWord, tightenLetter };
}

/** The same text with each tightened line's spacing applied, the way the browser sets the spans. */
function withTightened(
  text: string,
  metrics: Metrics,
  tightened: readonly Tightened[]
): Metrics {
  const x = new Float64Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    let advance = (metrics.x[index + 1] ?? 0) - (metrics.x[index] ?? 0);
    for (const line of tightened) {
      if (index >= line.start && index < line.end) {
        advance += line.letterSpacing + (text[index] === " " ? line.wordSpacing : 0);
      }
    }
    x[index + 1] = (x[index] ?? 0) + advance;
  }
  return { ...metrics, x };
}

const DASHES = new Set(["-", "–", "—"]);

/**
 * What a browser does with `text` (forbidden breaks already applied): each
 * line breaks at the last space, soft hyphen or dash that fits, and a piece
 * that fits nowhere gets a line of its own. Returns the index of the first
 * character of every line but the first.
 */
function greedy(text: string, metrics: Metrics): number[] {
  const { x, hyphen, measure } = metrics;
  const places: { end: number; next: number; hyphen: boolean }[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (character === " " || character === SHY) {
      places.push({ end: index, next: index + 1, hyphen: character === SHY });
    } else if (
      DASHES.has(character) &&
      !/\s/.test(text[index - 1] ?? " ") &&
      !/[\s­]/.test(text[index + 1] ?? " ") &&
      !(character === "-" && /\d/.test(text[index + 1] ?? ""))
    ) {
      places.push({ end: index + 1, next: index + 1, hyphen: false });
    }
  }
  const starts: number[] = [];
  let start = 0;
  for (;;) {
    const whole = (x[text.length] ?? 0) - (x[start] ?? 0);
    if (whole <= measure) {
      return starts;
    }
    const after = places.filter(place => place.end > start);
    let chosen: (typeof after)[number] | undefined;
    for (const place of after) {
      const width = (x[place.end] ?? 0) - (x[start] ?? 0) + (place.hyphen ? hyphen : 0);
      if (width <= measure) {
        chosen = place;
      }
    }
    chosen ??= after[0];
    if (!chosen) {
      return starts;
    }
    starts.push(chosen.next);
    start = chosen.next;
  }
}

/** The plan's text, with forbidden breaks applied the way the client tests them. */
function planned(text: string, measure: number) {
  const metrics = monospace(text, measure);
  const plan = bestBreaks(text, metrics);
  if (!plan) {
    throw new Error("no plan");
  }
  const set = forbidBreaks(text, plan.forbidden, { keepLength: true });
  return { plan, metrics, set };
}

const PARAGRAPH = hyphenate(
  "Kjörsókn í sveitarstjórnarkosningunum 16. maí 2026 var sú mesta sem mælst hefur í Hrafnafjarðarbyggð og hún jókst mest hjá ungu fólki á Norður-Ameríku slóðum árin 1990–2010."
);

describe("bestBreaks", () => {
  test("a greedy browser sets every plan exactly", () => {
    for (let measure = 120; measure <= 600; measure += 15) {
      const { plan, metrics, set } = planned(PARAGRAPH, measure);
      expect(greedy(set, metrics)).toEqual(plan.ends.map(end => end.after));
      expect(plan.lines).toBe(plan.ends.length + 1);
    }
  });

  test("only spaces and soft hyphens are ever forbidden", () => {
    for (let measure = 120; measure <= 600; measure += 15) {
      const { plan } = planned(PARAGRAPH, measure);
      for (const index of plan.forbidden) {
        expect([" ", SHY]).toContain(PARAGRAPH[index]);
      }
    }
  });

  test("a word wider than the measure gets a line of its own instead of no plan", () => {
    const text = "Sjá https://example.is/mjog/langt/heimilisfang og svo framvegis";
    const { plan, metrics, set } = planned(text, 120);
    expect(greedy(set, metrics)).toEqual(plan.ends.map(end => end.after));
    expect(plan.ends.some(end => text.slice(end.after).startsWith("https"))).toBe(true);
  });

  test("a line may end after a dash", () => {
    const text = "aaaa Norður-Ameríku bbbb";
    const { plan } = planned(text, 130);
    expect(plan.ends.map(end => text.slice(end.after))).toContain("Ameríku bbbb");
  });

  test("avoids a last line of one word when another layout is as good", () => {
    const text = "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii";
    // Greedily: four words a line, and "iiii" alone at the end.
    const runt = bestBreaks(text, monospace(text, 195), { runtWeight: 0 });
    const kept = bestBreaks(text, monospace(text, 195));
    const lastLine = (plan: typeof kept) =>
      text.slice(plan?.ends.at(-1)?.after ?? 0).trim();
    expect(lastLine(runt)).toBe("iiii");
    expect(lastLine(kept).split(" ").length).toBeGreaterThan(1);
  });

  test("returns null only when there is nowhere to break", () => {
    expect(bestBreaks("Orð", monospace("Orð", 10))).toBeNull();
  });
});

describe("tightening", () => {
  // Ten-pixel characters. "aaaa bbbb cccc" is 140px with two spaces inside, so
  // at a measure of 135 it is too wide by 5.75px (the measure less the 0.75px
  // slack), and each space shrinking by 3px, 6px in all, fits it.
  const text = "aaaa bbbb cccc dddd eeee";
  const wide = 135;

  test("keeps a word on its line by shrinking the word spaces", () => {
    const plan = bestBreaks(text, monospace(text, wide, 0, 3), { tighten: 1 });
    expect(plan?.ends[0]?.after).toBe(15);
    expect(plan?.tightened).toHaveLength(1);
    const [line] = plan?.tightened ?? [];
    expect(line?.start).toBe(0);
    expect(line?.end).toBe(14);
    expect(line?.letterSpacing).toBe(0);
    // Two spaces cover the 5.75px the line is too wide by, plus the 1px
    // margin, up to their 6px of room.
    expect((line?.wordSpacing ?? 0) * 2).toBeCloseTo(-6);
    expect(line?.wordSpacing).toBeGreaterThanOrEqual(-3);
    expect(plan?.hangs).toEqual([]);
  });

  test("breaks earlier with tightening off", () => {
    const off = bestBreaks(text, monospace(text, wide));
    const on = bestBreaks(text, monospace(text, wide, 0, 3));
    expect(off?.tightened).toEqual([]);
    expect(off?.ends[0]?.after).toBe(10);
    expect(on?.ends[0]?.after).toBe(15);
  });

  test("is off by default, whatever the paragraph", () => {
    for (let measure = 120; measure <= 600; measure += 15) {
      const plan = bestBreaks(PARAGRAPH, monospace(PARAGRAPH, measure));
      expect(plan?.tightened).toEqual([]);
    }
  });

  test("is never used on a line that fits without it", () => {
    for (let measure = 120; measure <= 600; measure += 5) {
      const metrics = monospace(PARAGRAPH, measure, 0, 3, 0.4);
      const plan = bestBreaks(PARAGRAPH, metrics, { tighten: 1 });
      for (const line of plan?.tightened ?? []) {
        const run = PARAGRAPH.slice(line.start, line.end);
        const natural =
          [...run].filter(character => character !== SHY).length * 10 +
          (PARAGRAPH[line.end] === SHY ? 10 : 0);
        expect(natural).toBeGreaterThan(measure - 0.75);
        // It shrinks the line to the measure, at most 1px (the margin) further.
        const spaces = run.split(" ").length - 1;
        const letters = [...run].filter(character => character !== SHY).length;
        const shrunk = -(spaces * line.wordSpacing + letters * line.letterSpacing);
        expect(natural - shrunk).toBeLessThanOrEqual(measure - 0.75 + 1e-9);
        expect(natural - shrunk).toBeGreaterThanOrEqual(measure - 1.75 - 1e-9);
        expect(line.wordSpacing).toBeGreaterThanOrEqual(-3);
        expect(line.letterSpacing).toBeGreaterThanOrEqual(-0.4);
      }
    }
  });

  test("a greedy browser sets every tightened plan exactly", () => {
    let used = 0;
    for (let measure = 120; measure <= 600; measure += 5) {
      const metrics = monospace(PARAGRAPH, measure, 0, 3, 0.4);
      const plan = bestBreaks(PARAGRAPH, metrics, { tighten: 1 });
      if (!plan) {
        throw new Error("no plan");
      }
      used += plan.tightened.length;
      const set = forbidBreaks(PARAGRAPH, plan.forbidden, { keepLength: true });
      expect(greedy(set, withTightened(PARAGRAPH, metrics, plan.tightened))).toEqual(
        plan.ends.map(end => end.after)
      );
    }
    expect(used).toBeGreaterThan(0);
  });

  test("a line with one space falls back to letter space only when word space is not enough", () => {
    const small = "aa bbbbbbbbbbb cccc dddd";
    // 14 characters, 140px, too wide by 5.75px at 135. One space shrinking by 2px is not enough.
    const without = bestBreaks(small, monospace(small, wide, 0, 2));
    expect(without?.tightened).toEqual([]);
    const plan = bestBreaks(small, monospace(small, wide, 0, 2, 0.5));
    expect(plan?.ends[0]?.after).toBe(15);
    const [line] = plan?.tightened ?? [];
    expect(line?.wordSpacing).toBe(-2);
    // The rest, 3.75px and the 1px margin, goes over the 14 characters.
    expect(line?.letterSpacing).toBeCloseTo(-4.75 / 14);
  });

  test("a line with no space uses letter space alone", () => {
    const word = "aaaaaaaaaaaaaa bb";
    const plan = bestBreaks(word, monospace(word, wide, 0, 3, 0.5));
    const [line] = plan?.tightened ?? [];
    expect(line?.wordSpacing).toBe(0);
    expect(line?.letterSpacing).toBeCloseTo(-6.75 / 14);
    expect(bestBreaks(word, monospace(word, wide, 0, 3))?.tightened).toEqual([]);
  });

  test("never uses letter space when word space is enough", () => {
    const small = "aa bbbbbbbbbbb cccc dddd";
    const plan = bestBreaks(small, monospace(small, wide, 0, 6, 0.5));
    const [line] = plan?.tightened ?? [];
    // 5.75px and the margin would be 6.75px; the margin stops at the one
    // space's 6px of room rather than bring in letter space.
    expect(line?.wordSpacing).toBeCloseTo(-6);
    expect(line?.letterSpacing).toBe(0);
  });

  test("the overhang wins when both could make the line fit", () => {
    const plan = bestBreaks(text, monospace(text, wide, 8, 3));
    expect(plan?.ends[0]?.after).toBe(15);
    expect(plan?.hangs).toHaveLength(1);
    expect(plan?.tightened).toEqual([]);
  });

  test("tightening takes the line the overhang is too small for, never both", () => {
    const plan = bestBreaks(text, monospace(text, wide, 3, 3));
    expect(plan?.ends[0]?.after).toBe(15);
    expect(plan?.hangs).toEqual([]);
    expect(plan?.tightened).toHaveLength(1);
  });

  test("a tightened line costs, so it is used only when the paragraph is better for it", () => {
    const cheap = bestBreaks(text, monospace(text, wide, 0, 3), { tighten: 1 });
    const dear = bestBreaks(text, monospace(text, wide, 0, 3), {
      tighten: 1,
      tightenWeight: 100,
    });
    expect(cheap?.tightened).toHaveLength(1);
    expect(dear?.tightened).toEqual([]);
  });
});

describe("hang characters", () => {
  test("an emoji at a line end is one hang, both code units", () => {
    const text = "frábært 😀";
    const start = lastCharacterStart(text, text.length);
    expect(start).toBe(text.length - 2);
    expect(hangCharacter(text, start)).toBe("😀");
    expect(hangCharacter("abc", 2)).toBe("c");
  });
});

describe("balance (titles)", () => {
  const title = "Kjörsókn í Hrafnafjarðarbyggð aldrei meiri í kosningum";

  test("keeps the greedy number of lines and evens them out", () => {
    for (let measure = 203; measure <= 503; measure += 20) {
      const metrics = monospace(title, measure);
      const greedyLines = greedy(title, metrics).length + 1;
      const plan = bestBreaks(title, metrics, { balance: true });
      expect(plan?.lines).toBe(greedyLines);
      const set = forbidBreaks(title, plan?.forbidden ?? [], { keepLength: true });
      expect(greedy(set, metrics)).toEqual(plan?.ends.map(end => end.after) ?? []);
    }
  });

  test("a two-line title splits near the middle, not after the first line fills", () => {
    const metrics = monospace(title, 400);
    const filled = bestBreaks(title, metrics);
    const balanced = bestBreaks(title, metrics, { balance: true });
    const firstLine = (plan: typeof filled) => (plan?.ends[0]?.after ?? 0) * 10;
    expect(plan2(filled)).toBe(2);
    expect(plan2(balanced)).toBe(2);
    const half = (title.length * 10) / 2;
    expect(Math.abs(firstLine(balanced) - half)).toBeLessThan(
      Math.abs(firstLine(filled) - half)
    );
  });
});

function plan2(plan: { lines: number } | null): number {
  return plan?.lines ?? 0;
}

describe("splitHangs", () => {
  test("cuts the text around each overhanging character, an emoji whole", () => {
    expect(
      splitHangs("abc def 😀", [
        { index: 2, width: 3 },
        { index: 8, width: 4 },
      ])
    ).toEqual([
      { start: 0, text: "ab" },
      { start: 2, text: "c", hang: 3 },
      { start: 3, text: " def " },
      { start: 8, text: "😀", hang: 4 },
    ]);
    expect(splitHangs("abc", [])).toEqual([{ start: 0, text: "abc" }]);
  });
});

describe("splitSettled", () => {
  test("cuts hangs and tightened lines out of plain runs", () => {
    const tightened = { wordSpacing: -2, letterSpacing: 0 };
    expect(
      splitSettled(
        "aaa bbb ccc ddd😀",
        [{ index: 11, width: 3 }],
        [{ start: 12, end: 17, ...tightened }]
      )
    ).toEqual([
      { start: 0, text: "aaa bbb ccc" },
      { start: 11, text: " ", hang: 3 },
      { start: 12, text: "ddd😀", wordSpacing: -2, letterSpacing: 0 },
    ]);
  });

  test("keeps the order of a mix, an emoji whole", () => {
    const text = "aa bb cc dd ee ff 😀";
    expect(
      splitSettled(
        text,
        [{ index: 18, width: 4 }],
        [
          { start: 9, end: 14, wordSpacing: -1, letterSpacing: -0.5 },
          { start: 0, end: 5, wordSpacing: -2, letterSpacing: 0 },
        ]
      )
    ).toEqual([
      { start: 0, text: "aa bb", wordSpacing: -2, letterSpacing: 0 },
      { start: 5, text: " cc " },
      { start: 9, text: "dd ee", wordSpacing: -1, letterSpacing: -0.5 },
      { start: 14, text: " ff " },
      { start: 18, text: "😀", hang: 4 },
    ]);
  });

  test("is splitHangs when nothing is tightened", () => {
    const hangs = [{ index: 2, width: 3 }];
    expect(splitSettled("abc def", hangs)).toEqual(splitHangs("abc def", hangs));
    expect(splitSettled("abc", [], [])).toEqual([{ start: 0, text: "abc" }]);
  });
});

describe("a joined range", () => {
  test("is never a place to break", () => {
    const text = "aaaa 1990–⁠2010 bbbb";
    const plan = bestBreaks(text, monospace(text, 100));
    expect(plan?.ends.map(end => text.slice(end.after))).not.toContain("2010 bbbb");
  });
});

describe("titles prefer joints and keep short words off line ends", () => {
  const SHY = "­";
  test("a title breaks at the joint when a non-joint break would set as well", () => {
    const text = `Kjörsókn í Hrafna${SHY}fjarðar${SHY}byggð aldrei meiri`;
    const plan = bestBreaks(text, monospace(text, 255), { balance: true });
    const firstEnd = plan?.ends[0]?.after ?? 0;
    expect(text.slice(firstEnd)).toStartWith("byggð");
  });

  test("a title moves a short word down when it costs no line", () => {
    const text = "Kjörsókn í Hrafnafjarðarbyggð";
    const plan = bestBreaks(text, monospace(text, 205), { balance: true });
    expect(text.slice(plan?.ends[0]?.after ?? 0)).toStartWith("í ");
  });
});
