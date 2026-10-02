import { describe, expect, test } from "bun:test";
import { NUMBER_UNITS, SPACED_ABBREVIATIONS, typeset, typesetSegments } from "../src";
import { NUMBER_PREFIXES } from "../src/typeset";

const NB = " ";

/** Shows no-break spaces as "~" so expectations stay readable. */
function show(text: string): string {
  return text.replaceAll(NB, "~");
}

describe("rule 1: number and unit", () => {
  test.each([
    ["Kostar 1.000 kr. í dag", "Kostar 1.000~kr. í dag"],
    ["Það eru 5 km eftir", "Það eru 5~km eftir"],
    ["Úti er 20 °C", "Úti er 20~°C"],
    ["Lengd 3 m", "Lengd 3~m"],
    ["Þyngd 12 kg", "Þyngd 12~kg"],
    ["Úti er 68 °F", "Úti er 68~°F"],
    ["Verð 1.500 ISK", "Verð 1.500~ISK"],
    ["Verð 10 EUR", "Verð 10~EUR"],
    ["Tekur 5 mín. í viðbót", "Tekur 5~mín. í viðbót"],
    ["Fundur í 2 klst. í dag", "Fundur í 2~klst. í dag"],
    ["Verð 2,5 kr", "Verð 2,5~kr"],
  ])("binds %p", (input, expected) => {
    expect(show(typeset(input))).toBe(expected);
  });

  test.each([
    "Ég á 5 gulrætur",
    "Hann er 5 kílómetra frá",
    "Það eru 5 lítrar",
    "Bókin heitir 1984 og er löng",
    "Kaffi 5 og te",
    "Afsláttur 50 % í dag",
    "Úti er 17 ° hiti",
    "Afsláttur 50% í dag",
  ])("leaves %p alone", input => {
    expect(typeset(input)).toBe(input);
  });

  test("the unit list is exported and covers the required units", () => {
    for (const unit of [
      "kr.",
      "kr",
      "ISK",
      "EUR",
      "USD",
      "°C",
      "°F",
      "km",
      "m",
      "cm",
      "mm",
      "kg",
      "g",
      "l",
      "ml",
      "mín.",
      "klst.",
      "sek.",
      "ár",
      "bls.",
    ]) {
      expect(NUMBER_UNITS).toContain(unit);
    }
    // Icelandic writes 50% and 17° without a space (Íslensk réttritun 7.53).
    expect(NUMBER_UNITS).not.toContain("%");
    expect(NUMBER_UNITS).not.toContain("°");
  });
});

describe("rule 2: ordinals and dates", () => {
  test.each([
    ["Þann 30. september", "Þann 30.~september"],
    ["Í 1. sæti", "Í 1.~sæti"],
    ["Á 2. hæð", "Á 2.~hæð"],
    ["Í september 2026 kom", "Í september~2026 kom"],
    ["Í sept. 2026 kom", "Í sept.~2026 kom"],
    ["Þann 30. september 2026", "Þann 30.~september~2026"],
    ["Í Janúar 2026", "Í Janúar~2026"],
  ])("binds %p", (input, expected) => {
    expect(show(typeset(input))).toBe(expected);
  });

  test.each([
    "Hann kom 3. Hún fór",
    "Í september 20 manns",
    "Í september 20260 manns",
    "Í september kom hún",
  ])("leaves %p alone", input => {
    expect(typeset(input)).toBe(input);
  });
});

