import { describe, expect, mock, test } from "bun:test";
import { analyzeWord, handleSkiptingarRequest, hyphenate, localeDetails } from "../src";
import {
  configureSkiptingar,
  remoteResult,
  requestRemote,
  subscribeRemote,
  usesEndpoint,
} from "../src/client/remote";
import { resolveLocaleDetails } from "../src/resolve-locale-details";
import { runRemoteItems } from "../src/server";

const JSON_TYPE = { "content-type": "application/json" };

const post = (body: unknown) =>
  new Request("http://x/api", {
    method: "POST",
    headers: JSON_TYPE,
    body: JSON.stringify(body),
  });

/** A different four-letter word for each index: aaaa, baaa, caaa ... */
const fourLetters = (index: number) =>
  [0, 1, 2, 3]
    .map(place => String.fromCharCode(97 + (Math.floor(index / 26 ** place) % 26)))
    .join("");

/** `count` different dictionary lines of `length` characters, each with one break. */
const dictionaryLines = (count: number, length = 64) =>
  Array.from({ length: count }, (_, index) => {
    const rest = length - 5;
    return `${fourLetters(index)}${"x".repeat(rest >> 1)}-${"y".repeat(rest - (rest >> 1))}`;
  });

describe("handleSkiptingarRequest", () => {
  test("answers process and analyze items in order", async () => {
    const response = await handleSkiptingarRequest(
      post({
        items: [
          {
            op: "process",
            text: "Hraðbrautarframkvæmdir",
            options: { localeDetails: false },
          },
          { op: "analyze", word: "vítamín", options: { betterBreaks: false } },
        ],
      })
    );
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: unknown[] };
    expect(results).toEqual([
      hyphenate("Hraðbrautarframkvæmdir"),
      analyzeWord("vítamín", { betterBreaks: false }),
    ]);
  });

  test("localeDetails is on by default: a request adds locale details unless it says localeDetails: false", async () => {
    const text = 'Hann sagði "orð" um Hraðbrautarframkvæmdir, 1.000 kr.';
    const response = await handleSkiptingarRequest(
      post({
        items: [
          { op: "process", text },
          { op: "process", text, options: {} },
          { op: "process", text, options: { localeDetails: false } },
          { op: "process", text, options: { localeDetails: true } },
          { op: "process", text, options: { localeDetails: { quotes: false } } },
        ],
      })
    );
    const { results } = (await response.json()) as { results: string[] };
    const localeDetailsOut = hyphenate(localeDetails(text));
    expect(results[0]).toBe(localeDetailsOut);
    expect(results[1]).toBe(localeDetailsOut);
    expect(results[3]).toBe(localeDetailsOut);
    expect(results[0]).toContain("„orð“");
    expect(results[2]).toBe(hyphenate(text));
    expect(results[2]).toContain('"orð"');
    expect(results[4]).toContain('"orð"');
    expect(results[4]).toContain("1.000\u00A0kr.");
  });

  test("runRemoteItems follows the same default", () => {
    const text = 'Hann sagði "orð"';
    expect(runRemoteItems([{ op: "process", text }])).toEqual([
      hyphenate(localeDetails(text)),
    ]);
    expect(
      runRemoteItems([{ op: "process", text, options: { localeDetails: false } }])
    ).toEqual([hyphenate(text)]);
  });

  test("resolveLocaleDetails is on unless turned off", () => {
    expect(resolveLocaleDetails(undefined)).toEqual({});
    expect(resolveLocaleDetails(false)).toBe(false);
    expect(resolveLocaleDetails(true)).toEqual({});
    expect(resolveLocaleDetails({ dashes: true })).toEqual({ dashes: true });
  });

  test("refuses other methods, bad bodies and oversized requests", async () => {
    const get = await handleSkiptingarRequest(new Request("http://x/api"));
    expect(get.status).toBe(405);
    const notJson = new Request("http://x/api", {
      method: "POST",
      headers: JSON_TYPE,
      body: "{",
    });
    expect((await handleSkiptingarRequest(notJson)).status).toBe(400);
    expect((await handleSkiptingarRequest(post({ items: [{ op: "x" }] }))).status).toBe(
      400
    );
    const big = post({ items: [{ op: "process", text: "a".repeat(60_000) }] });
    expect((await handleSkiptingarRequest(big)).status).toBe(400);
    const many = post({
      items: Array.from({ length: 3 }, () => ({ op: "analyze", word: "a" })),
    });
    expect((await handleSkiptingarRequest(many, { maxItems: 2 })).status).toBe(400);
  });
});

