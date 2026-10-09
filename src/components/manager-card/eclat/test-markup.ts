/**
 * A tiny reader for the renderer's own markup, for the tests in this folder only: it splits a
 * string into tags and attributes, finds the layers of a card, the inner markup of groups by class
 * and the texts with their attributes. It is strict on purpose: any `<` that is not the start of a
 * well-formed tag makes `tokenise` throw, which is how the escape tests notice markup that came
 * from text.
 */
export interface Tag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Record<string, string>;
  /** Where the tag starts and ends in the source. */
  start: number;
  end: number;
}

const TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

export function tokenise(html: string): Tag[] {
  const tags: Tag[] = [];
  let lt = 0;
  for (const ch of html) if (ch === "<") lt++;
  for (const m of html.matchAll(TAG)) {
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(ATTR)) attrs[a[1]!] = a[2] ?? a[3] ?? "";
    tags.push({
      name: m[2]!,
      closing: m[1] === "/",
      selfClosing: m[4] === "/",
      attrs,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  if (tags.length !== lt)
    throw new Error(`stray "<": ${lt} found, ${tags.length} well-formed tags`);
  return tags;
}

/** The inner markup of every element named `name` whose class list holds `cls`. */
export function elementsByClass(html: string, name: string, cls: string): string[] {
  const tags = tokenise(html).filter((t) => t.name === name);
  const out: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i]!;
    if (t.closing || !(t.attrs.class ?? "").split(/\s+/).includes(cls)) continue;
    if (t.selfClosing) {
      out.push("");
      continue;
    }
    let depth = 1;
    for (let j = i + 1; j < tags.length; j++) {
      if (tags[j]!.closing) depth--;
      else if (!tags[j]!.selfClosing) depth++;
      if (depth === 0) {
        out.push(html.slice(t.end, tags[j]!.start));
        break;
      }
    }
  }
  return out;
}

/** The inner markup of every `<g>` whose class list holds `cls`. */
export const groupsByClass = (html: string, cls: string): string[] =>
  elementsByClass(html, "g", cls);

/** The inner markup of the card's layer `name` (base, shirt, num, frame, holo); null when absent. */
export function layer(html: string, name: string): string | null {
  const m = new RegExp(`<svg class="mc-l mc-l--${name}"[^>]*>(.*?)</svg>`, "s").exec(html);
  return m ? m[1]! : null;
}

export interface TextEl {
  attrs: Record<string, string>;
  text: string;
  size: number;
}

/** Every `<text>` of a piece of markup, with its attributes and content. */
export function texts(html: string): TextEl[] {
  const out: TextEl[] = [];
  for (const m of html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(ATTR)) attrs[a[1]!] = a[2] ?? a[3] ?? "";
    out.push({
      attrs,
      text: m[2]!.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
      size: Number(attrs["font-size"] ?? 0),
    });
  }
  return out;
}

/** The texts carrying a `data-<key>` attribute. */
export const textsWith = (html: string, key: string): TextEl[] =>
  texts(html).filter((t) => key in t.attrs || `data-${key}` in t.attrs);

export function viewBox(html: string): { w: number; h: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(html);
  if (!m) throw new Error("no viewBox");
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** The bounding box of a path made of M, L, H, V, C, Q and Z (curves sampled), for geometry tests. */
export function pathBox(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const tokens = d.match(/[MLHVCQSZ]|-?\d*\.?\d+/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd === "Z") continue;
    if (cmd === "M" || cmd === "L") {
      x = num();
      y = num();
      pts.push([x, y]);
    } else if (cmd === "H") {
      x = num();
      pts.push([x, y]);
    } else if (cmd === "V") {
      y = num();
      pts.push([x, y]);
    } else if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()] as const;
      for (let t = 0; t <= 1; t += 0.02) {
        const u = 1 - t;
        pts.push([
          u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (cmd === "Q") {
      const [x1, y1, x2, y2] = [num(), num(), num(), num()] as const;
      for (let t = 0; t <= 1; t += 0.02) {
        const u = 1 - t;
        pts.push([
          u * u * x + 2 * u * t * x1 + t * t * x2,
          u * u * y + 2 * u * t * y1 + t * t * y2,
        ]);
      }
      x = x2;
      y = y2;
    } else throw new Error(`unsupported path command ${cmd}`);
  }
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  };
}

/** The path sampled as a polygon (curves in 24 steps), for point-in-shape tests. */
export function pathPolygon(d: string): [number, number][] {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd === "Z") continue;
    if (cmd === "M" || cmd === "L") {
      x = num();
      y = num();
      pts.push([x, y]);
    } else if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()] as const;
      for (let t = 1 / 24; t <= 1.0001; t += 1 / 24) {
        const u = 1 - t;
        pts.push([
          u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (cmd === "Q") {
      const [x1, y1, x2, y2] = [num(), num(), num(), num()] as const;
      for (let t = 1 / 24; t <= 1.0001; t += 1 / 24) {
        const u = 1 - t;
        pts.push([
          u * u * x + 2 * u * t * x1 + t * t * x2,
          u * u * y + 2 * u * t * y1 + t * t * y2,
        ]);
      }
      x = x2;
      y = y2;
    } else throw new Error(`unsupported path command ${cmd}`);
  }
  return pts;
}

/** Whether (px, py) is inside the polygon (even-odd). */
export function inside(
  poly: readonly (readonly [number, number])[],
  px: number,
  py: number,
): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
