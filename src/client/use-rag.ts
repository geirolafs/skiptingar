"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { applyRag, type Hang, type RagOptions } from "../rag";
import { forgetMeasurements, type RagPlan, settleRag } from "./rag";

type Settled = { text: string; plan: RagPlan };

const NO_CHANGE: RagPlan = { forbidden: [], hangs: [] };

function samePlan(a: RagPlan, b: RagPlan): boolean {
  const hangs = (plan: RagPlan) =>
    plan.hangs.map(hang => `${hang.index}:${hang.width}`).join();
  return a.forbidden.join() === b.forbidden.join() && hangs(a) === hangs(b);
}

/**
 * The rag plan for the element in `ref` (`settleRag`): the breaks a
 * typesetter would move, as indices into `text`, and the line ends that
 * overhang the edge. For a caller that applies it itself, such as text split
 * over several elements; `useSettledRag` applies it to one string.
 *
 * It judges again when the text changes, when the element's width changes
 * and whenever fonts finish loading, since all three move the line breaks.
 * Until the first judgement, on the server and when `enabled` is false, the
 * plan changes nothing. While enabled it sets `text-wrap: wrap` on the
 * element, since the plan relies on greedy wrapping (`pretty` and `balance`
 * would move the breaks again).
 *
 * A judgement for a new width lands before the browser paints, so no frame
 * shows the old breaks at a new width: the first runs in a layout effect, and
 * the ones a resize starts are flushed at once (`flushSync`) from the
 * observer, which runs between layout and paint. A judgement after a font
 * load runs from the font event, so the new font can show for one frame with
 * the old breaks. The first judgement on a server-rendered page still lands
 * after the server's HTML is on screen.
 */
export function useRagPlan(
  ref: RefObject<HTMLElement | null>,
  text: string,
  enabled: boolean,
  options: RagOptions = {}
): RagPlan {
  const [settled, setSettled] = useState<Settled | null>(null);
  // The options as one string, so a new object with the same values does
  // not judge again.
  const optionsKey = JSON.stringify(options);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!(enabled && element)) {
      return;
    }
    // The plan relies on greedy wrapping.
    const wrapBefore = element.style.getPropertyValue("text-wrap");
    element.style.setProperty("text-wrap", "wrap");
    let lastWidth = -1;
    const judge = () => {
      // The layout width, which a transform such as a scale-in does not change.
      const width = element.offsetWidth;
      // Forbidding a break changes the height, not the width: only a new
      // width, or the first run, is worth judging again.
      if (width === lastWidth) {
        return null;
      }
      lastWidth = width;
      return settleRag(element, text, JSON.parse(optionsKey) as RagOptions);
    };
    const store = (plan: RagPlan) =>
      setSettled(previous =>
        previous && previous.text === text && samePlan(previous.plan, plan)
          ? previous
          : { text, plan }
      );

    const first = judge();
    if (first) {
      store(first);
    }
    const observer = new ResizeObserver(() => {
      const plan = judge();
      if (plan) {
        flushSync(() => store(plan));
      }
    });
    observer.observe(element);
    // Fonts that are still loading move the breaks once they arrive, and so
    // does a face first used later (an italic, a heavier weight).
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    const onFonts = () => {
      forgetMeasurements(element);
      lastWidth = -1;
      const plan = judge();
      if (plan) {
        flushSync(() => store(plan));
      }
    };
    fonts?.addEventListener("loadingdone", onFonts);
    let alive = true;
    if (fonts && fonts.status !== "loaded") {
      fonts.ready.then(() => alive && onFonts());
    }
    return () => {
      alive = false;
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", onFonts);
      element.style.setProperty("text-wrap", wrapBefore);
    };
  }, [ref, text, enabled, optionsKey]);

  if (!(enabled && settled) || settled.text !== text) {
    return NO_CHANGE;
  }
  return settled.plan;
}

/**
 * `text` with its rag settled for the element in `ref`: the breaks a
 * typesetter would move are forbidden, so a short word at a line's end or a
 * word that leaves a hole goes down to the next line, and `hangs` lists the
 * line ends that overhang the edge, each drawn as a span around the line's
 * last character with a negative `letter-spacing` of the overhang. See
 * `useRagPlan`.
 */
export function useSettledRag(
  ref: RefObject<HTMLElement | null>,
  text: string,
  enabled: boolean,
  options: RagOptions = {}
): { text: string; hangs: Hang[] } {
  const plan = useRagPlan(ref, text, enabled, options);
  return applyRag(text, plan.forbidden, plan.hangs);
}
