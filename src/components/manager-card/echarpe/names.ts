/**
 * Names on the scarf (plan 6.4.1). The app has one name string; its SCRIPT chooses the chart
 * (Latin capitals or Arabic) and the INTERFACE language chooses the mirroring. A name is knitted as
 * geometry and never written as text, so it cannot carry markup into the card.
 *
 * A name that does not fit steps down a ladder (8 rows, then 7, then 6 condensed, the year stacked
 * above the name's end, then two or three lines); it is never cut to an initial.
 */
import { AR_NAME, F34, F35, N6, N7, N8, type Font } from "./charts";
import type { KnitName } from "./knit-name";
import { bw, hjoin, splits, tint, trim, vstack, word, type Bitmap, type Motif } from "./knit";

/** A sampled Arabic bitmap, from the browser's canvas; null where there is none (server, tests). */
export type RasterText = (text: string, rows: number) => { bmp: string[]; base: number } | null;

export interface NameArt {
  /** Name stitches '#', year stitches '*'. */
  bmp: string[];
  /** The row of the name's baseline. */
  base: number;
  rows: number;
  /** True when nothing could be knitted: the name band is plain rib. */
  blank: boolean;
}

const blankArt = (rows: number): NameArt => ({
  bmp: Array<string>(rows).fill(""),
  base: rows - 1,
  rows,
  blank: true,
});

/** The year as a bitmap marked '*': '·26' (Latin), '26·' (Arabic, in visual order). */
export function yearArt(yr: string, fig: Font, ar: boolean): { bmp: string[]; base: number } {
  const h = fig[0].length;
  const dot: Motif = {
    bmp: Array.from({ length: h }, (_, i) => (i === Math.floor(h / 2) ? "*" : ".")),
  };
  const digits: Motif = { bmp: tint(word(yr, fig, 1), "*") };
  return hjoin(ar ? [digits, dot] : [dot, digits], [1]);
}

/** The year on the name's baseline, after the name (before it on the page in Arabic). */
function yearInline(name: Motif, yb: Motif, g: number, ar: boolean) {
  return ar ? hjoin([yb, name], [g]) : hjoin([name, yb], [g]);
}

/**
 * The year above the end of the name (right in Latin, left in Arabic), as low as it can sit with
 * one clear stitch round every stitch of the name.
 */
function yearTuck(name: Motif, yb: Motif, ar: boolean): { bmp: string[]; base: number } {
  const nb = name.bmp;
  const nh = nb.length;
  const nw = bw(nb);
  const yw = bw(yb.bmp);
  const yh = yb.bmp.length;
  const W = Math.max(nw, yw);
  const nx = ar ? 0 : W - nw;
  const yx = ar ? 0 : W - yw;
  const hit = (top: number): boolean => {
    for (let r = 0; r < yh; r++)
      for (let c = 0; c < yw; c++) {
        if (yb.bmp[r][c] === ".") continue;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const gr = top + r + dr;
            const gc = yx + c + dc - nx;
            if (gr >= 0 && gr < nh && gc >= 0 && gc < nw && nb[gr][gc] !== ".") return true;
          }
      }
    return false;
  };
  const base = name.base != null ? name.base : nh - 1;
  let top = base - yh + 1;
  while (top > -yh - 1 && hit(top)) top--;
  const off = Math.max(0, -top);
  const H = Math.max(nh + off, top + off + yh);
  const rows = Array.from({ length: H }, () => new Array<string>(W).fill("."));
  const paint = (bmp: Bitmap, x: number, y: number) =>
    bmp.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch !== ".") rows[y + r][x + c] = ch;
      }),
    );
  paint(nb, nx, off);
  paint(yb.bmp, yx, top + off);
  return { bmp: rows.map((r) => r.join("")), base: base + off };
}

const LATIN: readonly { f: Font; y: Font }[] = [
  { f: N8, y: F35 },
  { f: N7, y: F35 },
  { f: N6, y: F34 },
];

/** The one-line rungs: 8, 7, then 6 rows with the year after the name, then the year stacked above. */
function latinOneLine(up: string, yr: string, inner: number): NameArt | null {
  const fits = (b: Motif) => bw(b.bmp) <= inner;
  const done = (b: { bmp: string[]; base: number }, rows: number): NameArt => ({
    bmp: b.bmp,
    base: b.base,
    rows,
    blank: false,
  });
  // 1. one line, the year on the baseline after it (8 rows, then 7, then 6)
  for (const F of LATIN) {
    const nb: Motif = { bmp: word(up, F.f, 1), base: F.f.A.length - 1 };
    if (!yr) {
      if (fits(nb)) return done({ bmp: [...nb.bmp], base: nb.base as number }, F.f.A.length);
      continue;
    }
    const yb = yearArt(yr, F.y, false);
    for (const g of [2, 1]) {
      const j = yearInline(nb, yb, g, false);
      if (fits(j)) return done(j, F.f.A.length);
    }
  }
  // 2. one line, the year stacked above its end
  if (yr)
    for (const F of LATIN) {
      const nb: Motif = { bmp: word(up, F.f, 1), base: F.f.A.length - 1 };
      const j = yearTuck(nb, yearArt(yr, F.y, false), false);
      if (fits(j)) return done(j, F.f.A.length);
    }
  return null;
}

