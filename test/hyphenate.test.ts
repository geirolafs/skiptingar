import { describe, expect, test } from "bun:test";
import {
  ACRONYM_LENGTH,
  analyzeWord,
  breakOffsets,
  hyphenate,
  hyphenateWord,
  NAME_ENDINGS,
  NO_BREAK_SPACE,
  NON_BREAKING_HYPHEN,
  SOFT_HYPHEN,
} from "../src";

const SHY = "­";
const RITREGLUR = { rules: "ritreglur" } as const;
const RAW_RITREGLUR = { rules: "ritreglur", exceptions: false } as const;

/** Shows soft hyphens as "-" so expectations stay readable. */
function show(text: string): string {
  return text.replaceAll(SHY, "-");
}

const VERIFIED: [string, string][] = [
  [
    "Vaðlaheiðarvegavinnuverkfærageymsluskúr",
    "Vaðla-heið-ar-vega-vinnu-verk-færa-geymslu-skúr",
  ],
  ["þjóðfélagsumræða", "þjóð-fé-lags-um-ræða"],
  ["hraðbrautarframkvæmdir", "hrað-braut-ar-fram-kvæmd-ir"],
  ["ólán", "ó-lán"],
  ["karfa", "karfa"],
  ["íþróttafélagið", "í-þrótta-fé-lag-ið"],
  ["ádrepa", "á-drepa"],
  ["óhjákvæmilegt", "ó-hjá-kvæmi-legt"],
  ["Reykjavík", "Reykja-vík"],
  ["Eyjafjallajökull", "Eyja-fjalla-jök-ull"],
];

describe("ritreglur output", () => {
  test.each(VERIFIED)("raw patterns: %s", (input, expected) => {
    expect(show(hyphenate(input, RAW_RITREGLUR))).toBe(expected);
  });

  test.each(VERIFIED)("with exceptions: %s", (input, expected) => {
    expect(show(hyphenate(input, RITREGLUR))).toBe(expected);
  });

  test("keeps the case of the input", () => {
    expect(hyphenate("Reykjavík", RITREGLUR)).toBe(`Reykja${SHY}vík`);
    expect(hyphenate("REYKJAVÍK", RITREGLUR)).toBe(`REYKJA${SHY}VÍK`);
  });
});

describe("typographic presets", () => {
  test("body drops short-word and short-margin breaks", () => {
    expect(hyphenate("ólán")).toBe("ólán");
    expect(show(hyphenate("ádrepa"))).toBe("ádrepa");
    expect(show(hyphenate("íþróttafélagið"))).toBe("íþrótta-fé-lagið");
  });

  test("body keeps breaks that fit inside the limits", () => {
    expect(show(hyphenate("þjóðfélagsumræða"))).toBe("þjóð-fé-lags-um-ræða");
    expect(show(hyphenate("Þjóðfélagsumræðan"))).toBe("Þjóð-fé-lags-um-ræðan");
  });

  test("heading skips words shorter than 12 letters", () => {
    expect(hyphenate("Reykjavík", { mode: "heading" })).toBe("Reykjavík");
  });

  test("heading uses only the joints of a known compound", () => {
    expect(
      show(hyphenate("Vaðlaheiðarvegavinnuverkfærageymsluskúr", { mode: "heading" }))
    ).toBe("Vaðla-heiðar-vega-vinnu-verkfæra-geymslu-skúr");
    expect(show(hyphenate("hönnunarstofa", { mode: "heading" }))).toBe("hönnunar-stofa");
  });

  test("heading falls back to patterns when the word has no joints", () => {
    // "upplýsingatækniráðgjöf" is not in the list, so patterns with heading limits apply.
    expect(show(hyphenate("upplýsingatækniráðgjöf", { mode: "heading" }))).toBe(
      "upp-lýs-inga-tækni-ráð-gjöf"
    );
  });

  test("heading with ritreglur still uses joints, with ritreglur limits", () => {
    expect(
      show(hyphenate("Eyjafjallajökull", { mode: "heading", rules: "ritreglur" }))
    ).toBe("Eyja-fjalla-jökull");
  });

  test("exceptions:false ignores joints in heading mode", () => {
    const raw = show(
      hyphenate("Vaðlaheiðarvegavinnuverkfærageymsluskúr", {
        mode: "heading",
        exceptions: false,
      })
    );
    expect(raw).not.toBe("Vaðla-heiðar-vega-vinnu-verkfæra-geymslu-skúr");
    expect(raw.replaceAll("-", "")).toBe("Vaðlaheiðarvegavinnuverkfærageymsluskúr");
  });
});

