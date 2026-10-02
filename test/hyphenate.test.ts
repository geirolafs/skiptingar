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
// The 2020 patterns and the official minimums, nothing else: what the
// typographic rules are turned off to get. Asked for out loud.
const RAW_RITREGLUR = { rules: "ritreglur", exceptions: false } as const;
// The experimental layers are not part of v1 and off by default: tests for
// them ask for them.
const WITH_LIST = { rules: "ritreglur", exceptions: true } as const;
const WITH_SKIP = { rules: "ritreglur", skipAcronyms: true } as const;
// The experimental preset, which is not the default: tests for it ask for it.
const TYPOGRAPHIC = { rules: "typographic" } as const;
// Heading mode finds its joints in the exception list, so it needs the list.
const HEADING_TYPOGRAPHIC = {
  mode: "heading",
  rules: "typographic",
  exceptions: true,
} as const;
const HEADING_RITREGLUR = {
  mode: "heading",
  rules: "ritreglur",
  exceptions: true,
} as const;

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

  test.each(VERIFIED)("with the exception list: %s", (input, expected) => {
    expect(show(hyphenate(input, WITH_LIST))).toBe(expected);
  });

  test("keeps the case of the input", () => {
    expect(hyphenate("Reykjavík", RITREGLUR)).toBe(`Reykja${SHY}vík`);
    expect(hyphenate("REYKJAVÍK", RITREGLUR)).toBe(`REYKJA${SHY}VÍK`);
  });
});

describe("the default rules are typographic", () => {
  test("a word with one letter before the break stays whole", () => {
    expect(hyphenate("ólán")).toBe("ólán");
    expect(hyphenate("ádrepa")).toBe("ádrepa");
    expect(show(hyphenate("ólán", RITREGLUR))).toBe("ó-lán");
    expect(show(hyphenate("ádrepa", RITREGLUR))).toBe("á-drepa");
  });

  test("the default equals rules: 'typographic' in every call", () => {
    const text = "Sigurðardóttir ræddi ástríðu og framkvæmdarvaldið á Akureyri";
    for (const mode of ["body", "heading"] as const) {
      expect(hyphenate(text, { mode })).toBe(hyphenate(text, { mode, ...TYPOGRAPHIC }));
      expect(analyzeWord("Sigurðardóttir", { mode })).toEqual(
        analyzeWord("Sigurðardóttir", { mode, ...TYPOGRAPHIC })
      );
      expect(hyphenateWord("framkvæmdarvaldið", { mode })).toEqual(
        hyphenateWord("framkvæmdarvaldið", { mode, ...TYPOGRAPHIC })
      );
    }
  });

  test("it differs from the official minimums where it should", () => {
    const text = "sveitarstjórnarkosningum Hrafnafjarðarbyggð fornaldarfrægð Icelandair";
    expect(hyphenate(text)).not.toBe(hyphenate(text, RITREGLUR));
  });

  // Each of the three behaviours needs neither the exception list nor heading mode.
  test.each([
    [
      "sveitarstjórnarkosningum",
      "sveitar-stjórnar-kosn-ingum",
      "sveit-ar-stjórn-ar-kosn-ing-um",
    ],
    ["Hrafnafjarðarbyggð", "Hrafna-fjarðar-byggð", "Hrafna-fjarð-ar-byggð"],
    ["fornaldarfrægð", "forn-aldar-frægð", "forn-ald-ar-frægð"],
    ["yfirkjörstjórnar", "yfir-kjör-stjórnar", "yf-ir-kjör-stjórn-ar"],
    ["ólán", "ólán", "ó-lán"],
    ["Icelandair", "Icelandair", "Ic-elandair"],
  ])(
    "%s: typographic by default, Ritreglur when asked",
    (word, typographic, ritreglur) => {
      expect(show(hyphenate(word))).toBe(typographic);
      expect(show(hyphenate(word, { exceptions: false, mode: "body" }))).toBe(
        typographic
      );
      expect(show(hyphenate(word, RITREGLUR))).toBe(ritreglur);
    }
  );

  test("a heading breaks at the joint it finds, with the heading limits", () => {
    expect(show(hyphenate("Sigurðardóttir", HEADING_RITREGLUR))).toBe("Sigurðar-dóttir");
    expect(show(hyphenate("Akureyri", HEADING_RITREGLUR))).toBe("Akur-eyri");
  });

  test("the default mode is body: a joint does not replace the other breaks", () => {
    const word = "hraðbrautarframkvæmdir";
    // The list is on in all three calls, so only `mode` differs: heading mode
    // finds joints in the list, body mode (the default) ignores them.
    const listed = { rules: "ritreglur", exceptions: true } as const;
    expect(hyphenate(word, listed)).toBe(hyphenate(word, { ...listed, mode: "body" }));
    expect(show(hyphenate(word, listed))).toBe("hrað-braut-ar-fram-kvæmd-ir");
    expect(show(hyphenate(word, { ...listed, mode: "heading" }))).toBe(
      "hrað-brautar-fram-kvæmdir"
    );
    expect(show(hyphenate(word, RITREGLUR))).toBe("hrað-braut-ar-fram-kvæmd-ir");
    expect(show(hyphenate(word))).toBe("hrað-brautar-fram-kvæmdir");
  });
});

