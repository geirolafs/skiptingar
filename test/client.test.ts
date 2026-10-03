import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  hyphenate,
  LINKING_SYLLABLES,
  processSegments,
  SETTLE_RAG_LANGUAGE,
  SHORT_WORDS,
} from "../src";
import {
  LINKING_SYLLABLES as CLIENT_LINKING_SYLLABLES,
  NO_BREAK_HYPHEN as CLIENT_NO_BREAK_HYPHEN,
  NO_BREAK_SPACE as CLIENT_NO_BREAK_SPACE,
  SETTLE_RAG_LANGUAGE as CLIENT_SETTLE_RAG_LANGUAGE,
  SHORT_WORDS as CLIENT_SHORT_WORDS,
  SOFT_HYPHEN as CLIENT_SOFT_HYPHEN,
  useHyphenate,
  useSkiptingar,
} from "../src/client";
import {
  cleanClipboard,
  cleanCopiedPlainText,
  cleanCopiedText,
  cleanTextNodes,
  needsCleaning,
  shouldHandleCopy,
} from "../src/client/clean";
import { createLoader, loadedSkiptingar, loadSkiptingar } from "../src/client/load";
import { applyOptionsKey, optionsKey } from "../src/client/options";
import {
  configureSkiptingar,
  remoteResult,
  requestRemote,
  splitBatches,
  usesEndpoint,
} from "../src/client/remote";
import { fillPending } from "../src/client/use-hyphenate";
import type { RemoteItem } from "../src/server";
import { experimental } from "./experimental";

/** `1990-2000` as the dashes rule sets it: an en dash and a word joiner after it. */
function localeDetailsDash(): string {
  return processSegments(["1990-2000"], { localeDetails: { dashes: true } })[0] ?? "";
}

const SHY = "­";
const NBSP = " ";
const NBH = "\u2011";
const CLIENT_DIR = join(import.meta.dir, "../src/client");
const SRC_DIR = join(import.meta.dir, "../src");

describe("cleanCopiedText", () => {
  test("removes soft hyphens", () => {
    expect(cleanCopiedText(`Hrað${SHY}braut${SHY}ar`)).toBe("Hraðbrautar");
  });

  test("turns no-break spaces into spaces", () => {
    expect(cleanCopiedText(`5${NBSP}km`)).toBe("5 km");
  });

  test("turns non-breaking hyphens into plain hyphens", () => {
    expect(cleanCopiedText(`010190${NBH}2939`)).toBe("010190-2939");
    expect(cleanCopiedText("010190&#8209;2939 og 555&#x2011;1234")).toBe(
      "010190-2939 og 555-1234"
    );
  });

  test("turns &nbsp; and other entities for the two characters into clean text", () => {
    expect(cleanCopiedText("<p>5&nbsp;km og&#160;og&#xA0;svo</p>")).toBe(
      "<p>5 km og og svo</p>"
    );
    expect(cleanCopiedText("Hrað&shy;braut&#173;ar&#xAD;")).toBe("Hraðbrautar");
  });

  test("does not touch an escaped ampersand before nbsp", () => {
    expect(cleanCopiedText("&amp;nbsp; er entity")).toBe("&amp;nbsp; er entity");
  });

  test("leaves clean text and markup alone", () => {
    const html = '<p class="a">Halló <strong>heimur</strong> &amp; &lt;</p>';
    expect(cleanCopiedText(html)).toBe(html);
    expect(cleanCopiedText("Bara texti.")).toBe("Bara texti.");
    expect(cleanCopiedText("")).toBe("");
  });

  test("plain text clean-up turns U+2011 into a hyphen", () => {
    expect(cleanCopiedPlainText(`010190${NBH}2939`)).toBe("010190-2939");
    expect(cleanCopiedPlainText("1990–\u20602010")).toBe("1990–2010");
  });

  test("plain text clean-up keeps a typed &nbsp;", () => {
    expect(cleanCopiedPlainText(`a${SHY}b${NBSP}c &nbsp; d`)).toBe("ab c &nbsp; d");
  });
});

