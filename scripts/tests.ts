/**
 * How many tests the package has, read from a real run and not typed in.
 * Runs `bun test`, reads the summary Bun prints
 * (`N pass`, `N fail`, `Ran N tests across N files`) and writes `tests.json`,
 * which the playground's reference section reads. Failures are written down
 * as they are: the page never shows a green count over a red run.
 *
 * `bun run tests:count`. Bun prints the summary on stderr,
 * so both streams are read. `errors` counts errors outside any test, such as a
 * test file that failed to load; Bun leaves those out of `fail`.
 */
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

const root = join(import.meta.dir, "..");
export const TESTS_PATH = join(root, "tests.json");

export type TestCount = {
  pass: number;
  fail: number;
  errors: number;
  total: number;
  files: number;
};

/** The number on the line `<n> <label>`, or undefined when Bun printed no such line. */
function countOf(output: string, label: string): number | undefined {
  const match = output.match(new RegExp(`^\\s*(\\d+) ${label}\\s*$`, "m"));
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** Reads Bun's summary. Throws when it is not there, so a changed format is noticed. */
export function parseSummary(raw: string): TestCount {
  const output = stripVTControlCharacters(raw);
  const ran = output.match(/^Ran (\d+) tests? across (\d+) files?\./m);
  const pass = countOf(output, "pass");
  if (!ran?.[1] || !ran[2] || pass === undefined) {
    throw new Error(`Could not find Bun's test summary in:\n${output}`);
  }
  const fail = countOf(output, "fail") ?? 0;
  const total = Number(ran[1]);
  if (pass + fail !== total) {
    throw new Error(`Summary does not add up: ${pass} pass + ${fail} fail, ${total} ran`);
  }
  return {
    pass,
    fail,
    errors: countOf(output, "errors?") ?? 0,
    total,
    files: Number(ran[2]),
  };
}

if (import.meta.main) {
  const run = Bun.spawn(["bun", "test"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  const exitCode = await run.exited;
  const count = parseSummary(`${out}\n${err}`);
  await writeFile(TESTS_PATH, `${JSON.stringify(count, null, 2)}\n`);
  console.log(
    `${count.pass} pass, ${count.fail} fail, ${count.errors} errors, ${count.total} tests in ${count.files} files`
  );
  console.log(`wrote ${basename(TESTS_PATH)}`);
  // The counts are written either way, so the page can say what failed; the
  // exit code still tells a script or CI that the run was not clean.
  process.exitCode = exitCode;
}
