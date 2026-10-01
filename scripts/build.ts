/**
 * Builds the package into dist/: one ESM bundle per entry point (`.`,
 * `./react`, `./client`), with the pattern data in its own chunk that the
 * client entry loads lazily, and the type declarations beside them. React is
 * a peer and stays outside. Run from the package folder: `bun run build`.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });

// The production JSX runtime, not `react/jsx-dev-runtime`.
Object.assign(process.env, { NODE_ENV: "production" });

const result = await Bun.build({
  entrypoints: [
    join(root, "src/index.ts"),
    join(root, "src/react/index.ts"),
    join(root, "src/client/index.ts"),
  ],
  root: join(root, "src"),
  outdir: dist,
  format: "esm",
  target: "browser",
  splitting: true,
  minify: { syntax: true, whitespace: false, identifiers: false },
  external: ["react", "react-dom", "react/jsx-runtime"],
  define: { "process.env.NODE_ENV": '"production"' },
  naming: { entry: "[dir]/[name].js", chunk: "chunks/[name]-[hash].js" },
});
if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// The client entry's hooks and components need a client boundary under React
// Server Components. A bundle drops the per-file directives, so the entry
// file gets one at the top. The core and the React entry stay server-safe.
const clientEntry = join(dist, "client/index.js");
const source = await Bun.file(clientEntry).text();
if (!source.startsWith('"use client"')) {
  await Bun.write(clientEntry, `"use client";\n${source}`);
}

const types = Bun.spawnSync(["bunx", "tsc", "-p", join(root, "tsconfig.build.json")], {
  stdout: "inherit",
  stderr: "inherit",
});
if (types.exitCode !== 0) {
  process.exit(types.exitCode ?? 1);
}

for (const output of result.outputs) {
  console.log(
    output.path.replace(`${root}/`, ""),
    `${(output.size / 1024).toFixed(1)} kB`
  );
}