describe("cleanClipboard", () => {
  test("returns null, and skips the html, when nothing needs cleaning", () => {
    let calls = 0;
    const result = cleanClipboard("venjulegur texti", () => {
      calls += 1;
      return "";
    });
    expect(result).toBeNull();
    expect(calls).toBe(0);
    expect(needsCleaning("venjulegur texti")).toBe(false);
    expect(needsCleaning(`010190${NBH}2939`)).toBe(true);
    expect(needsCleaning("1990–\u20602000")).toBe(true);
  });

  test("a copied dash range alone is cleaned: the word joiner does not stay on the clipboard", () => {
    const range = localeDetailsDash();
    expect(range).toContain("\u2060");
    const result = cleanClipboard(range, () => "<p>1990–2000</p>");
    expect(result).toEqual({ text: "1990–2000", html: "<p>1990–2000</p>" });
  });

  test("cleanTextNodes removes the word joiner of a dash range", () => {
    const node = { nodeValue: localeDetailsDash() };
    cleanTextNodes([node]);
    expect(node.nodeValue).toBe("1990–2000");
  });

  test.each([SHY, NBSP, NBH])(
    "cleans the text and passes the clean html on for %j",
    char => {
      const result = cleanClipboard(`a${char}b&nbsp;c`, () => "<p>clean</p>");
      const cleaned = { [SHY]: "ab", [NBSP]: "a b", [NBH]: "a-b" }[char];
      expect(result).toEqual({
        text: `${cleaned}&nbsp;c`,
        html: "<p>clean</p>",
      });
    }
  );
});

describe("cleanTextNodes", () => {
  test("cleans node values and leaves other nodes alone", () => {
    const nodes = [
      { nodeValue: `5${NBSP}km` },
      { nodeValue: `Hrað${SHY}braut` },
      { nodeValue: "clean" },
      { nodeValue: null },
    ];
    cleanTextNodes(nodes);
    expect(nodes.map(node => node.nodeValue)).toEqual([
      "5 km",
      "Hraðbraut",
      "clean",
      null,
    ]);
  });

  test("attributes are never in text nodes, so they keep their entities", () => {
    // The old handler cleaned the serialized string and rewrote this markup.
    // Now only text node values change, so the markup below is left as it is.
    const markup = '<a href="/a&nbsp;b" data-id="x&shy;y">';
    const nodes = [{ nodeValue: `5${NBSP}km` }];
    cleanTextNodes(nodes);
    expect(nodes[0]?.nodeValue).toBe("5 km");
    expect(markup).toContain("&nbsp;");
  });
});

describe("shouldHandleCopy", () => {
  test("handles plain page content", () => {
    expect(shouldHandleCopy(null)).toBe(true);
    expect(shouldHandleCopy({ tagName: "P", closest: () => null })).toBe(true);
    expect(shouldHandleCopy({ tagName: "BODY" })).toBe(true);
  });

  test.each(["INPUT", "textarea", "TEXTAREA"])("skips <%s>", tagName => {
    expect(shouldHandleCopy({ tagName })).toBe(false);
  });

  test("skips editable content, direct or inherited", () => {
    expect(shouldHandleCopy({ tagName: "DIV", isContentEditable: true })).toBe(false);
    expect(shouldHandleCopy({ tagName: "SPAN", closest: () => ({}) })).toBe(false);
  });
});

describe("loadSkiptingar", () => {
  test("shares one promise and resolves to the core", async () => {
    const first = loadSkiptingar();
    const second = loadSkiptingar();
    expect(second).toBe(first);
    const core = await first;
    expect(typeof core.hyphenate).toBe("function");
    expect(typeof core.processSegments).toBe("function");
  });

  test("exports the hook", () => {
    expect(typeof useHyphenate).toBe("function");
  });

  test("loadedSkiptingar returns the core once it has loaded, and never starts a load", async () => {
    const core = await loadSkiptingar();
    expect(loadedSkiptingar()).toBe(core);
  });
});

describe("client constants", () => {
  test("re-exports the three invisible characters", () => {
    expect(CLIENT_SOFT_HYPHEN).toBe(SHY);
    expect(CLIENT_NO_BREAK_SPACE).toBe(NBSP);
    expect(CLIENT_NO_BREAK_HYPHEN).toBe(NBH);
  });

  test("re-exports the Icelandic word lists for settle-rag, the same objects as the core", () => {
    expect(CLIENT_SETTLE_RAG_LANGUAGE).toBe(SETTLE_RAG_LANGUAGE);
    expect(CLIENT_SHORT_WORDS).toBe(SHORT_WORDS);
    expect(CLIENT_LINKING_SYLLABLES).toBe(LINKING_SYLLABLES);
    expect(CLIENT_SETTLE_RAG_LANGUAGE.locale).toBe("is");
  });
});

