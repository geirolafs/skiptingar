"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { applyRag, type Hang, type RagOptions, type Tightened } from "../rag";
import { optionsKey } from "./options";
import { NO_CHANGE, type RagPlan, watchRag } from "./rag";

/** The rag options, and whether to settle at all (default true). */
export type SettleOptions = RagOptions & { enabled?: boolean };

type Settled = { text: string; plan: RagPlan };

function samePlan(a: RagPlan, b: RagPlan): boolean {
  const hangs = (plan: RagPlan) =>
    plan.hangs.map(hang => `${hang.index}:${hang.width}:${hang.letterSpacing}`).join();
  const tightened = (plan: RagPlan) =>
    plan.tightened
      .map(line => `${line.start}:${line.end}:${line.wordSpacing}:${line.letterSpacing}`)
      .join();
  return (
    a.forbidden.join() === b.forbidden.join() &&
    hangs(a) === hangs(b) &&
    tightened(a) === tightened(b)
  );
}

/**
 * The rag plan for the element in `ref` (`settleRag`): the breaks a
 * typesetter would move, as indices into `text`, the line ends that overhang
 * the edge and the lines that set tighter. For a caller that applies it itself, such as text split
 * over several elements (`applyRag`); `useSettledRag` applies it to one
 * string, and `SettledText` draws it too.
 *
 * It judges again when the text changes, when the element's width changes
 * and whenever fonts finish loading (`watchRag`). Until the first judgement,
 * on the server and with `enabled: false`, the plan changes nothing. While
 * enabled the element wraps greedily (`text-wrap: wrap`), which the plan
 * relies on.
 *
 * A judgement for a new width lands before the browser paints, so no frame
 * shows the old breaks at a new width: the first runs in a layout effect,
 * and the ones a resize starts are flushed at once (`flushSync`) from the
 * observer, which runs between layout and paint. A judgement after a font
 * load runs from the font event, so the new font can show for one frame with
 * the old breaks. The first judgement on a server-rendered page still lands
 * after the server's HTML is on screen.
 */
export function useRagPlan(
  ref: RefObject<HTMLElement | null>,
  text: string,
  { enabled = true, ...options }: SettleOptions = {}
): RagPlan {
  const [settled, setSettled] = useState<Settled | null>(null);
  // The options as one string, so a new object with the same values, in any
  // key order, does not judge again.
  const key = optionsKey(options);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!(enabled && element)) {
      return;
    }
    const store = (plan: RagPlan) =>
      setSettled(previous =>
        previous && previous.text === text && samePlan(previous.plan, plan)
          ? previous
          : { text, plan }
      );
    return watchRag(element, text, JSON.parse(key) as RagOptions, (plan, cause) => {
      if (cause === "first") {
        store(plan);
      } else {
        flushSync(() => store(plan));
      }
    });
  }, [ref, text, enabled, key]);

  if (!(enabled && settled) || settled.text !== text) {
    return NO_CHANGE;
  }
  return settled.plan;
}

/**
 * `text` with its rag settled for the element in `ref`: the breaks a
 * typesetter would move are forbidden, so a short word at a line's end or a
 * word that leaves a hole goes down to the next line, `hangs` lists the
 * line ends that overhang the edge and `tightened` the lines that take a
 * little less space between words. Draw it with `SettledText`, or cut it
 * (`splitSettled`) and draw each hang as a span with a negative
 * `letter-spacing` of its width and each tightened line as a span with its
 * `word-spacing` and `letter-spacing`. See `useRagPlan`.
 */
export function useSettledRag(
  ref: RefObject<HTMLElement | null>,
  text: string,
  options: SettleOptions = {}
): { text: string; hangs: Hang[]; tightened: Tightened[] } {
  const plan = useRagPlan(ref, text, options);
  return applyRag(text, plan.forbidden, plan.hangs, plan.tightened);
}
