/**
 * The full card for HOMA, STADE, PRO, CHAMPION and the base scarf (no tier yet): the scarf folded
 * over the steel crowd-barrier rail. The front drop shows a face of about 1:1.5; the rest of the
 * scarf hangs behind it, parallel, in shadow, and shows as a darker strip along the inline-start
 * edge with a fold lip over the rail and a straight cast-off edge. Read from the rail down, each
 * element on its own band: the 84 (13 rows), the name (8 rows, ALI ·26), a narrow tier strip (a
 * 4-row word), then the season's stripes with the woven patch sewn over them, the cast-on and
 * the fringe.
 *
 * Onboarding states: a card with no rating yet is the finished scarf with an empty carrier, like a
 * new one with no rows. The number band is plain rib with a knitted dash; with no tier it is the
 * base scarf (a tone-on-tone name band, a plain fringe of loose strands, no tier strip, no panel,
 * no binding); k of N is one stripe per counted journée, a solid two-row stripe when knitted and a
 * one-row tacking line while it waits.
 *
 * Beats are the rows that knit (see beats.ts). The number's group, the name's stitches, the serial
 * and the patch sit outside every animated group.
 */
import { castOn } from "./caston";
import { knit } from "./beats";
import {
  BACK_DX,
  CAST,
  FRINGE_LEN,
  FT,
  FW,
  GAUGE,
  hangKey,
  hangingHeight,
  hangingPatchSpec,
  innerStitches,
  marksOf,
  MAX_STRIPES,
  patchBox,
  planHanging,
  RAIL_H,
  RAIL_Y,
  TASSELS,
  TASSEL_W,
  VW,
  X0,
  X1,
  type HangKey,
  type Plan,
} from "./geometry";
import { uid } from "./ids";
import {
  bw,
  castOff,
  f2,
  grid,
  gridRuns,
  hashStr,
  keyRects,
  seeded,
  stamp,
  type Bitmap,
  type Grid,
} from "./knit";
import { digitsArt, tierArt } from "./motifs";
import { nameArt, type NameArt, type RasterText } from "./names";
import { drawPatch, patchSpecOf, textSvg, type PatchText } from "./patch";
import { BLUE, mix } from "./palette";
import { rimOf, type View } from "./view";
import { hatch, looseFringe, stitchPattern, steelGrad, tassel } from "./yarn";
import type { BeatName, CardTheme, TierCode } from "../types";

/** What the draw needs beyond the profile. */
export interface DrawOptions {
  theme: CardTheme;
  beat: BeatName | "";
  /** The share image: text goes to `texts` instead of the SVG, and nothing depends on the CSS. */
  image: boolean;
  raster: RasterText;
}

/** A finished drawing: the SVG body and its size, and (in the image) the text lines it left out. */
export interface Drawn {
  /** Everything inside the <svg>: defs and drawing. */
  body: string;
  w: number;
  h: number;
  texts: PatchText[];
}

/** The numbers a hanging card is built from. */
export interface HangingLayout {
  tier: TierCode | null;
  key: HangKey;
  cols: number;
  c: number;
  bare: boolean;
  homa: boolean;
  binding: boolean;
  selv: boolean;
  nil: boolean;
  marks: { n: number; k: number } | null;
  /** The stripe a "first" or "tick" beat knits in. */
  newStripe: boolean;
  played: number;
  dg: readonly string[];
  nm: NameArt;
  tw: string[];
  plan: Plan;
  pw: number;
  H: number;
}