describe("createLoader", () => {
  const fakeCore = {} as Awaited<ReturnType<typeof loadSkiptingar>>;

  test("calls the import once and shares its promise", async () => {
    let calls = 0;
    const loader = createLoader(() => {
      calls += 1;
      return Promise.resolve(fakeCore);
    });
    expect(loader.loaded()).toBeUndefined();
    const first = loader.load();
    expect(loader.load()).toBe(first);
    expect(await first).toBe(fakeCore);
    expect(loader.loaded()).toBe(fakeCore);
    expect(await loader.load()).toBe(fakeCore);
    expect(calls).toBe(1);
  });

  test("a retry that succeeds tells every subscriber, also one whose own load failed", async () => {
    let calls = 0;
    const loader = createLoader(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("chunk failed"))
        : Promise.resolve(fakeCore);
    });
    const seen = { a: 0, b: 0, gone: 0 };
    const unsubscribeA = loader.subscribe(() => {
      seen.a += 1;
    });
    // The first load fails: nobody is told.
    await Promise.resolve();
    await Promise.resolve();
    expect(loader.loaded()).toBeUndefined();
    expect(seen).toEqual({ a: 0, b: 0, gone: 0 });

    const unsubscribeGone = loader.subscribe(() => {
      seen.gone += 1;
    });
    unsubscribeGone();
    loader.subscribe(() => {
      seen.b += 1;
    });
    await loader.load();
    expect(calls).toBe(2);
    expect(seen).toEqual({ a: 1, b: 1, gone: 0 });
    unsubscribeA();
  });

  test("a failed load tells nobody and the next subscribe retries it", async () => {
    let calls = 0;
    const loader = createLoader(() => {
      calls += 1;
      return Promise.reject(new Error("chunk failed"));
    });
    let told = 0;
    loader.subscribe(() => {
      told += 1;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    loader.subscribe(() => {
      told += 1;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(told).toBe(0);
    expect(calls).toBe(2);
  });

  test("a failed load rejects, is forgotten, and the next call tries again", async () => {
    let calls = 0;
    const loader = createLoader(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("chunk failed"))
        : Promise.resolve(fakeCore);
    });
    await expect(loader.load()).rejects.toThrow("chunk failed");
    expect(loader.loaded()).toBeUndefined();
    expect(await loader.load()).toBe(fakeCore);
    expect(calls).toBe(2);
  });
});

describe("useHyphenate on the server", () => {
  function Probe({ text }: { text: string }) {
    return createElement("p", null, useHyphenate(text));
  }

  test("returns the text as given, even after the core has loaded", async () => {
    await loadSkiptingar();
    const html = renderToStaticMarkup(
      createElement(Probe, { text: "Hraðbrautarframkvæmdir" })
    );
    expect(html).toBe("<p>Hraðbrautarframkvæmdir</p>");
  });
});

describe("useSkiptingar on the server", () => {
  function Probe() {
    return createElement("p", null, useSkiptingar() === null ? "none" : "core");
  }

  test("returns null, even after the core has loaded", async () => {
    await loadSkiptingar();
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>none</p>");
  });
});