describe("options", () => {
  test("minWordLength, leftMin and rightMin override the preset", () => {
    expect(show(hyphenate("ólán", { minWordLength: 4, leftMin: 1, rightMin: 2 }))).toBe(
      "ó-lán"
    );
    expect(show(hyphenate("þjóðfélagsumræða", { rightMin: 5 }))).toBe(
      "þjóð-fé-lags-umræða"
    );
  });

  test("hyphenChar replaces the soft hyphen", () => {
    expect(hyphenate("Reykjavík", { ...RITREGLUR, hyphenChar: "|" })).toBe("Reykja|vík");
  });

  test("hyphenateWord returns break positions in letters", () => {
    expect(hyphenateWord("Reykjavík", RITREGLUR)).toEqual([6]);
    expect(hyphenateWord("karfa", RITREGLUR)).toEqual([]);
    expect(hyphenateWord("Eyjafjallajökull", RITREGLUR)).toEqual([4, 10, 13]);
  });
});

describe("text handling", () => {
  test("is idempotent", () => {
    const text = "Þjóðfélagsumræða um íþróttafélagið á Íslandi, sjá www.þjóðfélag.is.";
    for (const options of [{}, RITREGLUR, { mode: "heading" } as const]) {
      const once = hyphenate(text, options);
      expect(hyphenate(once, options)).toBe(once);
    }
  });

  test("removes soft hyphens that are already in the input", () => {
    const messy = `íþrótta${SHY}${SHY}félagið og hraðbraut${SHY}arframkvæmdir`;
    expect(hyphenate(messy, RITREGLUR)).toBe(
      hyphenate("íþróttafélagið og hraðbrautarframkvæmdir", RITREGLUR)
    );
  });

  test.each([
    "https://example.is/þjóðfélagsumræða",
    "www.þjóðfélagsumræða.is",
    "jon@þjóðfélagsumræða.is",
    "þjóðfélagsumræða2026",
    "path/þjóðfélagsumræða",
    "snake_þjóðfélagsumræða",
    "#þjóðfélagsumræða",
  ])("leaves the token %s untouched", token => {
    expect(hyphenate(token, RITREGLUR)).toBe(token);
    const sentence = `Sjá ${token} og íþróttafélagið`;
    expect(hyphenate(sentence, RITREGLUR)).toBe(
      `Sjá ${token} og í${SHY}þrótta${SHY}fé${SHY}lag${SHY}ið`
    );
  });

  test("never puts a soft hyphen next to an existing hyphen", () => {
    const out = hyphenate("Norður-Þingeyjarsýsla og Suður-Afríka", RITREGLUR);
    expect(out).toContain(SHY);
    expect(out).not.toContain(`-${SHY}`);
    expect(out).not.toContain(`${SHY}-`);
    expect(out.replaceAll(SHY, "")).toBe("Norður-Þingeyjarsýsla og Suður-Afríka");
  });

  test("passes punctuation, whitespace, digits and emoji through", () => {
    const text =
      "Hæ! 👋\n\t«Þjóðfélagsumræða», „hraðbrautarframkvæmdir“ … 1.000 kr. – ok?";
    const out = hyphenate(text, RITREGLUR);
    expect(out).not.toBe(text);
    expect(out.replaceAll(SHY, "")).toBe(text);
  });

  test("keeps the empty string and whitespace-only input", () => {
    expect(hyphenate("")).toBe("");
    expect(hyphenate(" \n ")).toBe(" \n ");
  });

  test("round-trips the Icelandic pangram", () => {
    const pangram = "Kæmi ný öxi hér ykist þjófum nú bæði víl og ádrepa";
    const out = hyphenate(pangram, RITREGLUR);
    expect(show(out)).toBe("Kæmi ný öxi hér yk-ist þjóf-um nú bæði víl og á-drepa");
    expect(out.replaceAll(SHY, "")).toBe(pangram);
  });
});