describe("handleSkiptingarRequest abuse limits", () => {
  const job = (text: string, options?: unknown) => ({ op: "process", text, options });
  const run = (
    items: unknown[],
    limits?: Parameters<typeof handleSkiptingarRequest>[1]
  ) => handleSkiptingarRequest(post({ items }), limits);

  test("the request the client sends still gets the same answer", async () => {
    // What `outputOptions` and `useAnalyzeWord` put on the wire.
    const text = 'Hann sagði "orð" um Hraðbrautarframkvæmdir, 1.000 kr.';
    const page = {
      betterBreaks: true,
      localeDetails: { singleLetter: true, lastWords: true, dashes: true },
    };
    const response = await run([
      job(text, page),
      job(text, { betterBreaks: false, localeDetails: false }),
      job(text),
      { op: "analyze", word: "vítamín", options: { betterBreaks: false } },
      { op: "analyze", word: "vítamín" },
    ]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: unknown[] };
    expect(results).toEqual(
      runRemoteItems([
        { op: "process", text, options: page as never },
        { op: "process", text, options: { betterBreaks: false, localeDetails: false } },
        { op: "process", text },
        { op: "analyze", word: "vítamín", options: { betterBreaks: false } },
        { op: "analyze", word: "vítamín" },
      ])
    );
  });

  test("accepts every option the package has", async () => {
    const response = await run([
      job("Hraðbrautarframkvæmdir", {
        betterBreaks: false,
        minWordLength: 4,
        leftMin: 1,
        rightMin: 2,
        hyphenChar: "-",
        dictionary: ["forn=aldar=frægð"],
        localeDetails: {
          quotes: true,
          singleLetter: true,
          lastWords: true,
          dashes: true,
          units: true,
          dates: true,
          ordinals: true,
          abbreviations: true,
          titles: true,
          phoneNumbers: true,
        },
      }),
    ]);
    expect(response.status).toBe(200);
  });

  test("a huge hyphenChar is a 400, not a 300 MB answer", async () => {
    const response = await run([
      job("Hraðbrautarframkvæmdir", { hyphenChar: "x".repeat(100_000) }),
    ]);
    expect(response.status).toBe(400);
    expect((await response.text()).length).toBeLessThan(200);
    const refused = [
      "",
      "xyz",
      "xy",
      "\ud800",
      "\udc00",
      "\ud800\ud800",
      "\ud83d",
      "\n",
      "\u0000",
      "\u2028",
      "\u2029",
      1,
      null,
      ["x"],
    ];
    for (const hyphenChar of refused) {
      expect((await run([job("orð", { hyphenChar })])).status).toBe(400);
    }
    // One character: a hyphen, a soft hyphen, a Unicode hyphen, an emoji, a word joiner.
    for (const hyphenChar of ["-", "\u00AD", "\u2010", "😀", "\u2060"]) {
      expect((await run([job("orð", { hyphenChar })])).status).toBe(200);
    }
  });

  test("a lone surrogate cannot make the answer 12 times larger", async () => {
    // JSON.stringify writes each lone surrogate as the 6 bytes \ud800.
    const text = "sveitarstjórnarkosningar ".repeat(1900);
    const response = await run([job(text, { hyphenChar: "\ud800\ud800" })]);
    expect(response.status).toBe(400);
    expect((await response.text()).length).toBeLessThan(200);
  });

  test("an unknown option key is a 400, in every place options go", async () => {
    const bad = [
      job("orð", { nope: true }),
      job("orð", { localeDetails: { nope: true } }),
      job("orð", JSON.parse('{"__proto__": {"betterBreaks": false}}')),
      job("orð", { constructor: 1 }),
      job("orð", { toString: 1 }),
      { op: "analyze", word: "orð", options: { localeDetails: false } },
      { op: "analyze", word: "orð", options: { nope: 1 } },
    ];
    for (const item of bad) {
      expect((await run([item])).status).toBe(400);
    }
  });

  test("rules is not an option any more, so it is a 400", async () => {
    for (const rules of ["typographic", "ritreglur"]) {
      for (const item of [
        job("orð", { rules }),
        { op: "analyze", word: "orð", options: { rules } },
      ]) {
        const response = await run([item]);
        expect(response.status).toBe(400);
        expect(await response.text()).toContain("unknown option");
      }
    }
  });

  test("the experimental options are not public, so they are a 400", async () => {
    const experimental = [
      { mode: "heading" },
      { joints: "prefer" },
      { exceptions: true },
      { skipAcronyms: true },
    ];
    for (const options of experimental) {
      for (const item of [job("orð", options), { op: "analyze", word: "orð", options }]) {
        const response = await run([item]);
        expect(response.status).toBe(400);
        expect(await response.text()).toContain("unknown option");
      }
    }
  });

  test("prefixes and numbers are not localeDetails options any more, so they are a 400", async () => {
    for (const localeDetails of [{ prefixes: true }, { numbers: false }]) {
      const response = await run([job("orð", { localeDetails })]);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("unknown option");
    }
  });

  test("preset is not a localeDetails option, so it is a 400", async () => {
    for (const preset of ["typographic", "default"]) {
      const response = await run([job("orð", { localeDetails: { preset } })]);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("unknown option");
    }
  });

  test("option values must be the right type and in range", async () => {
    const bad = [
      { betterBreaks: "no" },
      { betterBreaks: 0 },
      { minWordLength: 65 },
      { leftMin: -1 },
      { rightMin: 1.5 },
      { minWordLength: "4" },
      { minWordLength: 1e9 },
      { dictionary: "forn=aldar" },
      { dictionary: Array.from({ length: 201 }, () => "ab") },
      { dictionary: ["a".repeat(65)] },
      { dictionary: [1] },
      { localeDetails: "yes" },
      { localeDetails: [] },
      { localeDetails: null },
      { localeDetails: { quotes: "yes" } },
    ];
    for (const options of bad) {
      expect((await run([job("orð", options)])).status).toBe(400);
    }
    expect((await run([job("orð", null)])).status).toBe(400);
    expect((await run([job("orð", [])])).status).toBe(400);
  });

  test("a dictionary is parsed before any text is, and is used", async () => {
    // A line that does not parse, and a duplicate: a 400 even when no word
    // of the text is long enough to look in the dictionary.
    for (const dictionary of [["Forn=aldar"], ["forn=aldar", "forn-aldar"], ["a b"]]) {
      expect((await run([job("orð", { dictionary })])).status).toBe(400);
    }
    expect((await run([job("orð", { dictionary: ["forn=aldar"] })])).status).toBe(200);
    // The biggest dictionary there is, and a word that it lists: the word
    // is broken where the line says.
    const lines = dictionaryLines(200);
    expect(lines).toHaveLength(200);
    expect(new Set(lines).size).toBe(200);
    expect(lines.every(line => line.length === 64)).toBe(true);
    const listed = (lines[7] ?? "").replace("-", "");
    const response = await run([
      job(`orð ${listed}`, { dictionary: lines, hyphenChar: "|", localeDetails: false }),
    ]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: string[] };
    const at = (lines[7] ?? "").indexOf("-");
    expect(results[0]).toBe(`orð ${listed.slice(0, at)}|${listed.slice(at)}`);
  });

  test("the lines of a dictionary count against maxCharacters", async () => {
    const dictionary = dictionaryLines(200);
    // 12 800 characters of dictionary each: three fit in 50 000, four do not.
    const withDictionary = () => job("orð", { dictionary });
    expect((await run([1, 2, 3].map(withDictionary))).status).toBe(200);
    expect((await run([1, 2, 3, 4].map(withDictionary))).status).toBe(400);
    expect((await run([withDictionary()], { maxCharacters: 12_000 })).status).toBe(400);
  });

  test("a request must say it is JSON, or it is a 415", async () => {
    const body = JSON.stringify({ items: [job("orð")] });
    const send = (headers?: HeadersInit) =>
      handleSkiptingarRequest(
        new Request("http://x/api", { method: "POST", body, headers })
      );
    // A body with no header is text/plain, which a cross-origin form can send.
    expect((await send()).status).toBe(415);
    expect((await send({ "content-type": "text/plain" })).status).toBe(415);
    expect(
      (await send({ "content-type": "application/x-www-form-urlencoded" })).status
    ).toBe(415);
    expect((await send({ "content-type": "application/json" })).status).toBe(200);
    expect(
      (await send({ "content-type": "Application/JSON; charset=utf-8" })).status
    ).toBe(200);
  });

  test("a body over the size limit is a 413, with or without content-length", async () => {
    const limits = { maxCharacters: 1000, maxItems: 5 };
    const small = JSON.stringify({ items: [job("orð")] });
    const huge = JSON.stringify({
      items: [job("orð", { hyphenChar: "x".repeat(2_000_000) })],
    });

    const declared = new Request("http://x/api", {
      method: "POST",
      body: huge,
      headers: { ...JSON_TYPE, "content-length": String(huge.length) },
    });
    expect((await handleSkiptingarRequest(declared, limits)).status).toBe(413);

    // No header, and a header that lies: the stream is counted.
    const streamOf = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          const bytes = new TextEncoder().encode(text);
          for (let at = 0; at < bytes.length; at += 4096) {
            controller.enqueue(bytes.subarray(at, at + 4096));
          }
          controller.close();
        },
      });
    const streamed = (headers: HeadersInit) =>
      new Request("http://x/api", {
        method: "POST",
        body: streamOf(huge),
        headers: { ...JSON_TYPE, ...headers },
        duplex: "half",
      } as RequestInit);
    expect((await handleSkiptingarRequest(streamed({}), limits)).status).toBe(413);
    expect(
      (await handleSkiptingarRequest(streamed({ "content-length": "10" }), limits)).status
    ).toBe(413);

    const ok = await handleSkiptingarRequest(
      new Request("http://x/api", {
        method: "POST",
        headers: JSON_TYPE,
        body: streamOf(small),
      }),
      limits
    );
    expect(ok.status).toBe(200);
    // The default limits still take 50 000 characters of Icelandic.
    expect((await run([job("orð ".repeat(12_500))])).status).toBe(200);
  });

  test("a request with no body is a 400", async () => {
    const empty = new Request("http://x/api", { method: "POST", headers: JSON_TYPE });
    expect((await handleSkiptingarRequest(empty)).status).toBe(400);
  });

  test("a word over 200 characters is a 400; addresses and spaced text pass", async () => {
    const word = "sveitarstjórnarkosningar".repeat(9);
    expect(word.length).toBeGreaterThan(200);
    expect((await run([job(word)])).status).toBe(400);
    expect((await run([job(`Orð ${word} orð`)])).status).toBe(400);
    expect((await run([{ op: "analyze", word }])).status).toBe(400);
    expect((await run([job(word, { localeDetails: false })])).status).toBe(400);
    // Just inside the limit, and a limit of the caller's own.
    expect((await run([job("a".repeat(200))])).status).toBe(200);
    expect((await run([job("a".repeat(201))])).status).toBe(400);
    expect((await run([job("a".repeat(30))], { maxWordLength: 20 })).status).toBe(400);
    // A long line of short words is fine.
    expect((await run([job("orð ".repeat(5000))])).status).toBe(200);

    const url = `https://example.is/${"sveitarstjórnarkosningar".repeat(100)}`;
    const started = performance.now();
    const response = await run([
      job(`Sjá (${url}) og www.example.is/${"a".repeat(500)}.`),
    ]);
    expect(response.status).toBe(200);
    expect(performance.now() - started).toBeLessThan(500);
    // A bare word glued to an address still counts.
    expect((await run([job(`${word}${url}`)])).status).toBe(400);
  });
});