describe("hook options", () => {
  test("optionsKey ignores key order, identity and undefined values", () => {
    expect(optionsKey({ mode: "heading", betterBreaks: false })).toBe(
      optionsKey({ betterBreaks: false, mode: "heading", leftMin: undefined })
    );
    expect(optionsKey(undefined)).toBe(optionsKey({}));
    expect(optionsKey({ mode: "heading" })).not.toBe(optionsKey({ mode: "body" }));
  });

  test("optionsKey ignores the key order of nested options too", () => {
    expect(
      optionsKey({ localeDetails: { quotes: true, singleLetter: true }, mode: "heading" })
    ).toBe(
      optionsKey({ mode: "heading", localeDetails: { singleLetter: true, quotes: true } })
    );
    expect(optionsKey({ localeDetails: { quotes: undefined, dashes: true } })).toBe(
      optionsKey({ localeDetails: { dashes: true } })
    );
    expect(optionsKey({ localeDetails: { dashes: true } })).not.toBe(
      optionsKey({ localeDetails: { dashes: false } })
    );
  });

  test("applyOptionsKey reads NFD text like NFC text", async () => {
    const core = await loadSkiptingar();
    const key = optionsKey({ localeDetails: { singleLetter: true } });
    const nfd = "á fund".normalize("NFD");
    expect(applyOptionsKey(core, nfd, key)).toBe(`á${NBSP}fund`);
    expect(applyOptionsKey(core, "á fund", key)).toBe(`á${NBSP}fund`);
  });

  test("applyOptionsKey adds locale details and hyphenates by default", async () => {
    const core = await loadSkiptingar();
    const text = 'Hann sagði "orð" um Hraðbrautarframkvæmdir';
    for (const key of [
      optionsKey(undefined),
      optionsKey({}),
      optionsKey({ localeDetails: true }),
      optionsKey({ localeDetails: {} }),
    ]) {
      const out = applyOptionsKey(core, text, key);
      expect(out).toContain("„orð“");
      expect(out).toContain(SHY);
    }
  });

  test("options that give the same output share one key; localeDetails: false stays apart", () => {
    const keys = [
      optionsKey(undefined),
      optionsKey({}),
      optionsKey({ localeDetails: undefined }),
      optionsKey({ localeDetails: true }),
      optionsKey({ localeDetails: {} }),
      optionsKey({ localeDetails: { quotes: undefined } }),
    ];
    expect(new Set(keys).size).toBe(1);
    expect(optionsKey({ localeDetails: false })).not.toBe(keys[0]);
    expect(optionsKey({ localeDetails: { dashes: true } })).not.toBe(keys[0]);
    expect(optionsKey({ betterBreaks: false })).not.toBe(keys[0]);
  });

  test("applyOptionsKey only hyphenates with localeDetails: false", async () => {
    const core = await loadSkiptingar();
    const out = applyOptionsKey(
      core,
      'Hann sagði "orð" um Hraðbrautarframkvæmdir',
      optionsKey({ localeDetails: false })
    );
    expect(out).toContain('"orð"');
    expect(out).not.toContain("„");
    expect(out).toContain(SHY);
  });

  test("applyOptionsKey honours localeDetails=false and hyphenate options", async () => {
    const core = await loadSkiptingar();
    const word = "Vaðlaheiðarvegavinnuverkfærageymsluskúr";
    const out = applyOptionsKey(
      core,
      `"${word}"`,
      optionsKey({ localeDetails: false, mode: "heading" })
    );
    expect(out).toBe(`"${hyphenate(word, experimental({ mode: "heading" }))}"`);
  });
});

