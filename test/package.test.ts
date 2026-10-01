import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { buildDataModule, GENERATED_PATH, renderDataModule } from "../scripts/build-data";
import { EXCEPTION_COUNT, PATTERN_COUNT } from "../src";
import { parseExceptions } from "../src/exceptions";
import {
  DATA_LEFT_MIN,
  DATA_RIGHT_MIN,
  EXCEPTIONS,
  PATTERNS,
} from "../src/generated/data";

const PACKAGE_ROOT = join(import.meta.dir, "..");

describe("generated data", () => {
  test("src/generated/data.ts is up to date with the data files", () => {
    // Failing here means: run `bun run generate:skiptingar` and commit the result.
    expect(readFileSync(GENERATED_PATH, "utf8")).toBe(buildDataModule());
  });

  test("PATTERN_COUNT and EXCEPTION_COUNT match the data they describe", () => {
    expect(PATTERN_COUNT).toBe(PATTERNS.split("\n").filter(line => line !== "").length);
    expect(EXCEPTION_COUNT).toBe(parseExceptions(EXCEPTIONS).size);
    // The counts come from the source files, not from the generated strings.
    const dic = readFileSync(join(PACKAGE_ROOT, "data", "hyph_is.dic"), "utf8");
    const dicLines = dic.split("\n").filter(line => line.trim() !== "");
    expect(PATTERN_COUNT).toBe(dicLines.length - 3);
    expect(PATTERN_COUNT).toBeGreaterThan(20_000);
    expect(EXCEPTION_COUNT).toBeGreaterThan(0);
  });

  test("a malformed exceptions file fails the build", () => {
    const dic = "UTF-8\nLEFTHYPHENMIN 1\nRIGHTHYPHENMIN 2\na1b\n";
    expect(() => renderDataModule(dic, "ok-word\nbad--word\n")).toThrow("line 2");
    expect(renderDataModule(dic, "# c\nok-word\n")).toContain("EXCEPTION_COUNT = 1;");
  });

  test("the pattern minimums come from the dictionary header", () => {
    const dic = readFileSync(join(PACKAGE_ROOT, "data", "hyph_is.dic"), "utf8");
    expect(dic).toContain(`LEFTHYPHENMIN ${DATA_LEFT_MIN}\n`);
    expect(dic).toContain(`RIGHTHYPHENMIN ${DATA_RIGHT_MIN}\n`);
    expect(() => renderDataModule("UTF-8\na1b\n", "")).toThrow("LEFTHYPHENMIN");
  });

  test("the patterns are sorted", () => {
    const lines = PATTERNS.split("\n");
    expect(lines).toEqual([...lines].sort());
  });

  test("carries a do-not-edit header", () => {
    expect(readFileSync(GENERATED_PATH, "utf8")).toStartWith("// GENERATED");
  });
});

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "node_modules") {
      return [];
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(full);
    }
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

const transpiler = new Bun.Transpiler({ loader: "tsx" });

// scanImports drops imports that are only used as types, and `import type` is
// this repo's convention. Removing the type markers makes those visible too.
const TYPE_ONLY_IMPORT = /\bimport\s+type\b/g;
const TYPE_ONLY_EXPORT = /\bexport\s+type\s*(?=[{*])/g;
const INLINE_TYPE_KEYWORD = /(?<=[{,]\s*)type\s+(?=[\w$])/g;

/** Every module specifier a source file imports, requires or re-exports. */
function specifiersOf(source: string): string[] {
  const visible = source
    .replace(TYPE_ONLY_IMPORT, "import")
    .replace(TYPE_ONLY_EXPORT, "export ")
    .replace(INLINE_TYPE_KEYWORD, "");
  // scanImports sees static imports, re-exports, import() and require().
  // scan adds require.resolve().
  const found = [...transpiler.scanImports(visible), ...transpiler.scan(visible).imports];
  return [...new Set(found.map(entry => entry.path))];
}

function escapesPackage(specifier: string, from: string): boolean {
  if (specifier.startsWith("@/")) {
    return true;
  }
  if (!specifier.startsWith(".")) {
    return false;
  }
  return relative(PACKAGE_ROOT, resolve(dirname(from), specifier)).startsWith("..");
}

const REACT_SPECIFIER = /^react(-dom)?(\/|$)/;

function isReactSpecifier(specifier: string): boolean {
  return REACT_SPECIFIER.test(specifier);
}

/** React belongs to the wrappers and the tests, never to the framework-free core. */
function mayUseReact(file: string): boolean {
  const path = relative(PACKAGE_ROOT, file);
  return (
    path.startsWith("src/react/") ||
    path.startsWith("src/client/") ||
    path.startsWith("test/")
  );
}

describe("package boundary", () => {
  const files = listTypeScriptFiles(PACKAGE_ROOT);

  test("finds the source files it is meant to check", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some(file => file.endsWith("hyphenate.ts"))).toBe(true);
  });

  test.each([
    ['import ("../../../escape")', "../../../escape"],
    ['require ("../../../escape")', "../../../escape"],
    ['import(/* c */ "../../../escape")', "../../../escape"],
    ['const x = 1; export { a } from "../../../escape";', "../../../escape"],
    ['import ("@/lib/escape")', "@/lib/escape"],
    ['import type { A } from "@/lib/escape";', "@/lib/escape"],
    ['import { type A } from "../../../escape";', "../../../escape"],
    ['export type { A } from "../../../escape";', "../../../escape"],
    ['import A from "@/lib/unused";', "@/lib/unused"],
    ['export * from "../../../escape";', "../../../escape"],
  ])("the import scanner flags %p", (source, specifier) => {
    const inFile = join(PACKAGE_ROOT, "src", "sample.ts");
    expect(specifiersOf(source)).toEqual([specifier]);
    expect(escapesPackage(specifier, inFile)).toBe(true);
  });

  test("the import scanner does not flag imports that stay inside the folder", () => {
    const inFile = join(PACKAGE_ROOT, "src", "sample.ts");
    for (const source of [
      'import { a } from "./engine";',
      'import type { B } from "../src/engine";',
      'import { c } from "node:fs";',
    ]) {
      for (const specifier of specifiersOf(source)) {
        expect(escapesPackage(specifier, inFile)).toBe(false);
      }
    }
  });

  test("no file imports through the @/ alias or outside the folder", () => {
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        const where = `${relative(PACKAGE_ROOT, file)} imports "${specifier}"`;
        expect(escapesPackage(specifier, file), where).toBe(false);
      }
    }
  });

  test("has no runtime dependencies beyond node:* built-ins and React", () => {
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        const isLocal = specifier.startsWith(".");
        const isBuiltIn = specifier.startsWith("node:") || specifier === "bun:test";
        expect(
          isLocal || isBuiltIn || (isReactSpecifier(specifier) && mayUseReact(file)),
          `${relative(PACKAGE_ROOT, file)} imports "${specifier}"`
        ).toBe(true);
      }
    }
  });
});
