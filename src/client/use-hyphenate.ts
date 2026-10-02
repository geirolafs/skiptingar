"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { HyphenateOptions } from "../hyphenate";
import type { UseHyphenateOptions } from "./options";
import { applyOptionsKey, optionsKey } from "./options";
import {
  remoteResult,
  remoteVersion,
  requestRemote,
  subscribeRemote,
  usesEndpoint,
} from "./remote";
import { useSkiptingar } from "./use-skiptingar";

/** The texts processed, or as given until they are; `ready` once all are. */
export type HyphenateResult = { texts: string[]; ready: boolean };

const serverVersion = () => 0;

/**
 * Where the work happens: at the endpoint when one is configured and
 * working, otherwise in the browser with the lazily loaded core. The core is
 * only downloaded when it is the one doing the work.
 */
function useWorker() {
  // Re-renders when an answer arrives or the endpoint fails.
  const version = useSyncExternalStore(subscribeRemote, remoteVersion, serverVersion);
  const remote = usesEndpoint();
  const core = useSkiptingar({ load: !remote });
  return { version, remote, core };
}

/**
 * Hyphenates and adds locale details (unless `localeDetails: false`) several strings in the
 * browser, each with its own options: at the endpoint set with
 * `configureSkiptingar`, or with the core, which loads lazily. Until the answers are in, on the server and if
 * every way fails, each text is returned as given and `ready` is false.
 * Options are compared by value. While a changed option waits for its answer,
 * a text keeps the last processed output of the same text at the same
 * position (`ready` stays false), so a setting toggle does not flash the raw
 * text. A changed text never gets the output of another.
 */
export function useHyphenateAll(
  items: readonly { text: string; options?: UseHyphenateOptions }[]
): HyphenateResult {
  const { version, remote, core } = useWorker();
  // The work as one string, so equal work in a new array is not new work.
  const serial = JSON.stringify(
    items.map(item => [item.text, optionsKey(item.options)] as const)
  );

  useEffect(() => {
    if (!remote) {
      return;
    }
    for (const [text, key] of parseJobs(serial)) {
      const options = JSON.parse(key) as UseHyphenateOptions;
      requestRemote(jobId(text, key), { op: "process", text, options });
    }
  }, [serial, remote]);

  // The last output that was ready, with the texts it was made from.
  const lastReady = useRef<ReadyOutput | null>(null);

  const result = useMemo(() => {
    const jobs = parseJobs(serial);
    const texts = jobs.map(([text, key]) => {
      if (remote) {
        // Read at this `version`: a new answer gives a new version.
        const answer = version >= 0 ? remoteResult(jobId(text, key)) : undefined;
        return typeof answer === "string" ? answer : undefined;
      }
      return core ? applyOptionsKey(core, text, key) : undefined;
    });
    return {
      texts: fillPending(
        jobs.map(([text]) => text),
        texts,
        lastReady.current
      ),
      ready: texts.every(text => text !== undefined),
    };
  }, [serial, remote, version, core]);

  useEffect(() => {
    if (result.ready) {
      lastReady.current = {
        sources: parseJobs(serial).map(([text]) => text),
        texts: result.texts,
      };
    }
  }, [result, serial]);

  return result;
}

/** An output that was ready, with the texts it was made from. */
type ReadyOutput = { sources: readonly string[]; texts: readonly string[] };

/**
 * `outputs` with each missing one filled in: by the last ready output of the
 * same source text at the same position (it was made with other options), or
 * else by the source text itself. A source that changed never gets the output
 * of another, and the result always has one text for each source.
 */
export function fillPending(
  sources: readonly string[],
  outputs: readonly (string | undefined)[],
  last: ReadyOutput | null
): string[] {
  return sources.map((source, index) => {
    const output = outputs[index];
    if (output !== undefined) {
      return output;
    }
    return (last?.sources[index] === source ? last.texts[index] : undefined) ?? source;
  });
}

function parseJobs(serial: string): [text: string, key: string][] {
  return JSON.parse(serial) as [string, string][];
}

function jobId(text: string, key: string): string {
  return `p${key}\u0000${text}`;
}

/**
 * One string, hyphenated and given locale details (unless `localeDetails: false`), with `ready`
 * once it is processed: the text as given until then. See `useHyphenateAll`.
 */
export function useHyphenateResult(
  text: string,
  options?: UseHyphenateOptions
): { text: string; ready: boolean } {
  const { texts, ready } = useHyphenateAll([{ text, options }]);
  return { text: texts[0] ?? text, ready };
}

/**
 * Hyphenates and adds locale details (unless `localeDetails: false`) a string in the browser:
 * at the endpoint set with `configureSkiptingar`, or with the core, which
 * loads lazily. Until it is processed, on the server, and if every way
 * fails, the hook returns the text as given. A component that mounts after the core has loaded, or after
 * the endpoint has answered the same text, gets the processed text on its
 * first render. Options are compared by value.
 */
export function useHyphenate(text: string, options?: UseHyphenateOptions): string {
  return useHyphenateResult(text, options).text;
}

/**
 * The breaks and compound joints of one word (`analyzeWord`), from the
 * endpoint or the lazily loaded core; `null` until it has an answer.
 */
export function useAnalyzeWord(
  word: string,
  options?: HyphenateOptions
): { breaks: number[]; joints: number[] } | null {
  const { version, remote, core } = useWorker();
  const key = optionsKey(options);
  const id = `a${key}\u0000${word}`;

  useEffect(() => {
    if (remote) {
      requestRemote(id, {
        op: "analyze",
        word,
        options: JSON.parse(key) as HyphenateOptions,
      });
    }
  }, [id, remote, word, key]);

  return useMemo(() => {
    if (remote) {
      // Read at this `version`: a new answer gives a new version.
      const answer = version >= 0 ? remoteResult(id) : undefined;
      return typeof answer === "object" ? answer : null;
    }
    return core ? core.analyzeWord(word, JSON.parse(key) as HyphenateOptions) : null;
  }, [id, remote, version, core, word, key]);
}