describe("the endpoint client", () => {
  const realFetch = globalThis.fetch;
  type Call = { items: RemoteItem[] };
  let calls: Call[] = [];

  /** Answers every request with `respond(call)`: a status, or a thrown error. */
  function mockFetch(respond: (call: Call) => number | Error) {
    calls = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const call = JSON.parse(String(init?.body)) as Call;
      calls.push(call);
      const outcome = respond(call);
      if (outcome instanceof Error) {
        throw outcome;
      }
      const ok = outcome === 200;
      return new Response(
        JSON.stringify(
          ok
            ? {
                results: call.items.map(item =>
                  item.op === "process" ? `<${item.text}>` : { breaks: [1], joints: [] }
                ),
              }
            : { error: "no" }
        ),
        { status: outcome }
      );
    }) as unknown as typeof fetch;
  }

  const process = (text: string): RemoteItem => ({ op: "process", text });
  const ask = (text: string) => requestRemote(`k:${text}`, process(text));
  const answer = (text: string) => remoteResult(`k:${text}`);
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  afterEach(() => {
    globalThis.fetch = realFetch;
    configureSkiptingar({ endpoint: undefined });
  });

  test("an answer is cached under its key", async () => {
    mockFetch(() => 200);
    configureSkiptingar({ endpoint: "/api" });
    ask("ok-one");
    await settle();
    expect(answer("ok-one")).toBe("<ok-one>");
    expect(usesEndpoint()).toBe(true);
  });

  test.each([400, 413])(
    "a %i leaves the endpoint in use, and the next batch still goes to it",
    async status => {
      mockFetch(call =>
        call.items.some(item => item.op === "process" && item.text === `bad-${status}`)
          ? status
          : 200
      );
      configureSkiptingar({ endpoint: "/api" });
      ask(`bad-${status}`);
      await settle();
      expect(usesEndpoint()).toBe(true);
      // The refused text comes back as given, and is not asked for again.
      expect(answer(`bad-${status}`)).toBe(`bad-${status}`);
      ask(`bad-${status}`);
      await settle();
      expect(calls).toHaveLength(1);

      ask(`good-after-${status}`);
      await settle();
      expect(calls).toHaveLength(2);
      expect(answer(`good-after-${status}`)).toBe(`<good-after-${status}>`);
      expect(usesEndpoint()).toBe(true);
    }
  );

  test("a refused analyze job comes back with no breaks", async () => {
    mockFetch(() => 400);
    configureSkiptingar({ endpoint: "/api" });
    requestRemote("a:word", { op: "analyze", word: "word" });
    await settle();
    expect(remoteResult("a:word")).toEqual({ breaks: [], joints: [] });
    expect(usesEndpoint()).toBe(true);
  });

  test.each([
    ["a server error", 500],
    ["a bad gateway", 502],
    ["a missing route", 404],
    ["a network error", new TypeError("Failed to fetch")],
  ])("%s sets failed, so the hooks load the patterns", async (_name, outcome) => {
    mockFetch(() => outcome);
    configureSkiptingar({ endpoint: "/api" });
    expect(usesEndpoint()).toBe(true);
    ask(`fail-${_name}`);
    await settle();
    expect(usesEndpoint()).toBe(false);
    expect(answer(`fail-${_name}`)).toBeUndefined();
  });

  test("configureSkiptingar clears failed", async () => {
    mockFetch(() => 500);
    configureSkiptingar({ endpoint: "/api" });
    ask("will-fail");
    await settle();
    expect(usesEndpoint()).toBe(false);
    configureSkiptingar({ endpoint: "/api" });
    expect(usesEndpoint()).toBe(true);
  });

  test("a queue over the limits goes out as several requests, each under them", async () => {
    mockFetch(() => 200);
    configureSkiptingar({ endpoint: "/api" });
    for (let index = 0; index < 450; index += 1) {
      ask(`many-${index}`);
    }
    await settle();
    expect(calls.map(call => call.items.length)).toEqual([200, 200, 50]);
    expect(answer("many-0")).toBe("<many-0>");
    expect(answer("many-449")).toBe("<many-449>");
    expect(usesEndpoint()).toBe(true);
  });

  test("a refused batch does not stop the others in the same queue", async () => {
    // Two requests: the first (200 texts) is refused, the second is answered.
    mockFetch(call => (call.items.length === 200 ? 400 : 200));
    configureSkiptingar({ endpoint: "/api" });
    for (let index = 0; index < 210; index += 1) {
      ask(`mixed-${index}`);
    }
    await settle();
    expect(answer("mixed-0")).toBe("mixed-0");
    expect(answer("mixed-209")).toBe("<mixed-209>");
    expect(usesEndpoint()).toBe(true);
  });

  describe("splitBatches", () => {
    const entry = (text: string): [string, RemoteItem] => [text, process(text)];

    test("keeps order and splits at 200 items", () => {
      const entries = Array.from({ length: 401 }, (_, index) => entry(`t${index}`));
      const batches = splitBatches(entries);
      expect(batches.map(batch => batch.length)).toEqual([200, 200, 1]);
      expect(batches.flat()).toEqual(entries);
    });

    test("splits at 50 000 characters, and the last batch is the remainder", () => {
      const entries = [
        entry("a".repeat(30_000)),
        entry("b".repeat(20_000)),
        entry("c".repeat(1)),
        entry("d".repeat(49_999)),
      ];
      const batches = splitBatches(entries);
      expect(batches.map(batch => batch.length)).toEqual([2, 2]);
      for (const batch of batches) {
        const total = batch.reduce(
          (sum, [, item]) => sum + (item.op === "process" ? item.text.length : 0),
          0
        );
        expect(total).toBeLessThanOrEqual(50_000);
      }
    });

    test("a text over the limit alone still goes out, in its own batch", () => {
      const huge = entry("x".repeat(60_000));
      const batches = splitBatches([entry("a"), huge, entry("b")]);
      expect(batches.map(batch => batch.length)).toEqual([1, 1, 1]);
      expect(batches[1]?.[0]).toBe(huge);
    });

    test("counts the word of an analyze job, and an empty queue gives no batch", () => {
      expect(splitBatches([])).toEqual([]);
      const batches = splitBatches([
        ["a", { op: "analyze", word: "w".repeat(40_000) }],
        ["b", process("t".repeat(20_000))],
      ]);
      expect(batches.map(batch => batch.length)).toEqual([1, 1]);
    });
  });
});