describe("the remote client", () => {
  test("sends one request per tick, caches answers, and falls back on failure", async () => {
    const calls: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return handleSkiptingarRequest(
        new Request("http://x/api", {
          method: "POST",
          headers: init?.headers,
          body: String(init?.body),
        })
      );
    }) as unknown as typeof fetch;
    try {
      configureSkiptingar({ endpoint: "/api" });
      let notified = 0;
      const stop = subscribeRemote(() => {
        notified += 1;
      });
      requestRemote("a", { op: "process", text: "Sveitarstjórnarkosningar" });
      requestRemote("b", { op: "analyze", word: "vítamín" });
      requestRemote("a", { op: "process", text: "Sveitarstjórnarkosningar" });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(calls).toHaveLength(1);
      expect((calls[0] as { items: unknown[] }).items).toHaveLength(2);
      expect(remoteResult("a")).toBe(hyphenate("Sveitarstjórnarkosningar"));
      expect(notified).toBeGreaterThan(0);

      globalThis.fetch = mock(
        async () => new Response("no", { status: 500 })
      ) as unknown as typeof fetch;
      requestRemote("c", { op: "process", text: "Orðabók" });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(usesEndpoint()).toBe(false);
      stop();
    } finally {
      globalThis.fetch = realFetch;
      configureSkiptingar({ endpoint: undefined });
    }
  });
});