describe("Unicode normalisation", () => {
  test.each([
    "Þjóðleikhúsið",
    "íþróttafélagið",
    "ástríða",
    "Vaðlaheiðarvegavinnuverkfærageymsluskúr",
  ])("NFD %s hyphenates like NFC", word => {
    const nfd = word.normalize("NFD");
    expect(nfd).not.toBe(word);
    for (const options of [{}, RITREGLUR, { mode: "heading" } as const]) {
      expect(hyphenate(nfd, options)).toBe(hyphenate(word, options));
    }
    expect(hyphenate(nfd, RITREGLUR)).toContain(SHY);
  });

  test("the Þjóðleikhúsið regression: NFD used to lose every break", () => {
    expect(show(hyphenate("Þjóðleikhúsið".normalize("NFD"), RITREGLUR))).toBe(
      "Þjóð-leik-hús-ið"
    );
  });

  test("the pangram in NFD round-trips to its NFC form", () => {
    const pangram = "Kæmi ný öxi hér ykist þjófum nú bæði víl og ádrepa";
    const out = hyphenate(pangram.normalize("NFD"), RITREGLUR);
    expect(out.replaceAll(SHY, "")).toBe(pangram.normalize("NFC"));
    expect(out).toBe(hyphenate(pangram, RITREGLUR));
  });

  test("hyphenateWord counts letters of the NFC form", () => {
    expect(hyphenateWord("Reykjavík".normalize("NFD"), RITREGLUR)).toEqual([6]);
  });
});

describe("official Ritreglur examples", () => {
  test("ritreglur gives víta-mín and á-stríða", () => {
    expect(show(hyphenate("vítamín", RITREGLUR))).toBe("víta-mín");
    expect(show(hyphenate("ástríða", RITREGLUR))).toBe("á-stríða");
  });

  test("the raw patterns alone do not (which is why they are exceptions)", () => {
    expect(show(hyphenate("vítamín", RAW_RITREGLUR))).toBe("vít-am-ín");
    expect(show(hyphenate("ástríða", RAW_RITREGLUR))).toBe("ástríða");
  });

  test("typographic body keeps víta-mín and drops the one-letter á-", () => {
    expect(show(hyphenate("vítamín"))).toBe("víta-mín");
    expect(show(hyphenate("ástríða"))).toBe("ástríða");
  });
});

const HEADING_RITREGLUR = { mode: "heading", rules: "ritreglur" } as const;

