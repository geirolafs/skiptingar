/**
 * Finds the parts of a text that are web addresses: URLs, bare domains and
 * email addresses. Both `typeset` and `hyphenate` use this, so they always
 * agree on what an address is and never change one.
 */

// One alternative per kind of address. Each starts with a lookbehind so a
// match can only begin at the start of a run of address characters. That
// keeps scanning linear on long input such as 40,000 letters in a row.

/** A TLD: plain letters (is, com) or punycode (xn--p1ai). */
const TLD = "(?:xn--[a-z0-9-]{2,}|\\p{L}{2,})";
/** A `:3000` port. */
const PORT = "(?::\\d{1,5})";
/** A path, query or fragment, which runs to the next space. */
const TAIL = "[/?#]\\S*";
/** The address must end the run: not followed by more word characters. */
const RUN_END = "(?![\\p{L}\\p{N}_-])";
/** Dotted labels, then a TLD: example.is, sub.example.co.uk. */
const HOST = `(?:[\\p{L}\\p{N}-]+\\.)+${TLD}`;
const HOST_START = "(?<![\\p{L}\\p{N}@._%+-])";

/** Schemes written `scheme:rest` without slashes. */
const OPAQUE_SCHEMES = "(?:mailto|tel|sms|callto|geo|urn|magnet|xmpp|skype)";

const URL_PATTERN = new RegExp(
  [
    // scheme://anything: http, https, ftp, file, ...
    "(?<![\\p{L}\\p{N}+.-])[a-z][a-z0-9+.-]*:\\/\\/\\S+",
    // mailto:jon@example.is?subject=x, tel:+3545551234, ...
    `(?<![\\p{L}\\p{N}+.-])${OPAQUE_SCHEMES}:\\S+`,
    // someone@example.is. Before the host alternatives, so "jon.jonsson" in
    // "jon.jonsson@example.is" is not taken for a domain of its own.
    "(?<![\\p{L}\\p{N}._%+-])[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.\\p{L}{2,}",
    // www.example.is
    "(?<![\\p{L}\\p{N}.-])www\\.\\S+",
    // A host with a path, query or fragment, and maybe a port:
    // sub.example.co.uk/a-b, example.is:3000/x, example.is?years=1990-2000.
    // Single-letter labels are fine here (t.co/x).
    `${HOST_START}${HOST}${PORT}?${TAIL}`,
    // A host with a port and nothing else: example.is:3000.
    `${HOST_START}${HOST}${PORT}${RUN_END}`,
    // A bare host: example.is. The first label has 2+ characters, so a dotted
    // abbreviation like "o.s.frv" is not an address. With no path the host must
    // end the run, so "orð. Næsta" and a final "orð." are not addresses either.
    `${HOST_START}(?=[\\p{L}\\p{N}-]{2,}\\.)${HOST}${RUN_END}`,
    // localhost:3000/x
    `${HOST_START}localhost${PORT}?(?:${TAIL}|${RUN_END})`,
    // 192.168.0.1:8080/x. Four numbers, so "3.5" and "1.000" are not matched.
    `(?<![\\p{L}\\p{N}._-])\\d{1,3}(?:\\.\\d{1,3}){3}${PORT}?(?:${TAIL}|${RUN_END})`,
    // [::1]:3000/x. At least two colons, so "[2:1]" is not matched.
    `(?<![\\p{L}\\p{N}])\\[(?=[0-9a-f.]*:[0-9a-f.]*:)[0-9a-f:.]+\\]${PORT}?(?:${TAIL})?`,
  ].join("|"),
  "giu"
);

/** Sentence punctuation that never belongs to the end of a URL. */
const TRAILING_PUNCTUATION = ".,;:!?";
/** Closing bracket or quote -> the opener that balances it inside a URL. */
const BALANCING_OPENER: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "”": "“",
  "’": "‘",
  "»": "«",
  "“": "„",
  // Typographic quotes typeset() writes: a closer with no opener in the URL is
  // not part of it, and neither is a trailing opener with no closer.
  "‘": "‚",
  "‚": "‘",
  "„": "“",
};
/** Quotes that are their own opener: unbalanced when their count is odd. */
const SYMMETRIC_QUOTES = new Set(['"', "'"]);

/**
 * How many characters of a URL match belong to the URL. Trailing sentence
 * punctuation is dropped. A trailing bracket or quote is dropped only when the
 * URL holds no opener for it, so `?q='x'` and `/wiki/A_(b)` stay whole.
 */
function urlLength(url: string): number {
  const counts = new Map<string, number>();
  for (const ch of url) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const count = (ch: string) => counts.get(ch) ?? 0;

  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1] ?? "";
    const opener = BALANCING_OPENER[ch];
    const strip =
      TRAILING_PUNCTUATION.includes(ch) ||
      (opener !== undefined && count(ch) > count(opener)) ||
      (SYMMETRIC_QUOTES.has(ch) && count(ch) % 2 === 1);
    if (!strip) {
      break;
    }
    counts.set(ch, count(ch) - 1);
    end -= 1;
  }
  return end;
}

/** One byte per UTF-16 unit: 1 where a web address sits. */
export type Mask = Uint8Array;

/** The mask of every URL, domain and email address in `text`. */
export function findProtectedMask(text: string): Mask {
  const mask = new Uint8Array(text.length);
  for (const match of text.matchAll(URL_PATTERN)) {
    mask.fill(1, match.index, match.index + urlLength(match[0]));
  }
  return mask;
}

/** True when any character of `start..end` is part of a web address. */
export function isProtected(mask: Mask, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (mask[i] === 1) {
      return true;
    }
  }
  return false;
}
