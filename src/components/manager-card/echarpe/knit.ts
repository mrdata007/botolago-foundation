/**
 * Knitting primitives: pure functions over stitch bitmaps and stitch grids. A bitmap is a list of
 * equal-length rows of '#' (a stitch), '.' (no stitch) and, where a bitmap carries a second yarn,
 * '*'. A grid is a rows-by-columns array of yarn keys. Nothing here touches the DOM.
 */
import type { Font } from "./charts";

export type Bitmap = readonly string[];
/** A bitmap with the row that carries its baseline (the last row of a two-row baseline). */
export interface Motif {
  bmp: Bitmap;
  base?: number;
}
export type Grid = string[][];

/** Two decimals: keeps the markup short and the geometry stable. */
export const f2 = (n: number): number => Math.round(n * 100) / 100;

/** The width of a bitmap in stitches. */
export const bw = (bmp: Bitmap): number => (bmp.length ? bmp[0].length : 0);

const ESC: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/**
 * The one escape for every text node and attribute value the renderer writes. Numbers and
 * strings only; a name is never written through here (it is knitted as geometry), but the
 * accessible label, the season and the serial are.
 */
export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** A small deterministic generator, so a card's fringe is the same on every render. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Joins glyphs side by side (all the same height) with `gap` blank columns. */
export function word(str: string, font: Font, gap = 1): string[] {
  const glyphs = [...String(str)].map(
    (ch) => font[ch] ?? font[ch.toUpperCase()] ?? font[" "] ?? font[0],
  );
  const h = glyphs[0].length;
  const rows: string[] = [];
  for (let r = 0; r < h; r++) rows.push(glyphs.map((g) => g[r]).join(".".repeat(gap)));
  return rows;
}

/** Replaces '#' with another mark, so several yarns can live in one bitmap. */
export const tint = (bmp: Bitmap, ch: string): string[] => bmp.map((r) => r.replace(/#/g, ch));

/**
 * Puts bitmaps side by side, aligned on a shared baseline (`base` is the row of each part that
 * sits on it; it defaults to the part's last row).
 */
export function hjoin(
  parts: readonly Motif[],
  gaps: readonly number[],
): { bmp: string[]; base: number } {
  const baseOf = (p: Motif) => (p.base != null ? p.base : p.bmp.length - 1);
  const above = Math.max(...parts.map(baseOf));
  const below = Math.max(...parts.map((p) => p.bmp.length - 1 - baseOf(p)));
  const H = above + below + 1;
  const rows: string[] = Array.from({ length: H }, () => "");
  parts.forEach((p, i) => {
    const off = above - baseOf(p);
    const w = bw(p.bmp);
    for (let r = 0; r < H; r++) {
      const src = r - off;
      rows[r] += src >= 0 && src < p.bmp.length ? p.bmp[src] : ".".repeat(w);
      if (i < parts.length - 1) rows[r] += ".".repeat(gaps[i] != null ? gaps[i] : 1);
    }
  });
  return { bmp: rows, base: above };
}

export function grid(cols: number, rows: number, fill: string): Grid {
  return Array.from({ length: rows }, () => new Array<string>(cols).fill(fill));
}

/** Writes a bitmap into the grid; `map` turns each mark into a yarn key. */
export function stamp(
  g: Grid,
  bmp: Bitmap,
  col: number,
  row: number,
  map: Readonly<Record<string, string>>,
): void {
  for (let r = 0; r < bmp.length; r++)
    for (let c = 0; c < bmp[r].length; c++) {
      const v = map[bmp[r][c]];
      if (!v) continue;
      const gr = row + r;
      const gc = col + c;
      if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = v;
    }
}

/** Merged rectangles for the cells of a bitmap that carry `mark`. */
export function bmpRects(
  bmp: Bitmap,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
  mark = "#",
): string {
  let s = "";
  for (let r = 0; r < bmp.length; r++) {
    let c = 0;
    while (c < bmp[r].length) {
      if (bmp[r][c] !== mark) {
        c++;
        continue;
      }
      let e = c;
      while (e < bmp[r].length && bmp[r][e] === mark) e++;
      s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch)}"/>`;
      c = e;
    }
  }
  return s;
}