describe("abbreviation and number", () => {
  test.each([
    ["Sjá nr. 5 hér", "Sjá nr.~5 hér"],
    ["Sjá bls. 12 hér", "Sjá bls.~12 hér"],
    ["Fundur kl. 14:30 í dag", "Fundur kl.~14:30 í dag"],
    ["Sjá gr. 3 hér", "Sjá gr.~3 hér"],
    ["Sjá sbr. 3. gr. laganna", "Sjá sbr.~3.~gr. laganna"],
    ["Sjá mgr. 2 hér", "Sjá mgr.~2 hér"],
    ["Sjá tölul. 4 hér", "Sjá tölul.~4 hér"],
    ["Það voru u.þ.b. 50 manns", "Það voru u.þ.b.~50 manns"],
    ["Það voru ca. 20 manns", "Það voru ca.~20 manns"],
    ["Nr. 5 kom fyrst", "Nr.~5 kom fyrst"],
    ["(sjá bls. 12)", "(sjá bls.~12)"],
    ["bls. 12", "bls.~12"],
  ])("binds %p", (input, expected) => {
    expect(show(typeset(input))).toBe(expected);
  });

  test.each([
    "Sjá nr. fimm hér",
    "Sjá bls.12 hér",
    "Sjá bls.  12 hér",
    "Sjá xnr. 5 hér",
    "Sjá anr. 5 hér",
    "Sjá bls. hér 12",
    "Það var ca. tuttugu",
  ])("leaves %p alone", input => {
    expect(typeset(input)).toBe(input);
  });

  test("never changes text inside a URL", () => {
    for (const input of [
      "https://example.is/nr. 5",
      "Sjá www.example.is/nr.%205 nr. x",
    ]) {
      expect(typeset(input)).toBe(input);
    }
  });

  test("is idempotent and keeps the length", () => {
    const text = "Sjá bls. 12, nr. 5 og kl. 14:30, u.þ.b. 50 stöðum";
    const once = typeset(text);
    expect(once).toHaveLength(text.length);
    expect(typeset(once)).toBe(once);
  });

  test("works across segment borders", () => {
    expect(typesetSegments(["Sjá bls.", " 12 og nr. ", "5"]).map(show)).toEqual([
      "Sjá bls.",
      "~12 og nr.~",
      "5",
    ]);
  });

  test("bls. works before a number (page 12) and after one (300 pages)", () => {
    expect(show(typeset("Sjá bls. 12 og 300 bls. bók"))).toBe(
      "Sjá bls.~12 og 300~bls. bók"
    );
  });

  test("the prefix list is exported", () => {
    for (const prefix of [
      "nr.",
      "bls.",
      "kl.",
      "gr.",
      "sbr.",
      "mgr.",
      "tölul.",
      "u.þ.b.",
      "ca.",
    ]) {
      expect(NUMBER_PREFIXES).toContain(prefix);
    }
  });
});

describe("standard abbreviations without spaces", () => {
  const STANDARD = "t.d. o.s.frv. þ.e. þ.e.a.s. m.a. o.fl. u.þ.b. a.m.k.";

  test("pass through byte-identical", () => {
    expect(typeset(STANDARD)).toBe(STANDARD);
    expect(typeset(STANDARD, { dashes: true, singleLetter: true })).toBe(STANDARD);
    const sentence = "Taktu með t.d. vatn, nesti o.s.frv. og fleira, þ.e.a.s. mat.";
    expect(typeset(sentence)).toBe(sentence);
  });

  test("are not treated as domains", () => {
    const text = 'Hann sagði "t.d. o.s.frv. þ.e.a.s. u.þ.b." og fór 1990-2000';
    expect(typeset(text, { dashes: true })).toBe(
      "Hann sagði „t.d. o.s.frv. þ.e.a.s. u.þ.b.“ og fór 1990–\u20602000"
    );
  });
});

describe("older spaced abbreviations (tolerated, not standard)", () => {
  test.each([
    ["Til dæmis, t. d. hér", "Til dæmis, t.~d. hér"],
    ["Bækur o. s. frv. og fleira", "Bækur o.~s.~frv. og fleira"],
    ["Það er þ. e. að segja", "Það er þ.~e. að segja"],
    ["Það er þ. e. a. s. svo", "Það er þ.~e.~a.~s. svo"],
    ["Hann m. a. las", "Hann m.~a. las"],
    ["Hann o. fl. las", "Hann o.~fl. las"],
    ["Um u. þ. b. tíu", "Um u.~þ.~b. tíu"],
    ["Að a. m. k. tveir", "Að a.~m.~k. tveir"],
  ])("binds %p", (input, expected) => {
    expect(show(typeset(input))).toBe(expected);
  });

  test.each(["Hann hét. d. eitt", "Lokað. e. Opið", "Það er þ. eitthvað"])(
    "leaves %p alone",
    input => {
      expect(typeset(input)).toBe(input);
    }
  );

  test("the list of older spaced forms is exported", () => {
    expect(SPACED_ABBREVIATIONS).toContainEqual(["t.", "d."]);
    expect(SPACED_ABBREVIATIONS).toContainEqual(["þ.", "e.", "a.", "s."]);
  });
});

describe("rule 4: titles", () => {
  test.each([
    ["Sjá dr. Jón Jónsson", "Sjá dr.~Jón Jónsson"],
    ["Sjá sr. Anna", "Sjá sr.~Anna"],
    ["Sjá próf. Anna", "Sjá próf.~Anna"],
    ["Sjá hr. Jón", "Sjá hr.~Jón"],
  ])("binds %p", (input, expected) => {
    expect(show(typeset(input))).toBe(expected);
  });

  test.each(["Sjá dr. jón", "Sjá sandr. Jón", "Sjá dr. 5"])("leaves %p alone", input => {
    expect(typeset(input)).toBe(input);
  });
});

