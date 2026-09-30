const SOFT_HYPHEN = /\u00AD/g;
const NO_BREAK_SPACE = /\u00A0/g;
const NON_BREAKING_HYPHEN = /\u2011/g;
const SOFT_HYPHEN_ENTITY = /&(?:shy|#173|#xad);/gi;
const NO_BREAK_SPACE_ENTITY = /&(?:nbsp|#160|#xa0);/gi;
const NON_BREAKING_HYPHEN_ENTITY = /&(?:#8209|#x2011);/gi;

/**
 * Plain text clean-up: removes soft hyphens, turns no-break spaces into normal
 * spaces and non-breaking hyphens (U+2011, used in phone numbers and
 * kennitala) into plain hyphens. Use this for `text/plain`, where a typed
 * "&nbsp;" is real text.
 */
export function cleanCopiedPlainText(text: string): string {
  return text
    .replace(SOFT_HYPHEN, "")
    .replace(NO_BREAK_SPACE, " ")
    .replace(NON_BREAKING_HYPHEN, "-");
}

/**
 * Same as `cleanCopiedPlainText`, and also handles the HTML entities for these
 * characters. It works on a string of markup, so it also rewrites attribute
 * values. To clean the HTML of a selection, use `cleanTextNodes` instead.
 */
export function cleanCopiedText(text: string): string {
  return cleanCopiedPlainText(text)
    .replace(SOFT_HYPHEN_ENTITY, "")
    .replace(NO_BREAK_SPACE_ENTITY, " ")
    .replace(NON_BREAKING_HYPHEN_ENTITY, "-");
}

/** The part of a DOM text node that clean-up needs. */
export type TextNodeLike = { nodeValue: string | null };

/**
 * Cleans the text of DOM text nodes in place. Attributes and tags are not
 * touched, because only node values change.
 */
export function cleanTextNodes(nodes: Iterable<TextNodeLike>): void {
  for (const node of nodes) {
    if (node.nodeValue !== null && needsCleaning(node.nodeValue)) {
      node.nodeValue = cleanCopiedPlainText(node.nodeValue);
    }
  }
}

/** True when the text has a soft hyphen, a no-break space or a non-breaking hyphen. */
export function needsCleaning(text: string): boolean {
  return text.includes("\u00AD") || text.includes("\u00A0") || text.includes("\u2011");
}

/** The part of a copy event target that the decision needs. */
export type CopyTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
} | null;

const EDITABLE_SELECTOR =
  '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/**
 * False when the copy comes from an input, a textarea or editable content. The
 * browser copies those as they are.
 */
export function shouldHandleCopy(target: CopyTargetLike): boolean {
  if (!target) {
    return true;
  }
  const tag = target.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return false;
  }
  return !(target.isContentEditable || target.closest?.(EDITABLE_SELECTOR));
}

export type CleanClipboard = { text: string; html: string };

/**
 * Decides what to put on the clipboard. Returns `null` when the selection has
 * no soft hyphen or no-break space, so the browser can copy it as it is.
 * `getCleanHtml` must return HTML that is already clean. It is only called
 * when cleaning is needed.
 */
export function cleanClipboard(
  selectedText: string,
  getCleanHtml: () => string
): CleanClipboard | null {
  if (!needsCleaning(selectedText)) {
    return null;
  }
  return { text: cleanCopiedPlainText(selectedText), html: getCleanHtml() };
}
