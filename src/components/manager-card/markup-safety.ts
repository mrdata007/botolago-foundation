/**
 * The safety contract of a card renderer's markup (plan section 6.5), as a function a test can
 * run on any renderer's output. A card is inserted with `dangerouslySetInnerHTML`, so the
 * renderer is the only thing standing between a manager's chosen name and the page: every
 * attribute and text node goes through one escape, and only these tags may appear.
 */
import { crestHref } from "./crest-href";

export const ALLOWED_CARD_TAGS = [
  "div",
  "span",
  "p",
  "bdi",
  "svg",
  "g",
  "defs",
  "clipPath",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "use",
  // The club's crest on the tab's disc, and only with an address `crestHref` accepts (below).
  "image",
  // Inert: the fabric grain and the shadows (filters) and the clipped detail (mask).
  "filter",
  "feTurbulence",
  "feColorMatrix",
  "feGaussianBlur",
  "mask",
] as const;

const ALLOWED = new Set<string>(ALLOWED_CARD_TAGS);

/** The names a hostile manager might choose; every renderer is tested against all of them. */
export const HOSTILE_NAMES = [
  "<img src=x onerror=alert(1)>",
  '"><script>alert(1)</script>',
  "{{7*7}}",
  "\u202e",
  "'; javascript:alert(1); '",
  "</text></svg><svg onload=alert(1)>",
] as const;

/**
 * Everything wrong with a piece of renderer output, as readable strings; empty means safe.
 *
 * Checks the tag allow-list, event-handler attributes (by attribute NAME: a name that is
 * "<img src=x onerror=alert(1)>" legitimately sits, escaped, inside an `aria-label`), URL
 * attributes that start with `javascript:`, and that no attribute value holds a raw angle
 * bracket. An unescaped double quote breaks an attribute open, which shows up as a handler, a new
 * tag or a bracket in what follows.
 */
export function findUnsafeMarkup(html: string): string[] {
  const problems: string[] = [];
  for (const match of html.matchAll(/<\/?([A-Za-z][A-Za-z0-9-]*)/g)) {
    if (!ALLOWED.has(match[1]!)) problems.push(`tag <${match[1]}> is not allowed`);
  }
  for (const tag of html.matchAll(/<[A-Za-z][^>]*>/g)) {
    const source = tag[0];
    // Attribute values out, names and structure left.
    const names = source.replace(/="[^"]*"/g, '=""');
    if (/\son[a-z]+\s*=/i.test(names)) problems.push(`event handler in ${source.slice(0, 60)}`);
    if (/\s(?:xlink:)?(?:href|src|action|formaction)\s*=\s*"\s*javascript:/i.test(source)) {
      problems.push(`javascript: URL in ${source.slice(0, 60)}`);
    }
    for (const attribute of source.matchAll(/\s[A-Za-z:-]+="([^"]*)"/g)) {
      if (/[<>]/.test(attribute[1]!)) problems.push("raw angle bracket in an attribute value");
    }
  }
  for (const image of html.matchAll(/<image\b[^>]*>/g)) {
    const href = /\s(?:xlink:)?href="([^"]*)"/.exec(image[0])?.[1];
    // the attribute is escaped (`&amp;` in a query string): read it back before the check
    const raw = href?.replace(/&amp;/g, "&");
    if (!raw || crestHref(raw) === null)
      problems.push(`image with an unsafe href in ${image[0].slice(0, 60)}`);
  }
  if (/<script/i.test(html)) problems.push("a script element");
  return [...new Set(problems)];
}