describe("rule 5: quotes", () => {
  test.each([
    ['Hann sagði "orð" og fór', "Hann sagði „orð“ og fór"],
    ["Hann sagði “orð” og fór", "Hann sagði „orð“ og fór"],
    ['("orð")', "(„orð“)"],
    ['"orð"', "„orð“"],
    ["\"Hann sagði 'nei' við mig\"", "„Hann sagði ‚nei‘ við mig“"],
    ["“Hann sagði ‘nei’ við mig”", "„Hann sagði ‚nei‘ við mig“"],
    ['"it\'s fine"', "„it's fine“"],
  ])("converts %p", (input, expected) => {
    expect(typeset(input)).toBe(expected);
  });

  test("a paired single quote outside double quotes marks a meaning: ‚…‘", () => {
    expect(typeset("Orðið fákur merkir 'hestur'.")).toBe("Orðið fákur merkir ‚hestur‘.");
    expect(typeset("Hann sagði 'nei' við mig")).toBe("Hann sagði ‚nei‘ við mig");
    expect(typeset("Orðið fákur merkir ‘hestur’.")).toBe("Orðið fákur merkir ‚hestur‘.");
    expect(typeset("Sjá 'nr. 5' hér")).toBe(`Sjá ‚nr.${NB}5‘ hér`);
  });

  test("a meaning quote and a double quote in the same text", () => {
    expect(typeset("Orðið 'fákur' merkir \"hestur\", sagði hún.")).toBe(
      "Orðið ‚fákur‘ merkir „hestur“, sagði hún."
    );
    expect(typeset("\"komdu 'strax' heim\"")).toBe("„komdu ‚strax‘ heim“");
  });

  test("meaning quotes are idempotent and cross segment borders", () => {
    for (const input of [
      "Orðið fákur merkir 'hestur'.",
      "Orðið 'fákur' merkir \"hestur\", sagði hún.",
      "rock 'n' roll og 'twas",
    ]) {
      expect(typeset(typeset(input))).toBe(typeset(input));
    }
    const segments = typesetSegments(["Orðið fákur merkir '", "hestur", "'."]);
    expect(segments).toEqual(["Orðið fákur merkir ‚", "hestur", "‘."]);
    expect(typesetSegments(segments)).toEqual(segments);
  });

  test("an unopened closing single quote is left alone", () => {
    expect(typeset('"hundanna\' skál"')).toBe("„hundanna' skál“");
  });

  test("pairs quotes across segment borders", () => {
    expect(typesetSegments(['Hann sagði "', "orð", '" og fór'])).toEqual([
      "Hann sagði „",
      "orð",
      "“ og fór",
    ]);
  });

  test("can be turned off", () => {
    expect(typeset('Hann sagði "orð"', { quotes: false })).toBe('Hann sagði "orð"');
  });
});

describe("rule 6: single-letter words (opt-in)", () => {
  test("binds one-letter words when enabled", () => {
    expect(show(typeset("Hann fór á fund í dag", { singleLetter: true }))).toBe(
      "Hann fór á~fund í~dag"
    );
  });

  test("is off by default", () => {
    expect(typeset("Hann fór á fund í dag")).toBe("Hann fór á fund í dag");
  });

  test("leaves longer words alone", () => {
    const text = "Þetta er gott";
    expect(typeset(text, { singleLetter: true })).toBe(text);
  });
});

describe("rule 7: last two words (opt-in)", () => {
  test("binds the last two words when enabled", () => {
    expect(show(typeset("Hann kom heim.", { lastWords: true }))).toBe("Hann kom~heim.");
  });

  test("works across segments", () => {
    const out = typesetSegments(["Hann kom ", "heim."], { lastWords: true });
    expect(out.map(show)).toEqual(["Hann kom~", "heim."]);
  });

  test("is off by default", () => {
    expect(typeset("Hann kom heim.")).toBe("Hann kom heim.");
  });

  test("skips a last word longer than ten letters", () => {
    const text = "Hann sá þjóðfélagsumræða";
    expect(typeset(text, { lastWords: true })).toBe(text);
  });

  test("skips a single word", () => {
    expect(typeset("Heim.", { lastWords: true })).toBe("Heim.");
  });
});

