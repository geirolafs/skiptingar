import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hyphenate } from "../src";
import {
  cleanCopiedPlainText,
  cleanCopiedText,
  loadSkiptingar,
  useHyphenate,
} from "../src/client";
import {
  cleanClipboard,
  cleanTextNodes,
  needsCleaning,
  shouldHandleCopy,
} from "../src/client/clean";
import { createLoader, loadedSkiptingar } from "../src/client/load";
import { applyOptionsKey, optionsKey } from "../src/client/options";

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
    expect(typeof core.typesetSegments).toBe("function");
  });

  test("exports the hook", () => {
    expect(typeof useHyphenate).toBe("function");
  });

  test("loadedSkiptingar returns the core once it has loaded, and never starts a load", async () => {
    const core = await loadSkiptingar();
    expect(loadedSkiptingar()).toBe(core);
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

describe("hook options", () => {
  test("optionsKey ignores key order, identity and undefined values", () => {
    expect(optionsKey({ mode: "heading", rules: "ritreglur" })).toBe(
      optionsKey({ rules: "ritreglur", mode: "heading", leftMin: undefined })
    );
    expect(optionsKey(undefined)).toBe(optionsKey({}));
    expect(optionsKey({ mode: "heading" })).not.toBe(optionsKey({ mode: "body" }));
  });

  test("optionsKey ignores the key order of nested options too", () => {
    expect(
      optionsKey({ typeset: { quotes: true, singleLetter: true }, mode: "heading" })
    ).toBe(
      optionsKey({ mode: "heading", typeset: { singleLetter: true, quotes: true } })
    );
    expect(optionsKey({ typeset: { quotes: undefined, dashes: true } })).toBe(
      optionsKey({ typeset: { dashes: true } })
    );
    expect(optionsKey({ typeset: { dashes: true } })).not.toBe(
      optionsKey({ typeset: { dashes: false } })
    );
  });

  test("applyOptionsKey reads NFD text like NFC text", async () => {
    const core = await loadSkiptingar();
    const key = optionsKey({ typeset: { singleLetter: true } });
    const nfd = "á fund".normalize("NFD");
    expect(applyOptionsKey(core, nfd, key)).toBe(`á${NBSP}fund`);
    expect(applyOptionsKey(core, "á fund", key)).toBe(`á${NBSP}fund`);
  });

  test("applyOptionsKey typesets and hyphenates by default", async () => {
    const core = await loadSkiptingar();
    const text = 'Hann sagði "orð" um Hraðbrautarframkvæmdir';
    const out = applyOptionsKey(core, text, optionsKey(undefined));
    expect(out).toContain("„orð“");
    expect(out).toContain(SHY);
  });

  test("applyOptionsKey honours typeset=false and hyphenate options", async () => {
    const core = await loadSkiptingar();
    const word = "Vaðlaheiðarvegavinnuverkfærageymsluskúr";
    const out = applyOptionsKey(
      core,
      `"${word}"`,
      optionsKey({ typeset: false, mode: "heading" })
    );
    expect(out).toBe(`"${hyphenate(word, { mode: "heading" })}"`);
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