/**
 * Two lines, then three or four. A break between two consonants (YAS|MINE, OTH|MANE, SAL|MA) reads
 * as a syllable; any other break is a last resort. The year goes after the last line, else on a
 * line of its own.
 */
function latinLines(
  up: string,
  yr: string,
  inner: number,
  counts: readonly number[],
): NameArt | null {
  const V = /[AEIOUY]/;
  const cost = (parts: readonly string[]) =>
    parts.slice(1).reduce((t, part, i) => {
      const prev = parts[i];
      const a = prev[prev.length - 1];
      const b = part[0];
      if (a === " " || b === " " || /\s/.test(up)) return t;
      return t + (!V.test(a) && !V.test(b) ? 0 : !V.test(b) ? 1 : 3);
    }, 0);
  for (const n of counts) {
    const cands: { b: string[]; rank: number; rows: number }[] = [];
    for (const F of LATIN.slice(1))
      for (const parts of splits(up, n)) {
        const lines = parts.map((t) => word(t, F.f, 1));
        const rows = F.f.A.length;
        if (!yr) {
          const b = vstack(lines);
          if (bw(b) <= inner) cands.push({ b, rank: cost(parts) * 10, rows });
          continue;
        }
        const yb = yearArt(yr, F.y, false);
        let placed: string[] | null = null;
        for (const g of [2, 1]) {
          const b = vstack([
            ...lines.slice(0, -1),
            yearInline({ bmp: lines[n - 1] }, yb, g, false).bmp,
          ]);
          if (bw(b) <= inner) {
            placed = b;
            break;
          }
        }
        if (placed) cands.push({ b: placed, rank: cost(parts) * 10, rows });
        else {
          // the year on a line of its own, set at the end of the name (right-aligned)
          const wmax = Math.max(...lines.map(bw));
          const yl = yb.bmp.map((r) => ".".repeat(Math.max(0, wmax - bw(yb.bmp))) + r);
          const b = vstack([...lines, yl]);
          if (bw(b) <= inner) cands.push({ b, rank: cost(parts) * 10 + 5, rows });
        }
      }
    if (cands.length) {
      // the best break first, then the larger capitals, then the narrower block
      cands.sort((x, y) => x.rank - y.rank || y.rows - x.rows || bw(x.b) - bw(y.b));
      const best = cands[0];
      return { bmp: best.b, base: best.b.length - 1, rows: best.rows, blank: false };
    }
  }
  return null;
}

/**
 * The Latin ladder. `up` is already upper-case A-Z, spaces and hyphens. A name that the gauge
 * cannot hold in four lines (HOMA is the narrowest) is cut at a word boundary, as the 24-character
 * cut is, and tried again, so the card never grows a line a letter long.
 */
export function latinName(up: string, yr: string, inner: number): NameArt {
  const words = up.split(" ");
  for (let w = words.length; w >= 1; w--) {
    const text = words.slice(0, w).join(" ");
    const a = latinOneLine(text, yr, inner) ?? latinLines(text, yr, inner, [2, 3, 4]);
    if (a) return a;
  }
  // one long word on the narrowest gauge: five or six lines
  const long = latinLines(words[0], yr, inner, [5, 6]);
  if (long) return long;
  // the narrowest: one letter a line would still be a name, never a single initial
  const b = vstack([...words[0].replace(/\s+/g, "")].map((ch) => word(ch, N6, 1)));
  return { bmp: b, base: b.length - 1, rows: 6, blank: false };
}

/**
 * The Arabic ladder: the hand charts, then Changa 800 sampled at falling row counts, then several
 * lines. A name that still does not fit loses its trailing words (the cut the 24-character limit
 * makes, at a word boundary) and is tried again.
 */
export function arabicName(name: string, yr: string, inner: number, raster: RasterText): NameArt {
  const words = name.split(/\s+/).filter(Boolean);
  for (let w = words.length; w >= 1; w--) {
    const a = arabicLadder(words.slice(0, w).join(" "), yr, inner, raster);
    if (a.blank || bw(a.bmp) <= inner || w === 1) return a;
  }
  return blankArt(12);
}