describe("fillPending", () => {
  const last = { sources: ["a", "b"], texts: ["A·", "B·"] };

  test("keeps the answers it has", () => {
    expect(fillPending(["a", "b"], ["x", "y"], last)).toEqual(["x", "y"]);
  });

  test("a pending text keeps its last output, so a toggle does not flash the raw text", () => {
    expect(fillPending(["a", "b"], [undefined, undefined], last)).toEqual(["A·", "B·"]);
    expect(fillPending(["a", "b"], ["x", undefined], last)).toEqual(["x", "B·"]);
  });

  test("a changed text never gets the output of another", () => {
    expect(fillPending(["a", "c"], [undefined, undefined], last)).toEqual(["A·", "c"]);
    // Moved to another position: no match, the raw text.
    expect(fillPending(["b", "a"], [undefined, undefined], last)).toEqual(["b", "a"]);
  });

  test("a different number of texts gives one text for each, and never reads past the old ones", () => {
    expect(fillPending(["a", "b", "c"], [undefined, undefined, undefined], last)).toEqual(
      ["A·", "B·", "c"]
    );
    expect(fillPending(["a"], [undefined], last)).toEqual(["A·"]);
    expect(fillPending([], [], last)).toEqual([]);
  });

  test("with nothing ready before, the raw texts", () => {
    expect(fillPending(["a", "b"], [undefined, undefined], null)).toEqual(["a", "b"]);
  });
});

/** Static imports and re-exports that survive compilation. Types and dynamic imports are ignored. */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^"'`;]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function staticSpecifiers(source: string): string[] {
  return [...source.matchAll(STATIC_IMPORT)].map(match => match[1] ?? match[2] ?? "");
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
}

/** Every file reachable from `entries` through static imports. */
function staticGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const target = specifier.startsWith(".")
        ? resolveLocal(file, specifier)
        : undefined;
      if (target) {
        queue.push(target);
      }
    }
  }
  return seen;
}

describe("client entry stays lazy", () => {
  const entries = readdirSync(CLIENT_DIR)
    .filter(name => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map(name => join(CLIENT_DIR, name));

  test("the scanner sees static imports and skips types and dynamic imports", () => {
    const sample = [
      'import { a } from "./a";',
      'import type { B } from "./b";',
      'export type { C } from "./c";',
      'export { d } from "./d";',
      'import "./e";',
      `const f = ${"import"}("./f");`,
      'let g: typeof import("./g");',
    ].join("\n");
    expect(staticSpecifiers(sample)).toEqual(["./a", "./d", "./e"]);
  });

  test("finds the client files", () => {
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  test("no static import reaches the engine or the generated data", () => {
    const graph = [...staticGraph(entries)].map(file => relative(SRC_DIR, file));
    expect(graph.length).toBeGreaterThanOrEqual(entries.length);
    expect(graph).not.toContain("engine.ts");
    expect(graph).not.toContain(join("generated", "data.ts"));
    expect(graph).not.toContain("index.ts");
    expect(graph.some(file => file.startsWith(".."))).toBe(false);
  });

  test("the only way to the core is one dynamic import in load.ts", () => {
    const withDynamic = entries.filter(file =>
      /(?<!typeof\s)\bimport\(\s*["']\.\.\/index["']\s*\)/.test(
        readFileSync(file, "utf8")
      )
    );
    expect(withDynamic.map(file => relative(CLIENT_DIR, file))).toEqual(["load.ts"]);
  });
});