/** Colour runs of a stitch grid: only the cells whose key differs from `base` and has a yarn. */
export function gridRuns(
  g: Grid,
  yarn: Readonly<Record<string, string>>,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
  base: string,
): string {
  let s = "";
  for (let r = 0; r < g.length; r++) {
    const row = g[r];
    let c = 0;
    while (c < row.length) {
      const k = row[c];
      let e = c + 1;
      while (e < row.length && row[e] === k) e++;
      if (k !== base && yarn[k])
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}" fill="${yarn[k]}"/>`;
      c = e;
    }
  }
  return s;
}

/** Rects for every cell of the grid holding key `k` (also used to clip textures to a motif). */
export function keyRects(
  g: Grid,
  k: string,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
): string {
  let s = "";
  for (let r = 0; r < g.length; r++) {
    let c = 0;
    while (c < g[r].length) {
      if (g[r][c] !== k) {
        c++;
        continue;
      }
      let e = c;
      while (e < g[r].length && g[r][e] === k) e++;
      s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}"/>`;
      c = e;
    }
  }
  return s;
}

/** Rects for the cells holding key `k` in rows [r0, r1). */
export function keyRectsIn(
  g: Grid,
  k: string,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
  r0: number,
  r1: number,
): string {
  return keyRects(g.slice(r0, r1), k, x0, y0 + r0 * ch, cw, ch);
}

/** Lines stacked and centred, `gap` blank rows apart. */
export function vstack(parts: readonly Bitmap[], gap = 1): string[] {
  const W = Math.max(...parts.map(bw));
  const rows: string[] = [];
  parts.forEach((b, i) => {
    if (i) for (let g = 0; g < gap; g++) rows.push(".".repeat(W));
    const l = Math.floor((W - bw(b)) / 2);
    b.forEach((row) => rows.push(".".repeat(l) + row + ".".repeat(W - l - row.length)));
  });
  return rows;
}

/**
 * Drops blank rows and columns round a bitmap; returns the rows and how many were cut at the
 * top. A bitmap with no stitch at all is returned as it is.
 */
export function trim(bmp: Bitmap): { bmp: string[]; top: number } {
  let t = 0;
  let b = bmp.length - 1;
  while (t <= b && bmp[t].indexOf("#") < 0) t++;
  while (b >= t && bmp[b].indexOf("#") < 0) b--;
  const rows = bmp.slice(t, b + 1);
  if (!rows.length) return { bmp: [...bmp], top: 0 };
  let l = Infinity;
  let r = -1;
  for (const row of rows) {
    const i = row.indexOf("#");
    if (i >= 0) {
      l = Math.min(l, i);
      r = Math.max(r, row.lastIndexOf("#"));
    }
  }
  return { bmp: rows.map((row) => row.slice(l, r + 1)), top: t };
}

/** Drops blank rows only (keeps the chart's width). */
export function trimRows(bmp: Bitmap): string[] {
  let t = 0;
  let b = bmp.length - 1;
  while (t <= b && !/[^.]/.test(bmp[t])) t++;
  while (b >= t && !/[^.]/.test(bmp[b])) b--;
  return bmp.slice(t, b + 1);
}

/** A straight cast-off edge: the bind-off loops along a knitted end. */
export function castOff(xa: number, xb: number, y: number, step: number, ink: string): string {
  let d = "";
  for (let x = xa + step / 2; x < xb - 1; x += step)
    d += `M${f2(x - step * 0.36)} ${f2(y - 0.4)}a${f2(step * 0.36)} ${f2(step * 0.28)} 0 0 0 ${f2(step * 0.72)} 0`;
  return `<path d="${d}" stroke="${ink}" stroke-width="1" fill="none"/>`;
}

/**
 * Every way to cut a name into n lines: at spaces when it has several words, else between
 * letters (at least two letters a line).
 */
export function splits(name: string, n: number): string[][] {
  const words = name.split(/\s+/).filter(Boolean);
  const byWord = words.length >= n;
  const units = byWord ? words : [...name.replace(/\s+/g, "")];
  const joiner = byWord ? " " : "";
  const min = byWord ? 1 : 2;
  const out: string[][] = [];
  const rec = (start: number, left: number, acc: string[]): void => {
    if (left === 1) {
      if (units.length - start >= min) out.push([...acc, units.slice(start).join(joiner)]);
      return;
    }
    for (let e = start + min; e <= units.length - min * (left - 1); e++)
      rec(e, left - 1, [...acc, units.slice(start, e).join(joiner)]);
  };
  rec(0, n, []);
  return out;
}