describe("rule 8: dashes", () => {
  test.each([
    ["Árin 1990-2000 voru góð", "Árin 1990–\u20602000 voru góð"],
    ["Reykjavík - Akureyri", "Reykjavík\u00a0– Akureyri"],
  ])("converts %p", (input, expected) => {
    expect(typeset(input, { dashes: true })).toBe(expected);
  });

  test.each([
    "Suður-Afríka",
    "Dagsetning 2026-09-30",
    "Hún fór - 5 - 3",
    "https://example.is/1990-2000",
  ])("leaves %p alone", input => {
    expect(typeset(input, { dashes: true })).toBe(input);
  });

  test.each([
    ["bls. 12-34", "bls.~12–\u206034"],
    ["Árin 1990-2000", "Árin 1990–\u20602000"],
    ["Árin 2020-21", "Árin 2020–\u206021"],
    ["Sjá 5-10 manns", "Sjá 5–\u206010 manns"],
    ["(5-10)", "(5–\u206010)"],
  ])("still converts the range in %p", (input, expected) => {
    expect(show(typeset(input, { dashes: true }))).toBe(expected);
  });

  test.each([
    "AB12-34CD",
    "A4-2024",
    "ISO 8601-1",
    "F-35",
    "ISO 8601-1:2019",
    "Dagsetning 2020-12-31",
    "12-34CD",
    "AB12-34",
  ])("a hyphen that touches a letter or a part number is not a range: %p", input => {
    expect(typeset(input, { dashes: true })).toBe(input);
  });

  test("a phone number and a kennitala keep their hyphen with the numbers rule off", () => {
    for (const input of ["Sími 555-1234", "Kt. 010190-2939"]) {
      expect(typeset(input, { dashes: true, numbers: false })).not.toContain("–\u2060");
    }
  });

  test("never turns a phone number or kennitala hyphen into an en dash", () => {
    // With the numbers rule off they keep the plain hyphen. With it on (the
    // default) they get U+2011, which is not an en dash either.
    for (const input of ["Sími 555-1234", "Kennitala 010101-2939"]) {
      expect(typeset(input, { dashes: true, numbers: false })).toBe(input);
      expect(typeset(input, { dashes: true })).toBe(input.replace("-", "\u2011"));
      expect(typeset(input, { dashes: true })).not.toContain("–\u2060");
    }
  });

  test("is on by default", () => {
    expect(show(typeset("Árin 1990-2000 og a - b"))).toBe(
      "Árin 1990–\u20602000 og a~– b"
    );
    expect(typeset("Árin 1990-2000 og a - b")).toBe(
      typeset("Árin 1990-2000 og a - b", { dashes: true })
    );
  });

  test("dashes: false leaves ranges and spaced hyphens alone", () => {
    expect(typeset("Árin 1990-2000 og a - b", { dashes: false })).toBe(
      "Árin 1990-2000 og a - b"
    );
  });
});

describe("numbers: kennitala and phone numbers stay on one line", () => {
  const NBH = "\u2011";

  test.each([
    ["kt. 010190-2939", `kt.${NB}010190${NBH}2939`],
    ["sími 555-1234", `sími 555${NBH}1234`],
    ["sími 555 1234", `sími 555${NB}1234`],
    ["kt. 010190 2939", `kt.${NB}010190${NB}2939`],
    ["+354 555 1234", `+354${NB}555${NB}1234`],
    ["+354 555-1234", `+354${NB}555${NBH}1234`],
    ["Kt. 010190-2939, sími 555-1234.", `Kt.${NB}010190${NBH}2939, sími 555${NBH}1234.`],
  ])("binds %p", (input, expected) => {
    expect(typeset(input)).toBe(expected);
  });

  test.each([
    "Árin 1990-2000 voru góð",
    "0101902939",
    "5551234",
    "Sími 555-12345",
    "Talan 12 555 1234",
    "Kostar 1.555-1234",
    "Dagsetning 2026-09-30",
    "Sími 55-1234",
  ])("leaves %p alone", input => {
    // With dashes off: on by default it reads a hyphen that is not a phone
    // number or kennitala shape ("555-12345", "55-1234") as a range.
    expect(typeset(input, { dashes: false })).toBe(input);
  });

  test("leaves numbers inside a URL alone", () => {
    for (const input of [
      "https://example.is/555-1234",
      "Sjá www.example.is/010190-2939 núna",
      "example.is/555 1234",
    ]) {
      expect(typeset(input)).toBe(input);
    }
  });

  test("is idempotent, keeps the length and works across segments", () => {
    const text = "kt. 010190-2939, sími 555-1234 eða +354 555 1234";
    const once = typeset(text);
    expect(once).toHaveLength(text.length);
    expect(typeset(once)).toBe(once);
    expect(typesetSegments(["sími 555-", "1234"])).toEqual([`sími 555${NBH}`, "1234"]);
  });

  test("can be turned off", () => {
    expect(typeset("sími 555-1234", { numbers: false })).toBe("sími 555-1234");
  });

  test("a range becomes an en dash while a phone number keeps its hyphen", () => {
    expect(typeset("Árin 1990-2000 og sími 555-1234")).toBe(
      `Árin 1990–\u20602000 og sími 555${NBH}1234`
    );
  });
});