describe("name joints (NAME_ENDINGS)", () => {
  test.each([
    ["Akureyri", "Akur-eyri"],
    ["Sigurðardóttir", "Sigurðar-dóttir"],
    ["Guðmundsson", "Guðmunds-son"],
    ["Egilsstaðir", "Egils-staðir"],
    ["Vestmannaeyjar", "Vestmanna-eyjar"],
    ["Stokkseyri", "Stokks-eyri"],
  ])("heading mode breaks %s only at the joint", (word, expected) => {
    expect(show(hyphenate(word, HEADING_RITREGLUR))).toBe(expected);
  });

  test("the typographic heading preset uses the joint of a long name", () => {
    expect(show(hyphenate("Sigurðardóttir", { mode: "heading" }))).toBe(
      "Sigurðar-dóttir"
    );
    expect(show(hyphenate("Guðmundsson", { mode: "heading" }))).toBe("Guðmundsson");
  });

  test.each([
    ["Akureyri", 4],
    ["Sigurðardóttir", 8],
    ["Guðmundsson", 8],
    ["Egilsstaðir", 5],
  ])("body mode keeps a break at the joint of %s", (word, joint) => {
    for (const options of [RITREGLUR, { minWordLength: 4, leftMin: 1, rightMin: 2 }]) {
      expect(hyphenateWord(word, options)).toContain(joint);
    }
  });

  test("a joint the patterns do not allow is ignored: nothing is added or removed", () => {
    // The patterns give Þór-sland; the joint "land" would be Þórs-land.
    for (const options of [
      RITREGLUR,
      HEADING_RITREGLUR,
      { mode: "heading" } as const,
      {},
    ]) {
      expect(show(hyphenate("Þórsland", options))).toBe(
        show(hyphenate("Þórsland", { ...options, exceptions: false }))
      );
    }
    expect(show(hyphenate("Þórsland", HEADING_RITREGLUR))).toBe("Þór-sland");
    expect(show(hyphenate("Hvammseyri", HEADING_RITREGLUR))).toBe("Hvamm-seyri");
  });

  test.each(["majónes", "Jóhannes"])(
    "%s is identical to the raw patterns in every mode",
    word => {
      for (const mode of ["body", "heading"] as const) {
        for (const rules of ["typographic", "ritreglur"] as const) {
          const options = { mode, rules, minWordLength: 4 };
          expect(hyphenate(word, options)).toBe(
            hyphenate(word, { ...options, exceptions: false })
          );
        }
      }
      expect(show(hyphenate("majónes"))).toBe("maj-ónes");
      expect(show(hyphenate("Jóhannes", RITREGLUR))).toBe("Jó-hann-es");
    }
  );

  test("body mode is never changed by NAME_ENDINGS", () => {
    for (const word of [
      "Akureyri",
      "Sigurðardóttir",
      "Guðmundsson",
      "Egilsstaðir",
      "Þórsland",
    ]) {
      for (const options of [RITREGLUR, {}]) {
        expect(hyphenate(word, options)).toBe(
          hyphenate(word, { ...options, exceptions: false })
        );
      }
    }
  });

  test("exceptions win and exceptions:false gives raw patterns", () => {
    expect(show(hyphenate("Reykjavík", HEADING_RITREGLUR))).toBe("Reykja-vík");
    expect(show(hyphenate("Eyjafjallajökull", HEADING_RITREGLUR))).toBe(
      "Eyja-fjalla-jökull"
    );
    expect(show(hyphenate("Akureyri", { ...HEADING_RITREGLUR, exceptions: false }))).toBe(
      "Ak-ur-eyri"
    );
  });

  test("an ending after a stem shorter than 3 letters is not a joint", () => {
    for (const word of ["Jason", "Ison", "Sydney"]) {
      expect(hyphenateWord(word, RITREGLUR)).toEqual(
        hyphenateWord(word, { ...RITREGLUR, exceptions: false })
      );
    }
    expect(show(hyphenate("Ison", HEADING_RITREGLUR))).toBe("I-son");
  });

  test("the list is exported data", () => {
    for (const ending of [
      "dóttir",
      "son",
      "eyri",
      "fjörður",
      "vík",
      "staðir",
      "eyjar",
      "firði",
      "dals",
    ]) {
      expect(NAME_ENDINGS).toContain(ending);
    }
  });
});

describe("acronyms", () => {
  test.each(["UNESCO", "UNICEF", "NATO", "OECD", "SPRONS"])("%s never breaks", word => {
    for (const options of [
      {},
      RITREGLUR,
      HEADING_RITREGLUR,
      { minWordLength: 3, leftMin: 1, rightMin: 1 },
    ]) {
      expect(hyphenate(word, options)).toBe(word);
    }
  });

  test("the size range is documented data", () => {
    expect(ACRONYM_LENGTH).toEqual({ min: 4, max: 8 });
  });

  test("long all-caps words still break", () => {
    const out = hyphenate("KEFLAVÍKURFLUGVÖLLUR", RITREGLUR);
    expect(out).toContain(SHY);
    expect(out.replaceAll(SHY, "")).toBe("KEFLAVÍKURFLUGVÖLLUR");
  });

  test("mixed-case and lower-case words are not acronyms", () => {
    expect(show(hyphenate("Unesco", RITREGLUR))).toContain("-");
    expect(show(hyphenate("unesco", RITREGLUR))).toBe("u-nesco");
  });

  test("skipAcronyms:false hyphenates them like any word", () => {
    expect(show(hyphenate("UNESCO", { ...RITREGLUR, skipAcronyms: false }))).toBe(
      "U-NESCO"
    );
  });

  test("acronyms in a sentence leave the words around them alone", () => {
    expect(show(hyphenate("UNESCO og íþróttafélagið", RITREGLUR))).toBe(
      "UNESCO og í-þrótta-fé-lag-ið"
    );
  });
});

