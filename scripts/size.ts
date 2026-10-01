/**
 * What each entry point costs a browser: builds into a temporary folder the
 * way a site's bundler would (minified, React outside) and prints every file
 * raw, gzip and brotli. The client entry's pattern chunk loads lazily, on
 * first use. Run from the package folder: `bun run size`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const out = await mkdtemp(join(tmpdir(), "skiptingar-size-"));
Object.assign(process.env, { NODE_ENV: "production" });

const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts"), join(root, "src/client/index.ts")],
  root: join(root, "src"),
  outdir: out,
  splitting: true,
  minify: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  process.exit(1);
}

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
for (const output of result.outputs) {
  const bytes = Buffer.from(await output.arrayBuffer());
  const brotli = brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  console.log(
    output.path.replace(`${out}/`, "").padEnd(32),
    `raw ${kB(bytes.length)}`.padEnd(14),
    `gzip ${kB(gzipSync(bytes, { level: 9 }).length)}`.padEnd(15),
    `brotli ${kB(brotli)}`
  );
}
await rm(out, { recursive: true, force: true });