describe("review regressions", () => {
  const NBH = "\u2011";

  test.each([
    "a555-1234b",
    "A010190-2939B",
    "１２555-1234",
    "sími 555-1234b",
    "x+354 555 1234",
  ])("numbers leaves %p alone (letters or digits of any script next to it)", input => {
    expect(typeset(input)).toBe(input);
  });

  test("numbers still binds a number that stands alone next to punctuation", () => {
    expect(typeset("(555-1234)")).toBe(`(555${NBH}1234)`);
    expect(typeset("sími: 555-1234.")).toBe(`sími: 555${NBH}1234.`);
  });

  test("a curly right single quote is never an opener", () => {
    expect(typeset("Ég sá ’ann skella’ á nösum.")).toBe("Ég sá ’ann skella’ á nösum.");
    expect(typeset("Orðið fákur merkir ‘hestur’.")).toBe("Orðið fákur merkir ‚hestur‘.");
    expect(typeset("Orðið fákur merkir 'hestur'.")).toBe("Orðið fákur merkir ‚hestur‘.");
  });

  test("a quoted URL is idempotent: the closer written by pass 1 stays outside the URL", () => {
    const input = "Sjá ‘https://example.is/x’ og hundanna' skál.";
    const once = typeset(input);
    expect(once).toBe("Sjá ‚https://example.is/x‘ og hundanna' skál.");
    expect(typeset(once)).toBe(once);
  });

  test("typographic quotes at the end of a URL are not part of it", () => {
    for (const [input, expected] of [
      ["„https://example.is/x“ núna", "„https://example.is/x“ núna"],
      ["‚https://example.is/x‘ núna", "‚https://example.is/x‘ núna"],
      ["“https://example.is/x” núna", "„https://example.is/x“ núna"],
    ] as const) {
      expect(typeset(input, { dashes: true })).toBe(expected);
    }
    // The URL itself is untouched even with quotes hugging it.
    expect(typeset('"https://example.is/1990-2000"', { dashes: true })).toBe(
      "„https://example.is/1990-2000“"
    );
  });

  test.each([
    "Sjá 'nr. 5'.",
    'Sjá "nr. 5" hér',
    "Sjá „nr. 5“ hér",
    "Sjá ‚nr. 5‘ hér",
    "(nr. 5)",
  ])("a number prefix after an opening quote or bracket is bound: %p", input => {
    expect(typeset(input)).toContain(`nr.${NB}5`);
  });

  test("Sjá 'nr. 5'. gives the no-break space and the meaning quotes", () => {
    expect(typeset("Sjá 'nr. 5'.")).toBe(`Sjá ‚nr.${NB}5‘.`);
  });

  test("typeset(typeset(x)) equals typeset(x) for tricky inputs", () => {
    const inputs = [
      "Sjá ‘https://example.is/x’ og hundanna' skál.",
      "Ég sá ’ann skella’ á nösum.",
      "Sjá 'nr. 5'.",
      "\"'nei'\"",
      "‘a ’ og 'b'",
      "'a \"b' c\" d'",
      "Orðið 'fákur' merkir \"hestur\", sagði hún.",
      "rock 'n' roll og 'twas",
      '„https://example.is/x“ og ‚www.example.is‘ og "jon@example.is"',
      "sími 555-1234 og +354 555 1234, kt. 010190-2939",
      "Sjá bls. 12 og 300 bls. bók, kl. 14.30 (nr. 5)",
      "a555-1234b １２555-1234",
      "‘’ ‚‘ „“ \"\" ''",
    ];
    for (const input of inputs) {
      for (const options of [{}, { preset: "typographic" } as const]) {
        const once = typeset(input, options);
        expect(typeset(once, options)).toBe(once);
      }
    }
  });
});

