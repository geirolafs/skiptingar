"use client";

import { useEffect } from "react";
import { cleanClipboard, cleanTextNodes, shouldHandleCopy } from "./clean";

function selectionHtml(selection: Selection): string {
  const container = document.createElement("div");
  for (let i = 0; i < selection.rangeCount; i += 1) {
    container.append(selection.getRangeAt(i).cloneContents());
  }
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  cleanTextNodes(textNodes);
  return container.innerHTML;
}

function handleCopy(event: ClipboardEvent): void {
  const selection = window.getSelection();
  if (!(selection && event.clipboardData) || selection.rangeCount === 0) {
    return;
  }
  if (!shouldHandleCopy(event.target as Element | null)) {
    return;
  }
  const clean = cleanClipboard(selection.toString(), () => selectionHtml(selection));
  if (!clean) {
    return;
  }
  event.preventDefault();
  event.clipboardData.setData("text/plain", clean.text);
  event.clipboardData.setData("text/html", clean.html);
}

/**
 * Renders nothing. While mounted, copying text that holds soft hyphens,
 * no-break spaces or non-breaking hyphens puts clean text on the clipboard: no
 * hidden hyphens, normal spaces and plain hyphens. Other copies are left to the browser.
 */
export function CleanCopy(): null {
  useEffect(() => {
    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, []);
  return null;
}