export function layoutHanging(v: View, beat: BeatName | "", raster: RasterText): HangingLayout {
  const { p, ar } = v;
  const tier = p.tier;
  const key = hangKey(tier);
  const cols = GAUGE[key].cols;
  const c = FW / cols;
  const marks = marksOf(p);
  const played = p.counted == null ? 0 : Math.max(0, Math.min(p.counted, MAX_STRIPES));
  const knitsNewStripe = beat === "first" || beat === "tick";
  const newStripe = knitsNewStripe && (marks ? marks.k > 0 : played > 0);
  const dg = digitsArt(p.ovr);
  const nm = nameArt(v.name, p.founder, ar, innerStitches(tier), raster);
  const tw = tier ? tierArt(tier, ar) : [];
  const spec = hangingPatchSpec(c, ar);
  const patchRows = Math.ceil((patchBox(spec).h + 2) / c);
  const plan = planHanging({
    tier,
    c,
    nameRows: nm.bmp.length,
    tierRows: tw.length,
    marks,
    newStripe,
    played: marks ? 0 : played,
    patchRows,
  });
  return {
    tier,
    key,
    cols,
    c,
    bare: !tier,
    homa: tier === "homa",
    binding: tier === "champion",
    selv: tier === "stade" || tier === "pro",
    nil: p.ovr == null,
    marks,
    newStripe,
    played: marks ? 0 : played,
    dg,
    nm,
    tw,
    plan,
    pw: spec.w,
    H: hangingHeight(plan, c, key),
  };
}

/** A text sink for a draw: the card's own <text>, or the lines the image leaves out. */
export function textSink(image: boolean): { texts: PatchText[]; emit: (t: PatchText) => string } {
  const texts: PatchText[] = [];
  return {
    texts,
    emit: (t) => {
      if (!image) return textSvg(t);
      texts.push(t);
      return "";
    },
  };
}