describe("sep. as a September abbreviation", () => {
  test.each([
    ["Þann 30. sep. 2026", `Þann 30.${NB}sep.${NB}2026`],
    ["Þann 30. sept. 2026", `Þann 30.${NB}sept.${NB}2026`],
    ["Í sep. 2026 kom hún", `Í sep.${NB}2026 kom hún`],
  ])("binds %p", (input, expected) => {
    expect(typeset(input)).toBe(expected);
  });

  test("leaves sep. without a year alone", () => {
    expect(typeset("Í sep. kom hún")).toBe("Í sep. kom hún");
  });
});

describe("options", () => {
  const text = 'Hann fór á "fund" 1990-2000 og kom heim.';

  test("the default sets ranges but leaves one-letter words and the last two words", () => {
    expect(show(typeset(text))).toBe("Hann fór á „fund“ 1990–\u20602000 og kom heim.");
  });

  test("the typographic preset turns on the rules that are off by default", () => {
    expect(show(typeset(text, { preset: "typographic" }))).toBe(
      "Hann fór á~„fund“ 1990–\u20602000 og kom~heim."
    );
  });

  test("an explicit option beats the preset", () => {
    const out = typeset(text, { preset: "typographic", dashes: false });
    expect(out).toContain("1990-2000");
  });
});

describe("quote regressions", () => {
  test("a single quote right after an opening double quote converts on the first run", () => {
    const input = "\"'nei'\"";
    expect(typeset(input)).toBe("„‚nei‘“");
    expect(typeset(typeset(input))).toBe(typeset(input));
    const segments = typesetSegments(['"', "'nei'", '"']);
    expect(segments).toEqual(["„", "‚nei‘", "“"]);
    expect(typesetSegments(segments)).toEqual(segments);
  });

  test("an unmatched apostrophe is left exactly as typed", () => {
    expect(typeset("Hann sagði 'twas fine")).toBe("Hann sagði 'twas fine");
    expect(typeset('"Hann sagði \'twas fine"')).toBe("„Hann sagði 'twas fine“");
  });

  test("an unmatched double quote is left as typed, not turned into an unclosed „", () => {
    expect(typeset('Hann sagði "orð')).toBe('Hann sagði "orð');
    expect(typeset('orð" og fleira')).toBe('orð" og fleira');
    expect(typeset('Hann sagði "orð" og "fór')).toBe('Hann sagði „orð“ og "fór');
  });

  test("single quotes convert only as a pair, and a pair inside double quotes stays inside", () => {
    expect(typeset("'nei' sagði hann")).toBe("‚nei‘ sagði hann");
    expect(typeset("„Hann sagði ‚nei og fór“")).toBe("„Hann sagði ‚nei og fór“");
    expect(typeset("„Hann 'sagði“ og fór 'nei'")).toBe("„Hann 'sagði“ og fór ‚nei‘");
    expect(typeset("\"Hann 'sagði\" og fór nei'")).toBe("„Hann 'sagði“ og fór nei'");
  });

  test("mixed quote input is idempotent", () => {
    for (const input of [
      "\"'nei'\"",
      "“Hann sagði ‘nei’”",
      '"a \'b\' c" og "d',
      "\"it's 'quoted' here\"",
    ]) {
      expect(typeset(typeset(input))).toBe(typeset(input));
    }
  });
});