describe("standard abbreviations", () => {
  test("get no soft hyphens inside them", () => {
    const input = "Taktu með t.d. vatn, nesti o.s.frv. og u.þ.b. þ.e.a.s. mat";
    for (const options of [{}, RITREGLUR, { mode: "heading" } as const]) {
      const out = hyphenate(input, options);
      for (const abbreviation of ["t.d.", "o.s.frv.", "u.þ.b.", "þ.e.a.s."]) {
        expect(out).toContain(abbreviation);
      }
    }
  });

  test("do not shield the words around them", () => {
    expect(show(hyphenate("Taktu með t.d. íþróttafélagið o.s.frv.", RITREGLUR))).toBe(
      "Taktu með t.d. í-þrótta-fé-lag-ið o.s.frv."
    );
  });
});

describe("bare domains", () => {
  test("leaves domains without a path untouched", () => {
    const input = "þjóðfélagsumræða.is og sub.hraðbrautarframkvæmdir.is";
    expect(hyphenate(input, RITREGLUR)).toBe(input);
  });

  test("leaves a domain followed by a sentence dot untouched", () => {
    expect(hyphenate("Sjá geirolafs.com.", RITREGLUR)).toBe("Sjá geirolafs.com.");
    // The same word on its own is hyphenated, so the test proves the domain check.
    expect(show(hyphenate("geirolafs", RITREGLUR))).toContain("-");
  });

  test("leaves domains in brackets, with a path or in an email untouched", () => {
    const input =
      "(www.þjóðfélagsumræða.is) og jon.jonsson@þjóðfélag.is, sjá þjóðfélagsumræða.is/x";
    expect(hyphenate(input, RITREGLUR)).toBe(input);
  });

  test("a sentence end is not a domain: dot then space", () => {
    expect(show(hyphenate("Um landsbyggðinni. Næsta þjóðfélagsumræða", RITREGLUR))).toBe(
      "Um lands-byggð-inni. Næsta þjóð-fé-lags-um-ræða"
    );
  });

  test("a sentence end is not a domain: dot at the end of the text", () => {
    expect(show(hyphenate("Um íþróttafélagið.", RITREGLUR))).toBe(
      "Um í-þrótta-fé-lag-ið."
    );
    expect(show(hyphenate("landsbyggðinni.", RITREGLUR))).toBe("lands-byggð-inni.");
  });
});

