/**
 * Tokens (44 to 80px) and minis (24 to 32px): the identity of the scarf alone, on whole pixels, no
 * filters. A hanging segment with a steel rail overhanging both sides and the club-primary drop
 * turned over the tube, filled with a precomputed chevron knit pattern whose stitch size is the
 * gauge. The tassel count carries the tier (2, 3, 4, 5); the founder's cast-on is a cream stripe at
 * the foot; LEGEND is the band held overhead by two fists. A token has no beats.
 */
import { D913, F57, F69, F710, F35 } from "./charts";
import { avatarSvg } from "./avatar";
import { TASSELS, marksOf } from "./geometry";
import { uid } from "./ids";
import { bmpRects, bw, esc, f2, word } from "./knit";
import { BLUE, SLEEVE_LT, palette, type Palette } from "./palette";
import { cleanProfile, spokenName, type View } from "./view";
import type { CardProfile, CardTheme, TierCode, TokenSize } from "../types";

/** A precomputed knit texture: one chevron per stitch, `pc` px wide (the gauge). */
function chevron(id: string, pc: number): string {
  const h = Math.max(2, Math.round(pc * 0.9));
  return `<pattern id="${id}" width="${pc}" height="${h}" patternUnits="userSpaceOnUse"><path d="M0 ${f2(h * 0.12)}L${f2(pc / 2)} ${f2(h * 0.78)}L${pc} ${f2(h * 0.12)}" stroke="#000" stroke-opacity=".26" stroke-width="${f2(Math.max(0.5, pc * 0.26))}" fill="none"/><path d="M0 ${f2(h * 0.55)}L${f2(pc / 2)} ${f2(h * 1.2)}" stroke="#fff" stroke-opacity=".1" stroke-width="${f2(Math.max(0.4, pc * 0.18))}" fill="none"/></pattern>`;
}

/**
 * Tassels for tokens: a short neck where the strands are gathered, a wrap of the second yarn round
 * the head, then two (minis) or three strands hanging and fanning a little to uneven tips. n of
 * them hang from y. Whole-pixel tops, plain paths, no filters.
 */
function tokTassels(
  n: number,
  x0: number,
  x1: number,
  y: number,
  len: number,
  w: number,
  P: Palette,
  splay: number,
  mini: boolean,
): string {
  let s = "";
  const k = mini ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const x = Math.round(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
    const sp = (i - (n - 1) / 2) * splay;
    const neck = Math.max(1, Math.round(len * 0.16));
    const wrap = Math.max(1, Math.round(len * 0.14));
    const ys = y + neck + wrap; // where the strands fall from
    s += `<rect x="${f2(x - w * 0.35)}" y="${y}" width="${f2(w * 0.7)}" height="${neck + 0.5}" fill="${P.G}" class="mc-tk-tassel"/>`;
    const sw = Math.max(0.75, (w * 0.95) / k);
    for (let j = 0; j < k; j++) {
      const t = (j / (k - 1)) * 2 - 1; // -1 … 1
      const xb = x + t * (w / 2 - sw / 2);
      const xt = x + sp + t * (w / 2 + w * 0.12);
      const yt = y + len - (j % 2 ? 0 : Math.max(1, Math.round(len * 0.1)));
      s += `<path d="M${f2(xb - sw / 2)} ${ys - 0.5}H${f2(xb + sw / 2)}L${f2(xt + sw * 0.35)} ${f2(yt)}H${f2(xt - sw * 0.35)}Z" fill="${P.G}" class="mc-tk-tassel"/>`;
    }
    // the wrap round the head, in the second yarn
    s += `<rect x="${f2(x - w * 0.5)}" y="${y + neck}" width="${f2(w)}" height="${wrap}" rx="${f2(Math.min(wrap, w) * 0.3)}" fill="${P.S}" class="mc-tk-wrap"/>`;
  }
  return s;
}

/** The 84 at each token size: [from size, chart, cell px, gap stitches]. */
const TOK = [
  [80, D913, 2, 2],
  [64, F710, 2, 1],
  [56, F69, 2, 1],
  [44, D913, 1, 2],
  [32, F710, 1, 1],
  [28, F69, 1, 1],
  [0, F57, 1, 1],
] as const;