describe("URL protection", () => {
  test("a quote inside a URL is never converted", () => {
    const url = "https://example.is/?q='x'";
    expect(typeset(`Hann sagði 'sjá ${url} nú'.`)).toBe(`Hann sagði ‚sjá ${url} nú‘.`);
    expect(typeset(`Slóðin ${url} og 'nei'`)).toBe(`Slóðin ${url} og ‚nei‘`);
    expect(typeset(`"Hann sagði 'sjá ${url} nú'."`)).toBe(
      `„Hann sagði ‚sjá ${url} nú‘.“`
    );
  });

  test("only unbalanced trailing punctuation is trimmed from a URL", () => {
    expect(typeset("\"sjá 'https://example.is/x' og\"")).toBe(
      "„sjá ‚https://example.is/x‘ og“"
    );
    expect(typeset("(sjá https://example.is/a_(b)) og 5 km", { dashes: true })).toBe(
      `(sjá https://example.is/a_(b)) og 5${NB}km`
    );
    expect(typeset("Sjá https://example.is/1990-2000.", { dashes: true })).toBe(
      "Sjá https://example.is/1990-2000."
    );
  });

  test.each([
    "ftp://example.is/1990-2000",
    "file:///tmp/1990-2000",
    "example.is/1990-2000",
    "sub.example.co.uk/a-b/1990-2000",
    "Sjá www.example.is/1990-2000",
    "jon-1990-2000@example.is",
    "example.xn--p1ai/1990-2000",
    "localhost:3000/1990-2000",
    "192.168.0.1/1990-2000",
    "192.168.0.1:8080/1990-2000",
    "example.is:3000/1990-2000",
    "example.is?years=1990-2000",
    "mailto:jon@example.is?subject=1990-2000",
    "[::1]:3000/1990-2000",
  ])("leaves %p untouched", input => {
    expect(typeset(input, { preset: "typographic" })).toBe(input);
  });

  test("leaves a bare domain without a path untouched and quotes around it", () => {
    expect(typeset('Sjá "geirolafs.com" og 1990-2000.', { dashes: true })).toBe(
      "Sjá „geirolafs.com“ og 1990–\u20602000."
    );
  });

  test("a dotted clock time binds to kl. and is not a domain or a number with a unit", () => {
    expect(typeset("Fundur kl. 14.30 í dag")).toBe(`Fundur kl.${NB}14.30 í dag`);
    expect(typeset("Fundur kl. 14.30 í 1. sal")).toBe(
      `Fundur kl.${NB}14.30 í 1.${NB}sal`
    );
    expect(typeset("Fundur 14.30 í dag")).toBe("Fundur 14.30 í dag");
  });

  test("a time or a ratio is not a host and port", () => {
    // "kl." binds to the time (abbreviation rule); 14:30 is still not a host:port.
    expect(typeset("Fundur kl. 14:30 í 1. sal")).toBe(
      `Fundur kl.${NB}14:30 í 1.${NB}sal`
    );
    expect(typeset("Staðan 2:1 í 30. mínútu")).toBe(`Staðan 2:1 í 30.${NB}mínútu`);
  });

  test("still typesets text around a bare-domain URL", () => {
    expect(typeset("Árin 1990-2000 á example.is/1990-2000 nú", { dashes: true })).toBe(
      "Árin 1990–\u20602000 á example.is/1990-2000 nú"
    );
  });
});

describe("NFC normalisation", () => {
  test("a decomposed letter is read as one letter", () => {
    const nfc = "á fund";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(typeset(nfd, { singleLetter: true })).toBe(`á${NB}fund`);
    expect(typeset(nfc, { singleLetter: true })).toBe(`á${NB}fund`);
  });

  test("returns NFC segments and keeps the segment count", () => {
    const out = typesetSegments(["Sjá ".normalize("NFD"), "á fund".normalize("NFD")], {
      singleLetter: true,
    });
    expect(out).toEqual(["Sjá ", `á${NB}fund`]);
    expect(out.every(segment => segment === segment.normalize("NFC"))).toBe(true);
  });
});