describe("the v1 defaults: no list, no acronym skip", () => {
  test("the exception list is off: ástríða stays whole, with the list it breaks", () => {
    expect(hyphenate("ástríða", RITREGLUR)).toBe("ástríða");
    expect(hyphenate("ástríða", { ...RITREGLUR, exceptions: true })).toBe(
      `á${SHY}stríða`
    );
    expect(show(hyphenate("vítamín", RITREGLUR))).toBe("vít-am-ín");
    expect(show(hyphenate("vítamín", { ...RITREGLUR, exceptions: true }))).toBe(
      "víta-mín"
    );
  });

  test("the acronym skip is off: UNESCO breaks under the patterns, with the skip it stays whole", () => {
    expect(show(hyphenate("UNESCO", RITREGLUR))).toBe("U-NESCO");
    expect(show(hyphenate("UNICEF", RITREGLUR))).toBe("UN-ICEF");
    expect(hyphenate("UNESCO", { skipAcronyms: true })).toBe("UNESCO");
    expect(hyphenate("UNICEF", { skipAcronyms: true })).toBe("UNICEF");
  });

  test("by default no option changes the output of the patterns", () => {
    const text = "UNESCO, ástríða, vítamín og Reykjavík í Sigurðardóttir";
    expect(hyphenate(text)).toBe(
      hyphenate(text, { exceptions: false, skipAcronyms: false })
    );
  });

  test("a heading without the list has no joints to prefer", () => {
    expect(
      show(hyphenate("Sigurðardóttir", { mode: "heading", rules: "ritreglur" }))
    ).toBe("Sig-urð-ar-dótt-ir");
  });
});