describe("performance", () => {
  test("hyphenates 5,000 words well inside the bound", () => {
    const vocabulary = VERIFIED.map(([word]) => word).concat([
      "stjórnarráðið",
      "menntamálaráðherra",
      "og",
      "sveitarstjórnarkosningar",
      "umhverfisverndarsamtök",
      "veðurstofa",
      "Kæmi",
      "þjófum",
    ]);
    const words: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const base = vocabulary[i % vocabulary.length] ?? "";
      // Vary every word a little so the per-word cache cannot do all the work.
      words.push(
        i % 3 === 0 ? `${base}${"aeiouyáéíóúæö"[i % 13]}${i % 7 === 0 ? "ð" : ""}` : base
      );
    }
    const text = words.join(" ");

    hyphenate("upphitun"); // parse the patterns once
    const start = performance.now();
    const out = hyphenate(text, RITREGLUR);
    const elapsed = performance.now() - start;

    expect(out.replaceAll(SHY, "")).toBe(text);
    expect(elapsed).toBeLessThan(500);
  });

  test.each([
    ["40,000 letters in a row", "a".repeat(40_000)],
    ["10,000 short words ending in dots", "orð.".repeat(10_000)],
    ["10,000 words with spaces", "orð ".repeat(10_000)],
    ["dotted letters", "a.".repeat(20_000)],
  ])("finishes %s in under 200 ms", (_name, input) => {
    const start = performance.now();
    hyphenate(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("analyzeWord", () => {
  test("a listed word gives its breaks and its = joints", () => {
    expect(analyzeWord("vítamín", RITREGLUR)).toEqual({ breaks: [4], joints: [4] });
    expect(analyzeWord("hraðbrautarframkvæmdir", RITREGLUR)).toEqual({
      breaks: [4, 9, 11, 15, 20],
      joints: [4, 11, 15],
    });
  });

  test("an unlisted word gives its NAME_ENDINGS joint, taken from the patterns' breaks", () => {
    const { breaks, joints } = analyzeWord("Akureyri", RITREGLUR);
    expect(joints).toEqual([4]);
    expect(breaks).toContain(4);
  });

  test("breaks equal hyphenateWord in body mode, and joints are a subset of them", () => {
    for (const word of ["vítamín", "Akureyri", "Sigurðardóttir", "karfa", "Hveragerði"]) {
      for (const options of [RITREGLUR, RAW_RITREGLUR, {}] as const) {
        const { breaks, joints } = analyzeWord(word, options);
        expect(breaks).toEqual(hyphenateWord(word, { ...options, mode: "body" }));
        expect(breaks).toEqual(hyphenateWord(word, options));
        for (const joint of joints) {
          expect(breaks).toContain(joint);
        }
      }
    }
  });

  test("the limits apply to the joints", () => {
    expect(analyzeWord("vítamín", { rules: "ritreglur", leftMin: 5 })).toEqual({
      breaks: [],
      joints: [],
    });
  });

  test("short words and acronyms give nothing", () => {
    expect(analyzeWord("ab")).toEqual({ breaks: [], joints: [] });
    expect(analyzeWord("UNESCO", RITREGLUR)).toEqual({ breaks: [], joints: [] });
  });

  test("hyphenateWord still prefers joints in heading mode", () => {
    expect(hyphenateWord("hraðbrautarframkvæmdir", { mode: "heading" })).toEqual([
      4, 11, 15,
    ]);
  });
});

describe("breakOffsets", () => {
  test("gives the offsets that hyphenate() inserts at", () => {
    const text =
      "Hraðbrautarframkvæmdir á landsbyggðinni, https://hraðbrautarframkvæmdir.is";
    const offsets = breakOffsets(text, RITREGLUR);
    const rebuilt = [...offsets, text.length].reduce(
      (acc, at) => ({ out: acc.out + text.slice(acc.from, at) + SOFT_HYPHEN, from: at }),
      { out: "", from: 0 }
    ).out;
    expect(rebuilt.slice(0, -1)).toBe(hyphenate(text, RITREGLUR));
  });

  test("counts in the cleaned NFC text, without soft hyphens", () => {
    const messy = `Hrað${SOFT_HYPHEN}braut`.normalize("NFD");
    expect(breakOffsets(messy, RITREGLUR)).toEqual(breakOffsets("Hraðbraut", RITREGLUR));
  });
});

describe("character constants", () => {
  test("are the invisible characters", () => {
    expect(SOFT_HYPHEN).toBe("\u00AD");
    expect(NO_BREAK_SPACE).toBe("\u00A0");
    expect(NON_BREAKING_HYPHEN).toBe("\u2011");
  });
});

describe("linking syllables (typographic rules)", () => {
  test.each([
    ["stjórnarvöld", "stjórnar-völd"],
    ["sveitarstjórnarkosningum", "sveitar-stjórnar-kosn-ingum"],
    ["Hvalfjarðargöng", "Hval-fjarðar-göng"],
    ["fyrirspurnir", "fyrir-spurnir"],
    ["ráðuneytisins", "ráðu-neytis-ins"],
    ["Hraðbrautarframkvæmdir", "Hrað-brautar-fram-kvæmdir"],
  ])("%s keeps the break after the genitive, not before it", (word, expected) => {
    expect(show(hyphenate(word))).toBe(expected);
  });

  test("ritreglur keeps every break the patterns allow", () => {
    expect(show(hyphenate("stjórnarvöld", RITREGLUR))).toBe("stjórn-ar-völd");
  });

  test("a syllable followed by only an ending is not a link", () => {
    expect(show(hyphenate("angurs"))).toBe("ang-urs");
  });

  test("a listed word's joints are never dropped", () => {
    expect(show(hyphenate("sveitarstjórnarkosningar"))).toBe(
      "sveitar-stjórnar-kosn-ingar"
    );
    expect(show(hyphenate("veðurstofa"))).toBe("veður-stofa");
  });
});

describe("heading mode falls back when no joint fits", () => {
  test.each([
    ["Aðalsteinsson", "Aðal-steinsson"],
    ["Seltjarnarnes", "Sel-tjarnarnes"],
    ["Hafnarfjarðarbær", "Hafnar-fjarðarbær"],
    ["Akureyrarbær", "Akur-eyrarbær"],
  ])("%s keeps breaks although its name joint is too near the end", (word, expected) => {
    expect(show(hyphenate(word, { mode: "heading" }))).toBe(expected);
  });

  test("name endings only apply to capitalised words", () => {
    expect(analyzeWord("almannalífeyri").joints).toEqual([]);
    expect(analyzeWord("Akureyri", RITREGLUR).joints).toEqual([4]);
  });
});

describe("tokens with digits or a slash", () => {
  test.each([
    ["COVID-19-faraldurinn", "COVID-19-far-aldur-inn"],
    ["2026-sveitarstjórnarkosningarnar", "2026-sveitar-stjórnar-kosn-ing-arnar"],
    ["íþrótta-/tómstundastarfsemi", "íþrótta-/tóm-stunda-starf-semi"],
  ])("%s still breaks its words", (token, expected) => {
    expect(show(hyphenate(token))).toBe(expected);
  });
});

describe("linked joints in heading mode", () => {
  test.each([
    ["sveitarstjórnarkosningum", "sveitar-stjórnar-kosningum"],
    ["Hrafnafjarðarbyggð", "Hrafnafjarðar-byggð"],
    ["KEFLAVÍKURFLUGVÖLLUR", "KEFLAVÍKUR-FLUGVÖLLUR"],
    ["hjúkrunarfræðingar", "hjúkrunar-fræðingar"],
  ])("%s breaks only after its linking syllables", (word, expected) => {
    expect(show(hyphenate(word, { mode: "heading" }))).toBe(expected);
  });

  test("body mode keeps its other breaks", () => {
    expect(show(hyphenate("Hrafnafjarðarbyggð"))).toBe("Hrafna-fjarðar-byggð");
  });
});

describe("dictionary", () => {
  test("your own words win over the patterns and the bundled list", () => {
    expect(show(hyphenate("vefslóðin"))).not.toBe("vef-slóðin");
    // The limits still apply: typographic keeps 3 letters after a break.
    expect(show(hyphenate("vefslóðin", { dictionary: ["vef=slóð-in"] }))).toBe(
      "vef-slóðin"
    );
    expect(show(hyphenate("veðurstofa", { dictionary: ["veð-ur-stofa"] }))).toBe(
      "veður-stofa"
    );
  });

  test("applies with exceptions: false too, and throws on a malformed line", () => {
    expect(
      show(hyphenate("vefslóðin", { dictionary: ["vef=slóð-in"], exceptions: false }))
    ).toBe("vef-slóðin");
    expect(() => hyphenate("orðabókin", { dictionary: ["Orð-a"] })).toThrow();
  });
});

describe("foreign names", () => {
  test("a capitalised word with c, q or w stays whole under typographic rules", () => {
    for (const word of ["Icelandair", "Hollywood", "Commodore", "Walbrook"]) {
      expect(hyphenate(word)).toBe(word);
      expect(hyphenate(word, { mode: "heading", minWordLength: 6 })).toBe(word);
    }
  });

  test("lowercase compounds, old z spelling and Ritreglur still break", () => {
    expect(show(hyphenate("cashewhnetunum"))).toContain("-");
    expect(show(hyphenate("höfuðáherzlu"))).toContain("-");
    expect(show(hyphenate("Icelandair", RITREGLUR))).toContain("-");
  });

  test("a dictionary entry gives a foreign name its breaks", () => {
    expect(show(hyphenate("Icelandair", { dictionary: ["ice=land=air"] }))).toBe(
      "Ice-land-air"
    );
  });
});

describe("heading joints as a preference", () => {
  test('"prefer" keeps the other typographic breaks, "only" the joints', () => {
    expect(show(hyphenate("Hrafnafjarðarbyggð", { mode: "heading" }))).toBe(
      "Hrafnafjarðar-byggð"
    );
    expect(
      show(hyphenate("Hrafnafjarðarbyggð", { mode: "heading", joints: "prefer" }))
    ).toBe("Hrafna-fjarðar-byggð");
  });
});
