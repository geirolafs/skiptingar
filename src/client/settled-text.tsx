"use client";

import type { ComponentPropsWithoutRef, ElementType, RefObject } from "react";
import { Fragment, useRef } from "react";
import { splitSettled } from "../rag";
import { type SettleOptions, useSettledRag } from "./use-rag";

type SettledTextProps<T extends ElementType> = {
  /** The text, hyphenated with soft hyphens (for example by `hyphenate`). */
  text: string;
  /** The element to render. Default `p`. It must be a block that wraps. */
  as?: T;
  /** Rag options, and `enabled` to turn settling off. */
  options?: SettleOptions;
} & Omit<ComponentPropsWithoutRef<T>, "children">;

/**
 * Text with its rag settled (`useSettledRag`) and its overhangs and tightened
 * lines drawn: each overhanging character in a span with a negative
 * `letter-spacing` of the overhang, so the line fits and the character's end
 * sits past the edge, and each tightened line in a span with a negative
 * `word-spacing` (and `letter-spacing`), so it takes less space.
 * On the server and before the first judgement it is the text as given.
 *
 * ```tsx
 * <SettledText as="p" text={hyphenate(text)} options={{ overhang: 0.5 }} />
 * ```
 */
export function SettledText<T extends ElementType = "p">({
  text,
  as,
  options,
  ...props
}: SettledTextProps<T>) {
  const Element: ElementType = as ?? "p";
  const ref = useRef<HTMLElement>(null);
  const settled = useSettledRag(ref, text, options);
  return (
    <Element ref={ref as RefObject<never>} {...props}>
      {splitSettled(settled.text, settled.hangs, settled.tightened).map(piece =>
        piece.hang !== undefined ? (
          <span key={piece.start} style={{ letterSpacing: -piece.hang }}>
            {piece.text}
          </span>
        ) : piece.wordSpacing !== undefined ? (
          <span
            key={piece.start}
            style={{
              wordSpacing: piece.wordSpacing,
              letterSpacing: piece.letterSpacing || undefined,
            }}
          >
            {piece.text}
          </span>
        ) : (
          <Fragment key={piece.start}>{piece.text}</Fragment>
        )
      )}
    </Element>
  );
}