/**
 * The dash for a token's number carrier: as tall as the 84 would be there, the dash itself two
 * stitches thick (three at 13 rows, the 84's stem weight) and about 60% of the 84's width.
 */
function dashFor(ref: readonly string[]): string[] {
  const h = ref.length;
  const w = bw(ref);
  const t = h >= 13 ? 3 : 2;
  const dw = Math.max(5, Math.round(w * 0.6));
  const left = Math.floor((w - dw) / 2);
  const top = Math.floor((h - t) / 2);
  return Array.from(
    { length: h },
    (_, r) =>
      ".".repeat(left) +
      (r >= top && r < top + t ? "#" : ".").repeat(dw) +
      ".".repeat(w - left - dw),
  );
}

interface Figures {
  bmp: string[];
  k: number;
  w: number;
  h: number;
  nil: boolean;
}

/**
 * The 84 for a token at size s, on whole pixels; steps down while `ok(F)` fails. With no rating
 * yet the figure is the dash, in the 84's box.
 */
function tokenFigures(
  ovr: number | null,
  s: number,
  ok: ((f: Figures) => boolean) | null,
): Figures {
  let i = TOK.findIndex(([min]) => s >= min);
  let F: Figures | null = null;
  for (; i < TOK.length; i++) {
    const [, chart, k, gap] = TOK[i];
    const nil = ovr == null;
    const bmp = nil ? dashFor(word("84", chart, gap)) : word(String(ovr), chart, gap);
    F = { bmp, k, w: bw(bmp) * k, h: bmp.length * k, nil };
    if (!ok || ok(F)) break;
  }
  return F as Figures;
}

/**
 * The base scarf's fringe on a token: no tassels (their count is the tier), a close comb of loose
 * strands along the foot of the drop, whole pixels.
 */
function tokFringe(
  x0: number,
  x1: number,
  y: number,
  len: number,
  P: Palette,
  mini: boolean,
): string {
  const w = mini ? 1 : x1 - x0 >= 40 ? 2 : 1;
  const step = w + 1;
  let s = "";
  for (let x = x0, i = 0; x + w <= x1; x += step, i++) {
    const l = len - (i % 3 === 1 ? Math.max(1, Math.round(len * 0.14)) : i % 3 === 2 ? 1 : 0);
    s += `<rect x="${x}" y="${y}" width="${w}" height="${l}" fill="${P.G}" class="mc-tk-tassel"/>`;
  }
  return s;
}

/** Plain rib on a token, in whole pixels: every second column of `cell` px a darker ridge. */
function tokRib(x: number, y: number, w: number, h: number, cell: number): string {
  let s = "";
  for (let i = 1; x + i * cell < x + w; i += 2) {
    const cw = Math.min(cell, w - i * cell);
    s += `<rect x="${x + i * cell}" y="${y}" width="${cw}" height="${h}" fill="#000" opacity=".26"/>`;
  }
  return s;
}

/** What a token's drawing needs of a view: the profile, its yarns and the mirroring. */
type TokenView = Pick<View, "p" | "P" | "ar">;

/** A token's drawing, drawn left to right (Arabic mirrors the art, never the figures). */
interface TokenArt {
  w: number;
  art: string;
  defs: string;
  figs: string;
  dx: number;
  dy: number;
  dw: number;
  year: { bmp: string[]; w: number; x: number; y: number; fill: string } | null;
}

