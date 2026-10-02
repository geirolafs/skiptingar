/**
 * Loads every built entry point in Node, the way a user's app does, and fails
 * if one does not load or exports nothing. The tests run on the sources, so
 * they cannot see a broken bundle: 0.1.0 shipped a `dist/index.js` that
 * exported two names twice, and no runtime would load it. Run after
 * `bun run build`: `node scripts/check-dist.mjs` (or `bun run check:dist`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const { exports } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

let failed = false;
for (const [entry, target] of Object.entries(exports)) {
  const file = typeof target === "string" ? target : target.import;
  if (!file.endsWith(".js")) {
    continue;
  }
  try {
    const module = await import(pathToFileURL(join(root, file)).href);
    const names = Object.keys(module).length;
    if (names === 0) {
      throw new Error("exports nothing");
    }
    console.log(`${entry}: ${names} exports`);
  } catch (error) {
    failed = true;
    console.error(
      `${entry} (${file}): ${error instanceof Error ? error.message : error}`
    );
  }
}
if (failed) {
  process.exit(1);
}