function arabicLadder(name: string, yr: string, inner: number, raster: RasterText): NameArt {
  const fits = (b: Motif) => bw(b.bmp) <= inner;
  const ybs = yr ? [yearArt(yr, F35, true), yearArt(yr, F34, true)] : [null];
  const tries: (() => { bmp: readonly string[]; base: number } | null)[] = [];
  const chart = (AR_NAME as Record<string, { base: number; bmp: readonly string[] }>)[name];
  const condensed = (AR_NAME as Record<string, { base: number; bmp: readonly string[] }>)[
    name + "~"
  ];
  if (chart) tries.push(() => chart);
  if (condensed) tries.push(() => condensed);
  for (const rows of [12, 11, 10, 9, 8, 7, 6]) tries.push(() => raster(name, rows));
  let last: Motif | null = null;
  let lastRows = 0;
  for (const attempt of tries) {
    const raw = attempt();
    if (!raw) continue;
    const tr = trim(raw.bmp);
    const nb: Motif = { bmp: tr.bmp, base: Math.max(0, raw.base - tr.top) };
    last = nb;
    lastRows = nb.bmp.length;
    if (!yr) {
      if (fits(nb))
        return { bmp: [...nb.bmp], base: nb.base as number, rows: nb.bmp.length, blank: false };
      continue;
    }
    for (const yb of ybs) {
      if (!yb) continue;
      for (const g of [2, 1]) {
        const j = yearInline(nb, yb, g, true);
        if (fits(j)) return { ...j, rows: nb.bmp.length, blank: false };
      }
      const k = yearTuck(nb, yb, true);
      if (fits(k)) return { ...k, rows: nb.bmp.length, blank: false };
    }
  }
  // a long name of several words (عبد الله يوسف): two lines, then three, broken at the spaces, each
  // line sampled from Changa 800 like the one-line fallback; the year ends the last line, or has a
  // line of its own at the inline end
  const words = name.split(/\s+/).filter(Boolean);
  for (let n = 2; n <= Math.min(3, words.length); n++)
    for (const rows of [9, 8, 7, 6]) {
      const cands: { b: string[]; w: number }[] = [];
      for (const parts of splits(words.join(" "), n)) {
        const lines: Motif[] = [];
        for (const t of parts) {
          const raw = raster(t, rows);
          if (!raw) break;
          const tr = trim(raw.bmp);
          lines.push({ bmp: tr.bmp, base: Math.max(0, raw.base - tr.top) });
        }
        if (lines.length !== parts.length) continue;
        let tail: Motif = lines[n - 1];
        let own: string[] | null = null;
        const yb = ybs[0];
        if (yr && yb) {
          const j = [2, 1].map((g) => yearInline(tail, yb, g, true)).find(fits);
          if (j) tail = j;
          else own = yb.bmp;
        }
        const stack: string[][] = [
          ...lines.slice(0, -1).map((l) => [...l.bmp]),
          [...tail.bmp],
          ...(own ? [own] : []),
        ];
        const w = Math.max(...stack.map(bw));
        // lines are centred; the year's own line sits at the inline end (the left, in Arabic)
        const b = vstack(
          stack.map((rowsOf, i) =>
            own && i === stack.length - 1
              ? rowsOf.map((r) => r + ".".repeat(w - bw(rowsOf)))
              : rowsOf,
          ),
          2,
        );
        if (bw(b) <= inner) cands.push({ b, w: bw(b) });
      }
      if (cands.length) {
        cands.sort((x, y) => x.w - y.w);
        return { bmp: cands[0].b, base: cands[0].b.length - 1, rows, blank: false };
      }
    }
  if (!last) return blankArt(12);
  const yb = ybs[ybs.length - 1];
  const k = yr && yb ? yearTuck(last, yb, true) : { bmp: [...last.bmp], base: last.base as number };
  return { bmp: k.bmp, base: k.base, rows: lastRows, blank: false };
}

/**
 * The name and the supporter year (ALI ·26): name stitches '#', year stitches '*'. In Arabic the
 * year comes first on the page (26· علي), the dot between the year and the name. `ar` is the
 * INTERFACE language: it only sets the height of an empty band.
 */
export function nameArt(
  name: KnitName,
  founder: number | null,
  ar: boolean,
  inner: number,
  raster: RasterText,
): NameArt {
  // a guest before naming: the name carrier is drawn empty, at the height a name would take
  if (name.script === "none") return blankArt(ar ? 12 : 8);
  const yr = founder ? String(founder).slice(-2) : "";
  return name.script === "arabic"
    ? arabicName(name.text, yr, inner, raster)
    : latinName(name.text, yr, inner);
}