function tokenHanging(v: TokenView, s: number, mini: boolean, u: string): TokenArt {
  const { p, P, ar } = v;
  const tier = p.tier;
  const bare = !tier;
  const ry = mini ? 1 : Math.max(2, Math.round(s * 0.05));
  const t = mini ? 2 : Math.max(3, Math.round(s * 0.07));
  const railB = ry + t;
  const top = railB + 1;
  const fb = p.founder ? Math.max(3, Math.round(s * 0.08)) : 0; // the founder's cast-on stripe
  const pro = tier === "pro"; // PRO's cream panel, at every size (one polarity)
  const champ = tier === "champion";
  const tl0 = mini ? (s >= 32 ? 9 : s >= 28 ? 8 : 7) : Math.round(s * 0.26);
  let tl = tl0;
  const tlMin = mini ? 5 : Math.round(s * 0.2);
  // the room the figures need: the chart, a stitch of shadow room, the panel's margin
  const need = (F: Figures) => F.h + (mini ? 0 : F.k) + 2 * (mini ? 1 : F.k);
  // the counted journées, one stripe each under the number carrier while there is no rating:
  // a one-pixel gap and a stripe of two pixels (one on a mini). They drop if they do not fit.
  const marks = p.ovr == null ? marksOf(p) : null;
  const ts = mini ? 1 : 2;
  const mh = marks ? marks.n * (ts + 1) : 0;
  let F = tokenFigures(p.ovr, s, null);
  const place = (withMarks: boolean) => {
    const extra = withMarks ? mh : 0;
    while (s - tl - fb - 1 - top < need(F) + extra && tl > tlMin) tl--;
    if (s - tl - fb - 1 - top < need(F) + extra)
      F = tokenFigures(p.ovr, s, (G) => s - tl - fb - 1 - top >= need(G) + extra);
    return s - tl - fb - 1 - top >= need(F) + extra;
  };
  let marksOn = !!marks;
  if (marksOn && !place(true)) {
    marksOn = false;
    tl = tl0;
    F = tokenFigures(p.ovr, s, null);
  }
  if (!marksOn) place(false);
  const k = F.k;
  const sb = s - tl; // the drop's foot
  const bottom = sb - fb - 1;
  // one width per size, whatever the tier: the figures, their margin, the selvedge, the bound edges
  const blue = mini ? 1 : Math.max(1, Math.round(s * 0.03));
  const bind = mini ? 1 : Math.max(1, Math.round(s * 0.035));
  const m = mini ? 1 : k + 1;
  const sh = mini ? 0 : k;
  const sw = F.w + 2 * m + blue + 2 * bind + sh;
  const oh = mini ? 3 : Math.max(4, Math.round(s * 0.1));
  const sx = oh;
  const W = sx + sw + oh;
  const n = bare ? 0 : TASSELS[tier as TierCode];
  const pc = {
    homa: mini ? 2 : s >= 64 ? 4 : 3,
    stade: mini ? 2 : 3,
    pro: 2,
    champion: 2,
    legend: 2,
    base: 2,
  }[tier ?? "base"];
  const defs = chevron(u + "-cv", pc);
  const tw = mini ? 2 : Math.max(3, Math.round(s * 0.085));
  const splay = mini ? 0.45 : s * 0.014;
  const pm = mini ? 1 : k; // the carrier's margin round the figure
  const fy = marksOn
    ? top + Math.round((bottom - top - need(F) - mh) / 2) + pm
    : top + Math.round((bottom - top - F.h - sh) / 2);
  let a = "";
  // the rail, rounded at both ends
  a += `<rect x="0" y="${ry}" width="${W}" height="${t}" rx="${f2(t / 2)}" fill="#A9B2BE"/><rect x="${f2(t / 3)}" y="${ry}" width="${f2(W - (2 * t) / 3)}" height="${f2(t * 0.4)}" rx="${f2(t * 0.2)}" fill="#E6EBF0"/><rect x="${f2(t / 2)}" y="${f2(ry + t - 1)}" width="${f2(W - t)}" height="1" fill="#4E5661"/>`;
  // the drop, turned over the tube
  const y0 = Math.max(0, ry - (mini ? 1 : 2));
  a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="${P.G}" class="mc-tk-sw"/>`;
  if (pro) {
    a += `<rect x="${sx + bind}" y="${fy - pm}" width="${sw - blue - 2 * bind}" height="${F.h + sh + 2 * pm}" fill="${P.C}"/>`;
  }
  a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="url(#${u}-cv)"/>`;
  a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${Math.max(1, ry + Math.round(t / 2) - y0)}" fill="#fff" opacity=".16"/><rect x="${sx}" y="${railB}" width="${sw}" height="${mini ? 1 : Math.max(1, Math.round(t * 0.45))}" fill="#000" opacity=".24"/>`;
  // the Logo Blue selvedge at the end; CHAMPION's bound edges in the second yarn
  a += `<rect x="${sx + sw - blue - bind}" y="${y0}" width="${blue}" height="${sb - y0}" fill="${BLUE}"/>`;
  if (champ)
    a += `<rect x="${sx}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/><rect x="${sx + sw - bind}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/>`;
  // no rating yet: the number carrier is plain rib (the dash is placed over it, below)
  const inX = sx + bind; // the knitted width between the selvedge and the bound edge
  const inW = sw - blue - 2 * bind;
  if (F.nil) a += `<g class="mc-tk-rib">${tokRib(inX, fy - pm, inW, F.h + sh + 2 * pm, k)}</g>`;
  // the counted journées: a knitted stripe in the stripe yarn, or a tacking line (dashes, one pixel
  // high on a token under 64px) for a journée still to come
  if (marksOn && marks) {
    const my = fy + F.h + sh + pm;
    const dash = s >= 64 ? 3 : mini ? 1 : 2; // a tacking dash and the gap after it, in pixels
    for (let i = 0; i < marks.n; i++) {
      const yy = my + i * (ts + 1) + 1;
      if (i < marks.k) {
        a += `<rect x="${inX}" y="${yy}" width="${inW}" height="${ts}" fill="${P.S}" class="mc-tk-stripe"/>`;
        continue;
      }
      let d = "";
      for (let x = inX; x < inX + inW; x += 2 * dash)
        d += `<rect x="${x}" y="${yy}" width="${Math.min(dash, inX + inW - x)}" height="${s >= 64 ? ts : 1}" fill="${P.S}"/>`;
      a += `<g class="mc-tk-tack">${d}</g>`;
    }
  }
  // the founder's cast-on: a cream band at the foot (2026 knitted into it at 80px)
  let year: TokenArt["year"] = null;
  if (fb) {
    a += `<rect x="${sx}" y="${sb - fb}" width="${sw}" height="${fb}" fill="${P.cast}" class="mc-tk-cast"/>`;
    if (s >= 80 && fb >= 5 && p.founder) {
      const yb = word(String(p.founder), F35, 1);
      year = {
        bmp: yb,
        w: bw(yb),
        x: sx + Math.round((sw - bw(yb)) / 2),
        y: sb - fb + Math.floor((fb - 5) / 2),
        fill: P.castInk,
      };
    }
  }
  // the fringe: the tassel count is the tier; the base scarf has a comb of loose strands instead
  const tm = Math.max(tw, Math.round(sw * 0.16));
  a = bare
    ? a + tokFringe(sx + bind, sx + sw - bind, sb, tl, P, mini)
    : a + tokTassels(n, sx + tm, sx + sw - tm, sb, tl, tw, P, splay, mini);
  // the figures (placed by the caller, never mirrored); CHAMPION's carry a knitted drop shadow
  const fx = sx + bind + m + (sh && ar ? k : 0);
  const key = { homa: P.R2, stade: P.Sd, pro: P.K, champion: P.F, legend: P.F, base: P.dash }[
    tier ?? "base"
  ];
  let figs = "";
  if (champ && sh)
    figs += `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
  figs += `<g fill="${key}" data-mc="ovr">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
  return {
    w: W,
    art: a,
    defs,
    figs: `<g shape-rendering="crispEdges">${figs}</g>`,
    dx: fx,
    dy: fy,
    dw: F.w,
    year,
  };
}

