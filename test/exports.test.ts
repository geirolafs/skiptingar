import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const SITE_ROOT = join(PACKAGE_ROOT, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
  exports: Record<string, { import: string; types: string } | string>;
};

/** The source module an export subpath is built from: dist/x/index.js ← src/x/index.ts. */
function sourceOf(subpath: string): string {
  const target = manifest.exports[subpath];
  if (typeof target !== "object") {
    throw new Error(`no import target for ${subpath}`);
  }
  return join(
    PACKAGE_ROOT,
    target.import.replace("./dist/", "src/").replace(/\.js$/, ".ts")
  );
}

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*"skiptingar(\/[a-z]+)?"/g;

/** Every value imported from the package in the README and the playground's copy. */
function documentedImports(): { subpath: string; name: string; where: string }[] {
  const files = [
    join(PACKAGE_ROOT, "README.md"),
    join(SITE_ROOT, "src/lib/content/localhost-hyphenation.ts"),
  ];
  return files.flatMap(file =>
    [...readFileSync(file, "utf8").matchAll(IMPORT)].flatMap(match =>
      (match[1] ?? "")
        .split(",")
        .map(name => name.trim())
        .filter(name => name !== "" && !name.startsWith("type "))
        .map(name => ({ subpath: `.${match[2] ?? ""}`, name, where: file }))
    )
  );
}

describe("package exports", () => {
  test("every export subpath is built from a source entry that exists", () => {
    for (const subpath of Object.keys(manifest.exports)) {
      if (subpath === "./package.json") {
        continue;
      }
      expect(existsSync(sourceOf(subpath))).toBe(true);
    }
  });

  test("every import shown in the README and on the playground exists", async () => {
    const imports = documentedImports();
    expect(imports.length).toBeGreaterThan(5);
    for (const { subpath, name, where } of imports) {
      const module = (await import(sourceOf(subpath))) as Record<string, unknown>;
      if (!(name in module)) {
        throw new Error(
          `${where}: "${name}" is not exported from skiptingar${subpath.slice(1)}`
        );
      }
    }
  });
});