describe("typographic presets", () => {
  test("body drops short-word and short-margin breaks", () => {
    expect(hyphenate("ólán", TYPOGRAPHIC)).toBe("ólán");
    expect(show(hyphenate("ádrepa", TYPOGRAPHIC))).toBe("ádrepa");
    expect(show(hyphenate("íþróttafélagið", TYPOGRAPHIC))).toBe("íþrótta-fé-lagið");
  });

  test("body keeps breaks that fit inside the limits", () => {
    expect(show(hyphenate("þjóðfélagsumræða", TYPOGRAPHIC))).toBe("þjóð-fé-lags-um-ræða");
    expect(show(hyphenate("Þjóðfélagsumræðan", TYPOGRAPHIC))).toBe(
      "Þjóð-fé-lags-um-ræðan"
    );
  });

  test("heading skips words shorter than 12 letters", () => {
    expect(hyphenate("Reykjavík", HEADING_TYPOGRAPHIC)).toBe("Reykjavík");
  });

  test("heading uses only the joints of a known compound", () => {
    expect(
      show(hyphenate("Vaðlaheiðarvegavinnuverkfærageymsluskúr", HEADING_TYPOGRAPHIC))
    ).toBe("Vaðla-heiðar-vega-vinnu-verkfæra-geymslu-skúr");
    expect(show(hyphenate("hönnunarstofa", HEADING_TYPOGRAPHIC))).toBe("hönnunar-stofa");
  });

  test("heading falls back to patterns when the word has no joints", () => {
    // "upplýsingatækniráðgjöf" is not in the list, so patterns with heading limits apply.
    expect(show(hyphenate("upplýsingatækniráðgjöf", HEADING_TYPOGRAPHIC))).toBe(
      "upp-lýs-inga-tækni-ráð-gjöf"
    );
  });

  test("heading with ritreglur uses joints, with ritreglur limits", () => {
    expect(show(hyphenate("Eyjafjallajökull", HEADING_RITREGLUR))).toBe(
      "Eyja-fjalla-jökull"
    );
  });

  test("exceptions:false ignores joints in heading mode", () => {
    const raw = show(
      hyphenate("Vaðlaheiðarvegavinnuverkfærageymsluskúr", {
        ...HEADING_TYPOGRAPHIC,
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
    for (const options of [{}, RITREGLUR, WITH_LIST, { mode: "heading" } as const]) {
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
    for (const options of [{}, RITREGLUR, WITH_LIST, { mode: "heading" } as const]) {
      expect(hyphenate(nfd, options)).toBe(hyphenate(word, options));
    }
    expect(hyphenate(nfd, WITH_LIST)).toContain(SHY);
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
  test("ritreglur with the exception list gives víta-mín and á-stríða", () => {
    expect(show(hyphenate("vítamín", WITH_LIST))).toBe("víta-mín");
    expect(show(hyphenate("ástríða", WITH_LIST))).toBe("á-stríða");
  });

  test("the patterns alone, which is the default, do not (which is why the list exists)", () => {
    expect(show(hyphenate("vítamín", RAW_RITREGLUR))).toBe("vít-am-ín");
    expect(show(hyphenate("ástríða", RAW_RITREGLUR))).toBe("ástríða");
  });

  test("typographic body with the list keeps víta-mín and drops the one-letter á-", () => {
    expect(show(hyphenate("vítamín", { ...TYPOGRAPHIC, exceptions: true }))).toBe(
      "víta-mín"
    );
    expect(show(hyphenate("ástríða", { ...TYPOGRAPHIC, exceptions: true }))).toBe(
      "ástríða"
    );
  });
});

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
    expect(show(hyphenate("Sigurðardóttir", HEADING_TYPOGRAPHIC))).toBe(
      "Sigurðar-dóttir"
    );
    expect(show(hyphenate("Guðmundsson", HEADING_TYPOGRAPHIC))).toBe("Guðmundsson");
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
    for (const options of [WITH_LIST, HEADING_RITREGLUR]) {
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
          const options = { mode, rules, minWordLength: 4, exceptions: true };
          expect(hyphenate(word, options)).toBe(
            hyphenate(word, { ...options, exceptions: false })
          );
        }
      }
      expect(show(hyphenate("majónes", RITREGLUR))).toBe("maj-ón-es");
      expect(show(hyphenate("Jóhannes", RITREGLUR))).toBe("Jó-hann-es");
      expect(show(hyphenate("majónes", TYPOGRAPHIC))).toBe("maj-ónes");
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
      for (const options of [WITH_LIST, RITREGLUR, {}]) {
        expect(hyphenate(word, options)).toBe(
          hyphenate(word, { ...options, exceptions: false })
        );
      }
    }
  });

  test("exceptions win when on, and exceptions:false gives raw patterns", () => {
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
      expect(hyphenateWord(word, WITH_LIST)).toEqual(
        hyphenateWord(word, { ...WITH_LIST, exceptions: false })
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

describe("acronyms (skipAcronyms, experimental)", () => {
  test.each(["UNESCO", "UNICEF", "NATO", "OECD", "SPRONS"])(
    "%s never breaks with the skip on",
    word => {
      for (const options of [
        WITH_SKIP,
        { ...WITH_SKIP, mode: "heading" } as const,
        { skipAcronyms: true, minWordLength: 3, leftMin: 1, rightMin: 1 },
      ]) {
        expect(hyphenate(word, options)).toBe(word);
      }
    }
  );

  test("the skip is off by default", () => {
    expect(show(hyphenate("UNESCO", RITREGLUR))).toBe("U-NESCO");
    expect(show(hyphenate("UNICEF", RITREGLUR))).toBe("UN-ICEF");
    expect(show(hyphenate("UNESCO", { ...RITREGLUR, skipAcronyms: false }))).toBe(
      "U-NESCO"
    );
    // Under the typographic default they stay whole anyway, but for another
    // reason: the c in a capitalised name (the foreign-name rule), not the skip.
    expect(hyphenate("UNESCO")).toBe("UNESCO");
  });

  test("the size range is documented data", () => {
    expect(ACRONYM_LENGTH).toEqual({ min: 4, max: 8 });
  });

  test("long all-caps words still break with the skip on", () => {
    const out = hyphenate("KEFLAVÍKURFLUGVÖLLUR", WITH_SKIP);
    expect(out).toContain(SHY);
    expect(out.replaceAll(SHY, "")).toBe("KEFLAVÍKURFLUGVÖLLUR");
  });

  test("mixed-case and lower-case words are not acronyms", () => {
    expect(show(hyphenate("Unesco", WITH_SKIP))).toContain("-");
    expect(show(hyphenate("unesco", WITH_SKIP))).toBe("u-nesco");
  });

  test("acronyms in a sentence leave the words around them alone", () => {
    expect(show(hyphenate("UNESCO og íþróttafélagið", WITH_SKIP))).toBe(
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
    expect(analyzeWord("vítamín", WITH_LIST)).toEqual({ breaks: [4], joints: [4] });
    expect(analyzeWord("hraðbrautarframkvæmdir", WITH_LIST)).toEqual({
      breaks: [4, 9, 11, 15, 20],
      joints: [4, 11, 15],
    });
  });

  test("an unlisted word gives its NAME_ENDINGS joint, taken from the patterns' breaks", () => {
    const { breaks, joints } = analyzeWord("Akureyri", WITH_LIST);
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

  test("without the list there are no listed words and no name joints", () => {
    expect(analyzeWord("vítamín", RITREGLUR).joints).toEqual([]);
    expect(analyzeWord("Akureyri", RITREGLUR).joints).toEqual([]);
  });

  test("the limits apply to the joints", () => {
    expect(analyzeWord("vítamín", { ...WITH_LIST, leftMin: 5 })).toEqual({
      breaks: [],
      joints: [],
    });
  });

  test("short words give nothing, and acronyms too with the skip on", () => {
    expect(analyzeWord("ab")).toEqual({ breaks: [], joints: [] });
    expect(analyzeWord("UNESCO", WITH_SKIP)).toEqual({ breaks: [], joints: [] });
  });

  test("hyphenateWord still prefers joints in heading mode", () => {
    expect(hyphenateWord("hraðbrautarframkvæmdir", HEADING_RITREGLUR)).toEqual([
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
    expect(show(hyphenate(word, TYPOGRAPHIC))).toBe(expected);
  });

  test("typographic is the default, so the break before the genitive goes; ritreglur keeps every break", () => {
    expect(show(hyphenate("stjórnarvöld", RITREGLUR))).toBe("stjórn-ar-völd");
    expect(show(hyphenate("stjórnarvöld"))).toBe("stjórnar-völd");
  });

  test("a syllable followed by only an ending is not a link", () => {
    expect(show(hyphenate("angurs", TYPOGRAPHIC))).toBe("ang-urs");
  });

  test("a listed word's joints are never dropped", () => {
    const listed = { ...TYPOGRAPHIC, exceptions: true } as const;
    expect(show(hyphenate("sveitarstjórnarkosningar", listed))).toBe(
      "sveitar-stjórnar-kosn-ingar"
    );
    expect(show(hyphenate("veðurstofa", listed))).toBe("veður-stofa");
  });
});

describe("heading mode falls back when no joint fits", () => {
  test.each([
    ["Aðalsteinsson", "Aðal-steinsson"],
    ["Seltjarnarnes", "Sel-tjarnarnes"],
    ["Hafnarfjarðarbær", "Hafnar-fjarðarbær"],
    ["Akureyrarbær", "Akur-eyrarbær"],
  ])("%s keeps breaks although its name joint is too near the end", (word, expected) => {
    expect(show(hyphenate(word, HEADING_TYPOGRAPHIC))).toBe(expected);
  });

  test("name endings only apply to capitalised words", () => {
    expect(analyzeWord("almannalífeyri", WITH_LIST).joints).toEqual([]);
    expect(analyzeWord("Akureyri", WITH_LIST).joints).toEqual([4]);
  });
});

describe("tokens with digits or a slash", () => {
  test.each([
    ["COVID-19-faraldurinn", "COVID-19-far-aldur-inn"],
    ["2026-sveitarstjórnarkosningarnar", "2026-sveitar-stjórnar-kosn-ing-arnar"],
    ["íþrótta-/tómstundastarfsemi", "íþrótta-/tóm-stunda-starf-semi"],
  ])("%s still breaks its words", (token, expected) => {
    expect(show(hyphenate(token, TYPOGRAPHIC))).toBe(expected);
  });
});

describe("linked joints in heading mode", () => {
  test.each([
    ["sveitarstjórnarkosningum", "sveitar-stjórnar-kosningum"],
    ["Hrafnafjarðarbyggð", "Hrafnafjarðar-byggð"],
    ["KEFLAVÍKURFLUGVÖLLUR", "KEFLAVÍKUR-FLUGVÖLLUR"],
    ["hjúkrunarfræðingar", "hjúkrunar-fræðingar"],
  ])("%s breaks only after its linking syllables", (word, expected) => {
    expect(show(hyphenate(word, HEADING_TYPOGRAPHIC))).toBe(expected);
  });

  test("body mode keeps its other breaks", () => {
    expect(show(hyphenate("Hrafnafjarðarbyggð", TYPOGRAPHIC))).toBe(
      "Hrafna-fjarðar-byggð"
    );
  });
});

describe("dictionary", () => {
  test("your own words win over the patterns and the bundled list", () => {
    expect(show(hyphenate("vefslóðin", TYPOGRAPHIC))).not.toBe("vef-slóðin");
    // The limits still apply: typographic keeps 3 letters after a break.
    expect(
      show(hyphenate("vefslóðin", { ...TYPOGRAPHIC, dictionary: ["vef=slóð-in"] }))
    ).toBe("vef-slóðin");
    expect(
      show(hyphenate("veðurstofa", { ...TYPOGRAPHIC, dictionary: ["veð-ur-stofa"] }))
    ).toBe("veður-stofa");
  });

  test("wins over the bundled list when that is on", () => {
    expect(
      show(hyphenate("veðurstofa", { ...WITH_LIST, dictionary: ["veðurst-ofa"] }))
    ).toBe("veðurst-ofa");
  });

  test("applies with the list off, and throws on a malformed line", () => {
    expect(
      show(
        hyphenate("vefslóðin", {
          ...TYPOGRAPHIC,
          dictionary: ["vef=slóð-in"],
          exceptions: false,
        })
      )
    ).toBe("vef-slóðin");
    expect(() => hyphenate("orðabókin", { dictionary: ["Orð-a"] })).toThrow();
  });
});

describe("foreign names", () => {
  test("a capitalised word with c, q or w stays whole under typographic rules", () => {
    for (const word of ["Icelandair", "Hollywood", "Commodore", "Walbrook"]) {
      expect(hyphenate(word, TYPOGRAPHIC)).toBe(word);
      expect(hyphenate(word, { ...HEADING_TYPOGRAPHIC, minWordLength: 6 })).toBe(word);
    }
  });

  test("lowercase compounds, old z spelling and Ritreglur still break", () => {
    expect(show(hyphenate("cashewhnetunum", TYPOGRAPHIC))).toContain("-");
    expect(show(hyphenate("höfuðáherzlu", TYPOGRAPHIC))).toContain("-");
    expect(show(hyphenate("Icelandair", RITREGLUR))).toContain("-");
    expect(hyphenate("Icelandair")).toBe("Icelandair");
  });

  test("a dictionary entry gives a foreign name its breaks", () => {
    expect(
      show(hyphenate("Icelandair", { ...TYPOGRAPHIC, dictionary: ["ice=land=air"] }))
    ).toBe("Ice-land-air");
  });
});

describe("heading joints as a preference", () => {
  test('"prefer" keeps the other typographic breaks, "only" the joints', () => {
    expect(show(hyphenate("Hrafnafjarðarbyggð", HEADING_TYPOGRAPHIC))).toBe(
      "Hrafnafjarðar-byggð"
    );
    expect(
      show(hyphenate("Hrafnafjarðarbyggð", { ...HEADING_TYPOGRAPHIC, joints: "prefer" }))
    ).toBe("Hrafna-fjarðar-byggð");
  });
});
