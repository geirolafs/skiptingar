/**
 * What each way of using the package costs a browser, measured the way a
 * site's bundler would build it (minified, React left out, brotli). Each
 * setup is a small entry that imports what that use needs; its size is the
 * files loaded at once plus, for `lazy`, the chunks loaded on first use.
 *
 * `bun run size` prints the table and writes `sizes.json`, which the
 * playground's copy and cost chart read, and the README figures between
 * `<!-- size:NAME -->` markers. `bun run size --check` only reports whether
 * they are up to date.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
export const SIZES_PATH = join(root, "sizes.json");
const README_PATH = join(root, "README.md");

/** One way of using the package, as the code a page would write. */
const SETUPS = {
  rag: {
    label: "Settle rag only (SettledText)",
    code: `import { SettledText } from "${src}/client/index"; console.log(SettledText);`,
  },
  endpoint: {
    label: "useHyphenate with an endpoint",
    code: `import { configureSkiptingar, useHyphenate } from "${src}/client/index"; configureSkiptingar({ endpoint: "/api" }); console.log(useHyphenate);`,
  },
  client: {
    label: "the full client entry",
    code: `import * as client from "${src}/client/index"; console.log(client);`,
  },
  cleanCopy: {
    label: "Clean copy only (CleanCopy)",
    code: `import { CleanCopy } from "${src}/client/index"; console.log(CleanCopy);`,
  },
  browser: {
    label: "useHyphenate in the browser, patterns included",
    code: `import { useHyphenate } from "${src}/client/index"; console.log(useHyphenate);`,
    lazy: true,
  },
} as const;

export type Size = { brotli: number; gzip: number };
export type Sizes = Record<keyof typeof SETUPS | "patterns", Size>;

const kB = (bytes: number) => Math.round(bytes / 100) / 10;

/** Each file compressed on its own, the way a browser downloads it, summed. */
function sizeOf(files: readonly Buffer[]): Size {
  let brotli = 0;
  let gzip = 0;
  for (const bytes of files) {
    brotli += brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
    gzip += gzipSync(bytes, { level: 9 }).length;
  }
  return { brotli: kB(brotli), gzip: kB(gzip) };
}

const STATIC_IMPORT = /(?:^|[;\s])(?:import|export)[^"'()]*?from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

/** The files a module pulls in, static and lazy, as paths relative to it. */
function importsOf(code: string): { statics: string[]; lazies: string[] } {
  const relative = (spec: string) => spec.startsWith(".");
  return {
    statics: [...code.matchAll(STATIC_IMPORT)].map(m => m[1] ?? "").filter(relative),
    lazies: [...code.matchAll(DYNAMIC_IMPORT)].map(m => m[1] ?? "").filter(relative),
  };
}

/** Bytes of the entry and everything it loads at once, and of what it loads lazily. */
async function measureEntry(code: string): Promise<{ eager: Buffer[]; lazy: Buffer[] }> {
  // A fixed folder, not a random one: its path can end up in the output, and
  // the sizes must not change from run to run.
  const dir = join(tmpdir(), "skiptingar-size");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let previousNodeEnv: string | undefined;
  try {
    const entry = join(dir, "entry.ts");
    await writeFile(entry, code);
    // Only for the build: left set, it would leak into whatever process runs
    // this (the test run), and React's server entry would load its production build.
    previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: join(dir, "out"),
      splitting: true,
      minify: true,
      external: ["react", "react-dom", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
    });
    if (!result.success) {
      throw new Error(result.logs.join("\n"));
    }
    const files = new Map<string, Buffer>();
    for (const output of result.outputs) {
      files.set(output.path, Buffer.from(await output.arrayBuffer()));
    }
    const collect = (start: string, follow: "statics" | "all", seen: Set<string>) => {
      const queue = [start];
      while (queue.length > 0) {
        const path = queue.pop() as string;
        if (seen.has(path) || !files.has(path)) {
          continue;
        }
        seen.add(path);
        const { statics, lazies } = importsOf((files.get(path) as Buffer).toString());
        const next = follow === "all" ? [...statics, ...lazies] : statics;
        queue.push(...next.map(spec => join(dirname(path), spec)));
      }
      return seen;
    };
    const entryPath = [...files.keys()].find(
      path => basename(path) === "entry.js"
    ) as string;
    const eager = collect(entryPath, "statics", new Set());
    const everything = collect(entryPath, "all", new Set());
    const bytes = (paths: Iterable<string>) =>
      [...paths].map(path => files.get(path) as Buffer);
    return {
      eager: bytes(eager),
      lazy: bytes([...everything].filter(path => !eager.has(path))),
    };
  } finally {
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
    await rm(dir, { recursive: true, force: true });
  }
}

/** Measures every setup. Sizes are per setup, so shared code is counted in each. */
export async function measureSizes(): Promise<Sizes> {
  const sizes: Partial<Sizes> = {};
  for (const [name, setup] of Object.entries(SETUPS)) {
    const { eager, lazy } = await measureEntry(setup.code);
    if ("lazy" in setup && setup.lazy) {
      sizes[name as keyof Sizes] = sizeOf([...eager, ...lazy]);
      sizes.patterns = sizeOf(lazy);
    } else {
      sizes[name as keyof Sizes] = sizeOf(eager);
    }
  }
  return sizes as Sizes;
}

/** The JSON text written to `sizes.json`. */
export function renderSizes(sizes: Sizes): string {
  return `${JSON.stringify(sizes, null, 2)}\n`;
}

const MARKER = /<!-- size:(\w+) -->[^<]*<!-- \/size -->/g;

/** The README with every `<!-- size:NAME -->…<!-- /size -->` set from `sizes`. */
export function renderReadme(readme: string, sizes: Sizes): string {
  return readme.replace(MARKER, (match, name: string) => {
    const size = sizes[name as keyof Sizes];
    return size ? `<!-- size:${name} -->${size.brotli} kB<!-- /size -->` : match;
  });
}

if (import.meta.main) {
  const sizes = await measureSizes();
  for (const [name, size] of Object.entries(sizes)) {
    const label =
      name === "patterns"
        ? "the lazy pattern chunk"
        : SETUPS[name as keyof typeof SETUPS].label;
    console.log(
      label.padEnd(50),
      `brotli ${size.brotli} kB`.padEnd(16),
      `gzip ${size.gzip} kB`
    );
  }
  const json = renderSizes(sizes);
  const readme = await readFile(README_PATH, "utf8");
  const nextReadme = renderReadme(readme, sizes);
  const current = await readFile(SIZES_PATH, "utf8").catch(() => "");
  if (process.argv.includes("--check")) {
    const stale = current !== json || readme !== nextReadme;
    console.log(
      stale ? "sizes.json or the README is out of date: run bun run size" : "up to date"
    );
    process.exit(stale ? 1 : 0);
  }
  await writeFile(SIZES_PATH, json);
  await writeFile(README_PATH, nextReadme);
  console.log(`wrote ${basename(SIZES_PATH)} and the README's size markers`);
}
