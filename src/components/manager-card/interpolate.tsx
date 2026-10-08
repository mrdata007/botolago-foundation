import { Fragment, type ReactNode } from "react";

/**
 * Filling the `{placeholders}` of the Manager Card dictionary (plan section 7.8).
 *
 * Western digits are isolated wherever a number sits in Arabic text, so a neighbouring word, a
 * slash or a colon cannot reorder it: `<bdi dir="ltr">` in the interface (`fill`), the Unicode
 * isolates U+2068 and U+2069 in text that leaves the interface (`fillText`: share messages,
 * labels, image captions). A template is read as Arabic when it contains Arabic script; French
 * text is never touched.
 *
 * What is isolated: a number, and a string that is only a number-like run (`84`, `2026/27`,
 * `16:30`). A name, a link or a phrase is left alone. A phrase that carries its own numbers
 * (« 3 جولات منتهية ») is already isolated by the plural family that made it (`copy.ts`).
 * A placeholder with no value is left as it is, `{name}`, so a missing value shows up in review.
 */
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const NUMBER_LIKE = /^[+-]?\d+(?:[./:,]\d+)*%?$/;

/** Whether a template is Arabic text, so its numbers need isolating. */
export function isArabicTemplate(template: string): boolean {
  return ARABIC_SCRIPT.test(template);
}

function needsIsolation(value: unknown): value is string | number {
  return typeof value === "number" || (typeof value === "string" && NUMBER_LIKE.test(value));
}

/** `<bdi dir="ltr">`: a number, a code or a Latin run kept in order inside Arabic text. */
export function ltr(value: string | number): ReactNode {
  return <bdi dir="ltr">{value}</bdi>;
}

/** `<bdi dir="auto">`: a name another person chose, whichever way it reads. */
export function auto(value: string): ReactNode {
  return <bdi dir="auto">{value}</bdi>;
}

/** U+2068 … U+2069 around a name or a number in text that leaves the interface. */
export function isolateText(value: string | number): string {
  return `${FSI}${value}${PDI}`;
}

/**
 * The template with its placeholders filled, for the interface: numbers in Arabic text come back
 * in `<bdi dir="ltr">`. Returns a plain string when nothing needed an element.
 */
export function fill(template: string, values: Record<string, ReactNode>): ReactNode {
  const arabic = isArabicTemplate(template);
  const parts: ReactNode[] = [];
  let last = 0;
  let needsElement = false;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(template.slice(last, index));
    const name = match[1]!;
    if (!(name in values)) {
      parts.push(match[0]);
    } else {
      const value = values[name];
      if (arabic && needsIsolation(value)) {
        parts.push(<bdi dir="ltr">{value}</bdi>);
        needsElement = true;
      } else if (typeof value === "number") {
        parts.push(String(value));
      } else {
        parts.push(value);
        if (value !== null && value !== undefined && typeof value === "object") needsElement = true;
      }
    }
    last = index + match[0].length;
  }
  if (last < template.length) parts.push(template.slice(last));
  if (!needsElement)
    return parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("");
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? part : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}

/**
 * The template with its placeholders filled, as text: numbers in Arabic text are wrapped in
 * U+2068 … U+2069. For share messages, accessible labels and the share picture.
 */
export function fillText(template: string, values: Record<string, string | number>): string {
  const arabic = isArabicTemplate(template);
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    if (!(name in values)) return whole;
    const value = values[name]!;
    return arabic && needsIsolation(value) ? isolateText(value) : String(value);
  });
}
