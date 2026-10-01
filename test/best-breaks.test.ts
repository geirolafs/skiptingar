import { describe, expect, test } from "bun:test";
import { hyphenate } from "../src";
import {
  bestBreaks,
  forbidBreaks,
  hangCharacter,
  lastCharacterStart,
  type Metrics,
} from "../src/rag";

const SHY = "­";

/** Every character 10px wide, a soft hyphen 0 (it draws nothing until a break). */
function monospace(text: string, measure: number, overshoot = 0): Metrics {
  const x = new Float64Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    x[index + 1] = (x[index] ?? 0) + (text[index] === SHY ? 0 : 10);
  }
  return { x, hyphen: 10, measure, overshoot };
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

describe("hang characters", () => {
  test("an emoji at a line end is one hang, both code units", () => {
    const text = "frábært 😀";
    const start = lastCharacterStart(text, text.length);
    expect(start).toBe(text.length - 2);
    expect(hangCharacter(text, start)).toBe("😀");
    expect(hangCharacter("abc", 2)).toBe("c");
  });
});