export function drawHanging(v: View, L: HangingLayout, o: DrawOptions): Drawn {
  const { p, ar, P, s } = v;
  const { beat, image } = o;
  const { c, cols, plan, key } = L;
  const { tier } = L;
  const T = key;
  const Gg = GAUGE[key];
  const SK = p.serial || "0";
  const u = uid();
  const id = (k: string) => `${u}-${k}`;
  const ids = {
    base: id("pb"),
    garter: id("pg"),
    cast: id("pc"),
    clip: id("cl"),
    bclip: id("bc"),
    curl: id("cu"),
    fold: id("fo"),
    grain: id("gr"),
    soft: id("sf"),
    weave: id("wv"),
    weft: id("wf"),
    satin: id("st"),
    rail: id("rl"),
    tape: id("tp"),
    shade: id("sh"),
  };
  const at = (lc: number) => (ar ? cols - 1 - lc : lc); // logical column (from the inline start) → grid column
  const yOf = (row: number) => FT + row * c;
  const yFab = yOf(plan.rows);
  const yCast = yFab + CAST.rows * CAST.c;

  // the stitch grid
  const g: Grid = grid(cols, plan.rows, "G");
  plan.keys.forEach((k, i) => {
    if (k && g[i]) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
  });
  // the number, on its own layer: it sits above the ground and any panel, below only the knit's
  // texture, and is never inside an animated group
  const gO: Grid = grid(cols, plan.rows, "");
  // centre on the stitches between the selvedges (or the bound edges)
  const resStart = L.binding ? 2 : L.selv ? 1 : 0;
  const resEnd = L.binding ? 2 : 1;
  const lo = ar ? resEnd : resStart;
  const hi = cols - (ar ? resStart : resEnd);
  const centre = (bmp: Bitmap) => lo + Math.round((hi - lo - bw(bmp)) / 2);
  const dc = centre(L.dg);
  if (L.binding) stamp(g, L.dg, dc + (ar ? -1 : 1), plan.digits + 1, { "#": "D" }); // a one-stitch knitted drop shadow
  stamp(gO, L.dg, dc, plan.digits, { "#": "O" });
  // HOMA knits the name and its year in the same relief, so the year never outranks the name
  stamp(
    g,
    L.nm.bmp,
    centre(L.nm.bmp),
    plan.name,
    L.homa ? { "#": "R", "*": "y" } : { "#": "N", "*": "Y" },
  );
  stamp(g, L.tw, centre(L.tw), plan.tier, { "#": L.homa ? "R" : "T" });
  // selvedges: cream at the inline start, Logo Blue at the inline end (HOMA: blue only)
  const selvedge = (rows: Grid) => {
    for (const row of rows) {
      row[at(cols - 1)] = "B";
      if (L.selv) row[at(0)] = "C";
    }
  };
  selvedge(g);
  const digitYarn = { homa: P.R, stade: P.Sd, pro: P.K, champion: P.F, base: P.dash }[key];
  const PK: Record<string, string> = {
    G: P.G,
    L: P.L,
    C: P.C,
    B: P.B,
    N: P.N,
    Y: P.Y,
    R: P.R,
    y: P.R,
    S: P.S,
    D: P.D,
    K: P.K,
    F: P.F,
    T: P.T,
    W: L.homa ? P.R : P.S,
  };
  // the founder beat brings the year in on its own, so it is drawn apart from the name
  const yearApart = beat === "founder" && !!p.founder;
  const PKrun: Record<string, string> = { ...PK };
  if (yearApart) {
    delete PKrun.Y;
    delete PKrun.y;
  }

  // the woven patch's text, and the lines the image leaves for the canvas
  const sink = textSink(image);
  const patchSpec = hangingPatchSpec(c, ar);
  const px = X0 + 2 * c;
  const patchY = yOf(plan.patch) + 1;
  const patchIds = { soft: ids.soft, weave: ids.weave, weft: ids.weft, satin: ids.satin };
  const pt = drawPatch(
    { ar, strings: s, stats: p.stats, P, ids: patchIds, emit: sink.emit, image },
    {
      x: px,
      y: patchY,
      w: patchSpec.w,
      keys: ["cap", "sel", "trf", "con"],
      cols: 4,
      head: "logo",
      note: v.note,
      foot: [{ text: v.serialText, serial: true }],
    },
  );

  // defs
  let defs =
    stitchPattern(ids.base, c, { gap: Gg.gap, leg: Gg.leg }) +
    stitchPattern(ids.cast, CAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
    steelGrad(ids.rail) +
    `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
    `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
    `<linearGradient id="${ids.fold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".25" stop-color="#fff" stop-opacity=".08"/>` +
    `<stop offset=".55" stop-color="#000" stop-opacity=".26"/><stop offset=".78" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${ids.shade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".12" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>` +
    `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.3"/></filter>` +
    `<pattern id="${ids.weave}" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 .5H1M1 1.5H2" stroke="#000" stroke-opacity=".13" stroke-width=".6"/><path d="M1.5 0V1M.5 1V2" stroke="#fff" stroke-opacity=".2" stroke-width=".6"/></pattern>` +
    `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".42" fill="${P.patch}" opacity=".46"/></pattern>` +
    hatch(ids.satin, P.Gdk, mix(P.Gdk, "#000000", 0.35), 0.55, 0.3, 58) +
    `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(SK) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;
  if (L.homa) defs += stitchPattern(ids.garter, c, { garter: true, gap: 0.42, leg: 0.3 });
  if (L.binding)
    defs += `<pattern id="${ids.tape}" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="${P.L}"/><rect width="1" height="2.2" fill="#000" opacity=".12"/></pattern>`;

  // the front drop's outline: the fold over the tube, straight edges, the cast-on edge
  const outline = `M${X0} ${FT + 7}Q${X0} ${FT} ${X0 + 7} ${FT}H${X1 - 7}Q${X1} ${FT} ${X1} ${FT + 7}V${f2(yCast)}H${X0}Z`;
  defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;

  // fabric
  let fab = `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yFab - FT + 0.6)}" fill="${P.G}"/>`;
  // the base scarf's name band: a darker lot of the ground yarn under the name (and, with no name
  // yet, an empty band of plain rib)
  if (L.bare) {
    const nr = L.nm.bmp.length + 2;
    let band = "";
    if (beat === "make")
      // row by row, bottom to top; the name's stitches are in the grid above it, never animated
      for (let rr = 0; rr < nr; rr++)
        band += knit(
          beat,
          "band",
          nr - 1 - rr,
          `<rect x="${X0}" y="${f2(yOf(plan.nameBand + rr))}" width="${FW}" height="${f2(c + 0.04)}" fill="${P.Q}"/>`,
          Math.min(26, 310 / (nr - 1)),
        );
    else
      band = `<rect x="${X0}" y="${f2(yOf(plan.nameBand))}" width="${FW}" height="${f2(nr * c)}" fill="${P.Q}"/>`;
    fab += `<g class="mc-nameband">${band}</g>`;
  }
  const sR = plan.strip;
  const eR = plan.stripEnd;
  if (L.homa) {
    // the tier strip: a garter-ridge band in the one yarn
    fab += `<rect x="${X0}" y="${f2(yOf(sR))}" width="${FW}" height="${f2((eR - sR) * c)}" fill="url(#${ids.garter})"/>`;
    // single-colour relief: each raised stitch casts a shadow down and to the inline end and
    // catches a light edge up and to the start
    const sx = f2(c * (ar ? -0.2 : 0.2));
    const relief = (g1: Grid, k: string) => keyRects(g1, k, X0, FT, c, c);
    const reliefAll = relief(g, "R") + relief(g, "y") + relief(gO, "O");
    fab += `<g transform="translate(${sx} ${f2(c * 0.26)})" fill="#020a1c" opacity=".55">${reliefAll}</g>`;
    fab += `<g transform="translate(${f2(-sx * 0.7)} ${f2(-c * 0.16)})" fill="#fff" opacity=".3">${reliefAll}</g>`;
  }
  fab += gridRuns(g, PKrun, X0, FT, c, c, "G");
  if (yearApart) {
    const yy = L.homa ? "y" : "Y";
    fab += `<g class="mc-fy" fill="${L.homa ? P.R : P.Y}">${keyRects(g, yy, X0, FT, c, c)}</g>`;
  }
  // counted journées still to come: a tacking line (three stitches in the stripe yarn, two left)
  const marks = L.marks;
  if (marks)
    for (let i = marks.k - (L.newStripe ? 1 : 0); i < marks.n; i++) {
      const gt = grid(cols, 1, "G");
      for (let cc = 0; cc < cols; cc++) if (cc % 5 < 3) gt[0][cc] = "W";
      selvedge(gt);
      fab += knit(
        beat,
        "tack",
        marks.n - 1 - i,
        `<g class="mc-tack">${gridRuns(gt, PK, X0, yOf(plan.slots[i]), c, c, "G")}</g>`,
        beat === "make" ? Math.min(45, 400 / Math.max(1, marks.n - 1)) : undefined,
      );
    }
  // the stripe that has just been counted (beats "first" and "tick"): two rows, lower first, over
  // its tacking line. The number, the name and the serial are all there in the first frame.
  if (L.newStripe) {
    if (marks) {
      const row0 = plan.slots[marks.k - 1];
      for (let q = 0; q < 2; q++) {
        const gb = grid(cols, 1, "W");
        selvedge(gb);
        fab += knit(
          beat,
          "stripe",
          q,
          `<g class="mc-bt-stripe">${gridRuns(gb, PK, X0, yOf(row0 + 1 - q), c, c, "G")}</g>`,
        );
      }
    } else {
      // past the minimum the season's stripes are one row each: the newest knits in
      const gb = grid(cols, 1, "W");
      selvedge(gb);
      fab += knit(
        beat,
        "stripe",
        0,
        `<g class="mc-bt-stripe">${gridRuns(gb, PK, X0, yOf(plan.season + 2 * L.played - 1), c, c, "G")}</g>`,
      );
    }
  }
  // plain rib: every second stitch column a purl ridge. The number carrier with no rating yet, and
  // an unnamed guest's name band, are rib; the dash is knitted over it in its own yarn.
  const ribBand = (r0: number, n: number) => {
    let rb = "";
    for (let cc = lo; cc < hi; cc++)
      rb +=
        cc % 2 === 1
          ? `<rect x="${f2(X0 + cc * c)}" y="${f2(yOf(r0))}" width="${f2(c)}" height="${f2(n * c)}" fill="#000" opacity=".26"/>`
          : `<rect x="${f2(X0 + cc * c)}" y="${f2(yOf(r0))}" width="${f2(c)}" height="${f2(n * c)}" fill="#fff" opacity=".11"/>`;
    return rb;
  };
  if (L.nil) fab += `<g class="mc-rib">${ribBand(plan.carrier[0], plan.carrier[1])}</g>`;
  if (L.nm.blank) fab += `<g class="mc-rib">${ribBand(plan.nameBand, L.nm.bmp.length + 2)}</g>`;
  // the number (or its dash), in its own yarn, with a hit area so it is what a pointer finds
  const carrierH = plan.carrier[1];
  fab +=
    `<g data-mc="ovr"${p.ovr != null ? ` data-ovr="${p.ovr}"` : ""}>` +
    `<rect class="mc-ovr-hit" x="${f2(X0 + lo * c)}" y="${f2(yOf(plan.carrier[0]))}" width="${f2((hi - lo) * c)}" height="${f2(carrierH * c)}" fill="transparent"/>` +
    `<g fill="${digitYarn}">${keyRects(gO, "O", X0, FT, c, c)}</g></g>`;
  if (L.homa) {
    // V stitches everywhere except the garter band, where only the raised word takes them
    fab += `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yOf(sR) - FT)}" fill="url(#${ids.base})" pointer-events="none"/>`;
    fab += `<rect x="${X0}" y="${f2(yOf(eR))}" width="${FW}" height="${f2(yFab - yOf(eR))}" fill="url(#${ids.base})" pointer-events="none"/>`;
    fab += `<g fill="url(#${ids.base})" pointer-events="none">${keyRects(g.slice(sR, eR), "R", X0, FT + sR * c, c, c)}</g>`;
  } else
    fab += `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yFab - FT)}" fill="url(#${ids.base})" pointer-events="none"/>`;
  // the end: the cast-on (the founder's is cream, with 2026)
  fab += castOn({ founder: p.founder, P, ids, ar, y: yFab, beat });
  // shading: edge curl, the fold over the tube, fibre grain
  fab +=
    `<g pointer-events="none"><rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yCast - FT)}" fill="url(#${ids.curl})"/>` +
    `<rect x="${X0}" y="${FT}" width="${FW}" height="36" fill="url(#${ids.fold})"/>` +
    `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yCast - FT)}" filter="url(#${ids.grain})" opacity=".5"/>` +
    `</g>`;

  // CHAMPION: a woven tape bound over both long edges, a Logo Blue thread down the end-side tape
  let bind = "";
  if (L.binding) {
    const tw2 = f2(c * 1.5);
    for (const side of [0, 1]) {
      const x = side ? X1 - tw2 : X0;
      const endSide = ar ? side === 0 : side === 1;
      bind += `<rect x="${f2(x - (side ? 0 : 0.6))}" y="${FT + 3}" width="${f2(+tw2 + 0.6)}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.tape})"/>`;
      bind += `<rect x="${f2(x)}" y="${FT + 3}" width="${tw2}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.curl})" opacity=".6"/>`;
      if (endSide)
        bind += `<rect x="${f2(x + tw2 / 2 - 0.9)}" y="${FT + 3}" width="1.8" height="${f2(yCast - FT - 3)}" fill="${BLUE}"/>`;
      const sx = side ? x + 0.8 : x + tw2 - 0.8;
      bind += `<path d="M${f2(sx)} ${FT + 6}V${f2(yCast - 2)}" stroke="${P.Gxd}" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".7"/>`;
      bind += `<path d="M${f2(side ? x : x + tw2)} ${FT + 3}V${f2(yCast)}" stroke="#000" stroke-opacity=".28" stroke-width=".8"/>`;
    }
  }

  // the back drop: the other half of the scarf, behind the rail, parallel to the front and in its
  // shadow. It shows beyond the front's inline-start edge, turns over the rail in a fold lip, and
  // ends in a straight cast-off edge above the front's cast-on, so its fringe never adds to the
  // tassel count.
  const rim = rimOf(o.theme, P);
  const sg = ar ? 1 : -1; // toward the inline start
  const bx0 = X0 + sg * BACK_DX;
  const bx1 = X1 + sg * BACK_DX;
  const outerX = ar ? bx1 : bx0;
  const innerX = ar ? X1 : X0; // where the front starts covering it
  const yBackEnd = yFab - 2 * c;
  const bOut = ar
    ? `M${f2(bx0)} ${FT}H${f2(bx1 - 7)}Q${f2(bx1)} ${FT} ${f2(bx1)} ${FT + 7}V${f2(yBackEnd)}H${f2(bx0)}Z`
    : `M${f2(bx1)} ${FT}H${f2(bx0 + 7)}Q${f2(bx0)} ${FT} ${f2(bx0)} ${FT + 7}V${f2(yBackEnd)}H${f2(bx1)}Z`;
  const bMin = f2(Math.min(bx0, bx1));
  let back = `<clipPath id="${ids.bclip}"><path d="${bOut}"/></clipPath><g clip-path="url(#${ids.bclip})">`;
  back += `<rect x="${bMin}" y="${FT}" width="${FW}" height="${f2(yBackEnd - FT)}" fill="${P.Gdk}"/>`;
  back += `<rect x="${bMin}" y="${FT}" width="${FW}" height="${f2(yBackEnd - FT)}" fill="url(#${ids.base})"/>`;
  // in shadow under the rail and the front
  back += `<rect x="${bMin}" y="${FT}" width="${FW}" height="${f2(yBackEnd - FT)}" fill="url(#${ids.shade})"/>`;
  back += `</g>`;
  // the fold lip: the back's top edge turning over the tube, catching the light
  back += `<path d="M${f2(outerX)} ${FT + 9}Q${f2(outerX)} ${FT} ${f2(outerX - sg * 8)} ${FT}H${f2(innerX)}" fill="none" stroke="${P.Glt}" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>`;
  back += castOff(Math.min(outerX, innerX), Math.max(outerX, innerX), yBackEnd, c, P.Gxd);
  back += `<path d="${bOut}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width=".8"/>`;
  if (rim) back += `<path d="${bOut}" fill="none" stroke="${rim}" stroke-width=".8"/>`;

  // the fringe: the tassel count is the tier
  const n = L.bare ? 0 : TASSELS[tier as TierCode];
  const rnd = seeded(hashStr(SK + "fringe" + T.toUpperCase()));
  const tsw = L.bare ? 0 : TASSEL_W[key as Exclude<HangKey, "base">];
  const fringeLen = FRINGE_LEN[key];
  let fringe = "";
  // the base scarf has loose strands instead of tassels, so it counts nothing
  if (L.bare) fringe = looseFringe(X0, X0 + FW, yCast - 3, fringeLen, P, rnd);
  for (let i = 0; i < n; i++) {
    const one = tassel(X0 + (FW * (i + 0.5)) / n, yCast - 3, fringeLen + (rnd() * 6 - 3), tsw, P, {
      rnd,
      twisted: L.binding,
    });
    // the "tier" beat: the newest tassel drops into place, at the inline end
    fringe += `<g class="mc-tassel${beat === "tier" && i === n - 1 ? " mc-tassel-new" : ""}">${one}</g>`;
  }

  // the rail
  const rail =
    `<rect x="1" y="${RAIL_Y}" width="${VW - 2}" height="${RAIL_H}" rx="${RAIL_H / 2}" fill="url(#${ids.rail})"/>` +
    `<rect x="1.5" y="${RAIL_Y + 0.5}" width="${VW - 3}" height="${RAIL_H - 1}" rx="${RAIL_H / 2 - 0.5}" fill="none" stroke="#4E5661" stroke-width="1"/>` +
    `<path d="M8 ${RAIL_Y + 3.4}H${VW - 8}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
  const rimFront = rim
    ? `<path class="mc-rim" d="${outline}" fill="none" stroke="${rim}" stroke-width="1"/>`
    : "";

  const body =
    `<defs>${defs}</defs>` +
    `<g class="mc-back">${back}</g>` +
    rail +
    `<g class="mc-sway">` +
    `<g class="mc-fringe">${fringe}</g>` +
    `<g class="mc-fabric" clip-path="url(#${ids.clip})">${fab}</g>` +
    bind +
    rimFront +
    pt.svg +
    `</g>`;
  return { body, w: VW, h: L.H, texts: sink.texts };
}