describe("performance", () => {
  test.each([
    ["40,000 letters in a row", "a".repeat(40_000)],
    ["40,000 characters of words", "orð ".repeat(10_000)],
    ["a long run of dots after a scheme", `https://${".".repeat(40_000)}`],
    ["a long run of dotted letters", "a.".repeat(20_000)],
  ])("finishes %s in under 200 ms", (_name, input) => {
    for (const options of [{}, { preset: "typographic" } as const]) {
      const start = performance.now();
      typeset(input, options);
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});

describe("safety", () => {
  const mixed = [
    "Sjá \"https://example.is/a-b/1990-2000?x='y'\" og jon@example.is,",
    "eða www.example.is/5 km þann 30. september 2026 kl. 5 á Hótel Sögu.",
    'Dr. Anna sagði: "Það kostar 1.000 kr. - t. d. í dag." Þ. e. a. s. dýrt.',
    "Kæmi ný öxi hér ykist þjófum nú bæði víl og ádrepa",
  ].join(" ");

  test("never touches URLs or email addresses", () => {
    const out = typeset(mixed, { preset: "typographic" });
    for (const protectedText of [
      "https://example.is/a-b/1990-2000?x='y'",
      "jon@example.is",
      "www.example.is/5 km".split(" ")[0] ?? "",
    ]) {
      expect(out).toContain(protectedText);
    }
    expect(out).toContain("„https://example.is/a-b/1990-2000?x='y'“");
  });

  test("keeps the length and the count of segments", () => {
    const segments = ['Hann sagði "', "1.000 ", "kr.", '" og t. ', "d. fór"];
    const out = typesetSegments(segments, { preset: "typographic" });
    expect(out).toHaveLength(segments.length);
    for (const [index, part] of out.entries()) {
      expect(part.length).toBe(segments[index]?.length ?? -1);
    }
  });

  test("is idempotent", () => {
    for (const options of [{}, { preset: "typographic" } as const]) {
      const once = typeset(mixed, options);
      expect(typeset(once, options)).toBe(once);
    }
    const segments = ['Hann "', "sagði ‘nei’", '" 30. ', "september 5 ", "km á fund"];
    const once = typesetSegments(segments, { preset: "typographic" });
    expect(typesetSegments(once, { preset: "typographic" })).toEqual(once);
  });

  test("typeset equals the first segment of typesetSegments", () => {
    expect(typeset(mixed)).toBe(typesetSegments([mixed])[0]);
  });

  test("handles empty input", () => {
    expect(typeset("")).toBe("");
    expect(typesetSegments([])).toEqual([]);
    expect(typesetSegments(["", ""], { preset: "typographic" })).toEqual(["", ""]);
  });
});

describe("every rule can be turned off", () => {
  test.each([
    ["units", "Verð 1.000 kr."],
    ["dates", "Lokað í sept. 2027"],
    ["ordinals", "Hún lenti í 1. sæti"],
    ["prefixes", "Sjá bls. 12"],
    ["titles", "Spurðu dr. Jón"],
  ] as const)("%s: false leaves %p as typed", (option, input) => {
    expect(typeset(input)).not.toBe(input);
    expect(typeset(input, { [option]: false })).toBe(input);
  });
});

describe("more rules", () => {
  test.each([
    ["árið 1990. en svo", "árið 1990. en svo"],
    ["Jón G. Sigurðsson", "Jón G.~Sigurðsson"],
    ["J. K. Rowling", "J.~K.~Rowling"],
    ["kt. 450190-2939", "kt.~450190‑2939"],
    ["s. 555 1234", "s.~555~1234"],
    ["10. ág. 2026 og febr. 2027", "10.~ág.~2026 og febr.~2027"],
  ])("%p becomes %p", (input, expected) => {
    expect(show(typeset(input)).replaceAll("‑", "‑")).toBe(expected);
  });
});

describe("more dashes", () => {
  test.each([
    ["kl. 14.30-16.00", "kl.~14.30–\u206016.00"],
    ["18.-21. ágúst", "18.–\u206021.~ágúst"],
    ["15. mars-14. apríl", "15.~mars–\u206014.~apríl"],
    ["„komdu“ - og", "„komdu“~– og"],
    ["orð – næsta", "orð~– næsta"],
  ])("%p becomes %p", (input, expected) => {
    expect(show(typeset(input, { dashes: true }))).toBe(expected);
  });

  test.each(["v1.2-3", "COVID-19", "Hún fór - 5 - 3"])("leaves %p alone", input => {
    expect(typeset(input, { dashes: true })).toBe(input);
  });
});

describe("ranges stay on one line", () => {
  test("a word joiner follows the dash of a range, once", () => {
    const once = typeset("Árin 1990-2010 og kl. 14.30-16.00", { dashes: true });
    expect(once).toBe("Árin 1990–⁠2010 og kl. 14.30–⁠16.00");
    expect(typeset(once, { dashes: true })).toBe(once);
  });

  test("a typed en dash in a range is joined too, a spaced one is not", () => {
    expect(typeset("1990–2010 og orð – orð", { dashes: true })).toBe(
      "1990–⁠2010 og orð – orð"
    );
  });

  test("the joiner lands in the right segment", () => {
    expect(typesetSegments(["Árin 1990-", "2010"], { dashes: true })).toEqual([
      "Árin 1990–⁠",
      "2010",
    ]);
  });

  test("nothing is inserted without dashes, or inside a URL", () => {
    expect(typeset("1990–2010", { dashes: false })).toBe("1990–2010");
    expect(typeset("1990–2010")).toBe("1990–\u20602010");
    expect(typeset("Sjá example.is/1990–2010", { dashes: true })).toBe(
      "Sjá example.is/1990–2010"
    );
  });

  test("a day stays with its month in any case", () => {
    expect(typeset("Fundurinn 12. Des. 2026")).toBe("Fundurinn 12. Des. 2026");
  });
});