/**
 * LEGEND: the band held overhead by the supporter. The shared avatar's hooded head sits between the
 * forearms under the band (cropped at the shoulders), the fists carry a knuckle bump, and each end
 * hangs outside its fist with a cream cast-on (3px or more) and a tassel.
 */
function tokenLegend(v: TokenView, s: number, mini: boolean, u: string): TokenArt {
  const { p, P, ar } = v;
  const F = tokenFigures(p.ovr, s, (G) => G.h <= (mini ? 9 : Math.round(s * 0.36)));
  const k = F.k;
  const sel = mini ? 1 : Math.max(1, Math.round(s * 0.03));
  const m = mini ? 1 : k + 1;
  const sh = mini ? 0 : k;
  const bh = F.h + 2 * m + 2 * sel + sh;
  const by = mini ? 1 : Math.max(2, Math.round(s * 0.04));
  const bwid = F.w + 2 * (m + 1) + sh;
  const fw = mini ? 4 : Math.max(6, Math.round(s * 0.12));
  const fh = Math.round(bh * 0.8);
  const ew = mini ? 3 : Math.max(4, Math.round(s * 0.08));
  const x0 = Math.ceil(fw / 2) + ew;
  const W = 2 * x0 + bwid;
  const fy = by + Math.round((bh - fh) / 2);
  const tl = mini ? 5 : Math.round(s * 0.18);
  const defs = chevron(u + "-cv", 2);
  let a = "";
  // the supporter: the shared avatar, hood up, its head between the forearms, cropped at the shoulders
  const avS = (bwid * 0.4) / 96;
  const hoodTop = by + bh + (mini ? 1 : 2);
  const avY = hoodTop - 58 * avS;
  const avX = W / 2 - 100 * avS;
  const shY = Math.min(s + 1, avY + 186 * avS);
  // the forearms: from each fist down to the shoulders
  const aw = mini ? 3 : Math.max(4, Math.round(s * 0.1));
  for (const [cx, dir] of [
    [x0, -1],
    [x0 + bwid, 1],
  ] as const) {
    const shx = W / 2 + dir * 62 * avS;
    a += `<path d="M${f2(cx - aw / 2)} ${fy + fh - 1}H${f2(cx + aw / 2)}L${f2(shx + aw * 0.75)} ${f2(shY)}H${f2(shx - aw * 0.75)}Z" fill="${SLEEVE_LT}" class="mc-tk-arm"/>`;
  }
  a += avatarSvg({
    x: avX,
    y: avY,
    w: 200 * avS,
    h: 240 * avS,
    torso: SLEEVE_LT,
    seam: "#8a94a3",
    cls: "mc-tk-av",
  });
  // the ends hanging outside the fists, each with a cream cast-on and a tassel
  for (const [cx, dir] of [
    [x0, -1],
    [x0 + bwid, 1],
  ] as const) {
    const ex = dir < 0 ? cx - Math.ceil(fw / 2) - ew + 1 : cx + Math.ceil(fw / 2) - 1;
    const eTop = fy + 1;
    const eh = s - tl - eTop;
    a += `<rect x="${ex}" y="${eTop}" width="${ew}" height="${eh}" fill="${P.G}" class="mc-tk-sw"/>`;
    const cb = Math.max(3, Math.round(s * 0.08));
    a += `<rect x="${ex}" y="${eTop + eh - cb}" width="${ew}" height="${cb}" fill="${p.founder ? P.cast : P.G}" class="${p.founder ? "mc-tk-cast" : ""}"/>`;
    a += tokTassels(1, ex + ew / 2, ex + ew / 2, eTop + eh, tl, Math.max(2, ew - 1), P, 0, mini);
  }
  // the raised band
  a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="${P.G}" class="mc-tk-sw"/>`;
  a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="url(#${u}-cv)"/>`;
  a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${sel}" fill="${P.C}"/><rect x="${x0}" y="${by + bh - sel}" width="${bwid}" height="${sel}" fill="${BLUE}"/>`;
  // the fists: rounded bundles of the scarf with a ridge of knuckles on top (no cream dash)
  for (const cx of [x0, x0 + bwid]) {
    const fx = cx - fw / 2;
    const nk = mini ? 1 : 3;
    const kr = Math.max(0.8, fw / (2 * nk));
    let topPath = `M${f2(fx)} ${f2(fy + kr + 1)}`;
    for (let i = 0; i < nk; i++)
      topPath += `A${f2(kr)} ${f2(kr)} 0 0 1 ${f2(fx + (fw * (i + 1)) / nk)} ${f2(fy + kr + 1)}`;
    a += `<path d="${topPath}V${fy + fh - 2}Q${f2(fx + fw)} ${fy + fh} ${f2(fx + fw - 2)} ${fy + fh}H${f2(fx + 2)}Q${f2(fx)} ${fy + fh} ${f2(fx)} ${fy + fh - 2}Z" fill="${P.G}" stroke="${P.Gxd}" stroke-width="${mini ? 0.6 : 1}" class="mc-tk-fist"/>`;
  }
  const dy = by + sel + m;
  const dx = x0 + Math.round((bwid - F.w - sh) / 2) + (ar && sh ? k : 0);
  const figs = `<g shape-rendering="crispEdges">${sh ? `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>` : ""}<g fill="${P.F}" data-mc="ovr">${bmpRects(F.bmp, 0, 0, k, k)}</g></g>`;
  return { w: W, art: a, defs, figs, dx, dy, dw: F.w, year: null };
}

