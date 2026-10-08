/**
 * A tiny reader for the renderer's own markup, for the tests in this folder only: it splits a
 * string into tags and attributes, finds the inner markup of groups by class, and reads the
 * delays and durations the beats put on rows. It is strict on purpose: any `<` that is not the
 * start of a well-formed tag makes `tokenise` throw, which is how the escape tests notice markup
 * that came from text.
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
    for (const a of m[3].matchAll(ATTR)) attrs[a[1]] = a[2] ?? a[3] ?? "";
    tags.push({
      name: m[2],
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

/** The inner markup of every <g> whose class list holds `cls`. */
export function groupsByClass(html: string, cls: string): string[] {
  const tags = tokenise(html).filter((t) => t.name === "g");
  const out: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (t.closing || !(t.attrs.class ?? "").split(/\s+/).includes(cls)) continue;
    let depth = 1;
    for (let j = i + 1; j < tags.length; j++) {
      if (tags[j].closing) depth--;
      else if (!tags[j].selfClosing) depth++;
      if (depth === 0) {
        out.push(html.slice(t.end, tags[j].start));
        break;
      }
    }
  }
  return out;
}

export function viewBox(html: string): { w: number; h: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(html);
  if (!m) throw new Error("no viewBox");
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** The [start, end) of every knitted row, in ms, from the custom properties the beats set. */
export function knitIntervals(html: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of html.matchAll(/--mc-d:(\d+)ms;--mc-t:(\d+)ms/g))
    out.push([Number(m[1]), Number(m[1]) + Number(m[2])]);
  return out;
}

/** The most rows knitting at the same instant. */
export function peakOverlap(intervals: readonly [number, number][]): number {
  let peak = 0;
  for (const [start] of intervals) {
    const n = intervals.filter(([a, b]) => a <= start && start < b).length;
    peak = Math.max(peak, n);
  }
  return peak;
}