const sizeOf = (size: TokenSize): number => Math.max(20, Math.round(size || 44));

/** The token's box in CSS px: one width per size at every tier except the raised LEGEND. */
export function tokenWidth(profile: CardProfile, size: TokenSize): number {
  const p = cleanProfile(profile);
  const v: TokenView = { p, P: palette(p), ar: false };
  const s = sizeOf(size);
  const mini = s <= 32;
  const u = "mc-box";
  return p.tier === "legend" ? tokenLegend(v, s, mini, u).w : tokenHanging(v, s, mini, u).w;
}

/** A token: a `<span>` the size of its box, one SVG inside, one sentence for a screen reader. */
export function tokenMarkup(v: View, size: TokenSize, theme: CardTheme, label: string): string {
  const s = sizeOf(size);
  const mini = s <= 32;
  const u = uid("mc-t");
  const b = v.p.tier === "legend" ? tokenLegend(v, s, mini, u) : tokenHanging(v, s, mini, u);
  const { ar, P } = v;
  // the art is drawn left to right and mirrored for Arabic; figures are placed on top, never mirrored
  const mx = (x: number, w: number) => (ar ? b.w - x - w : x);
  let figs = `<g transform="translate(${mx(b.dx, b.dw)} ${b.dy})">${b.figs}</g>`;
  if (b.year)
    figs += `<g fill="${b.year.fill}" transform="translate(${mx(b.year.x, b.year.w)} ${b.year.y})" shape-rendering="crispEdges">${bmpRects(b.year.bmp, 0, 0, 1, 1)}</g>`;
  const art = ar ? `<g transform="matrix(-1 0 0 1 ${b.w} 0)">${b.art}</g>` : b.art;
  const clip = `<clipPath id="${u}-cl"><rect width="${b.w}" height="${s}"/></clipPath>`;
  const cls = [
    "mc-tk",
    `mc-tk--${v.p.tier ?? "base"}`,
    mini ? "mc-tk--mini" : "",
    `mc-tk--${theme}`,
    P.wool ? "mc-tk--wool" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    `<span class="${cls}" role="img" aria-label="${esc(label)}" style="width:${b.w}px;height:${s}px">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${s}" viewBox="0 0 ${b.w} ${s}" aria-hidden="true" focusable="false"><defs>${b.defs}${clip}</defs><g clip-path="url(#${u}-cl)">${art}${figs}</g></svg></span>`
  );
}

/** What a screen reader hears on a token: who, the rating (or none yet), the tier, the founder line. */
export function tokenLabel(v: View): string {
  const { p, s } = v;
  const parts = [spokenName(p.name) || s.a11y.cardOf];
  if (p.ovr == null) {
    parts.push(s.a11y.noRating);
    if (p.minRated) parts.push(s.a11y.counted(p.counted ?? 0, p.minRated));
  } else parts.push(`${p.ovr} ${s.ovr}`);
  if (p.tier) parts.push(s.tiers[p.tier]);
  if (p.founder) parts.push(s.founderLine);
  return parts.join(s.a11y.separator);
}
