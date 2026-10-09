/**
 * The full card for LEGEND: « Écharpe levée ». The scarf is lifted off the rail and held taut
 * overhead by the supporter, seen from behind (the shared avatar, hood up, cropped at the card's
 * foot, its hood seam showing). The arms rise in bench-jacket sleeves to two fists wound in the
 * scarf, knuckles showing through the knit (no skin tone). The raised span carries the same bands
 * as the hanging scarf: the 84 (13 rows, a knitted drop shadow), the name, and the LEGEND strip.
 * The two ends hang long, outside the fists, down to the card's foot: CAP and SEL with the logo on
 * the reading-start end, TRF and CON with the serial on the other, then the season's stripes, a
 * cream cast-on and cast-off, the knotted fringe. Portrait, about 1:1.45, the same height budget as
 * the hanging tiers. Drawn in LTR units; Arabic mirrors the structure, never the knitted words.
 *
 * The beat ("legend"): the arms rise and the fists settle. The band carries the number and the ends
 * carry the serial, so neither moves.
 */
import {
  LEGEND_INNER,
  LGC,
  LG_BY,
  LG_END_W,
  LG_GATHER,
  LG_PAD,
  TASSELS,
  legendFrame,
  patchBox,
  type LegendFrame,
  type PatchSpec,
} from "./geometry";
import { uid } from "./ids";
import { avatarSvg, AVATAR } from "./avatar";
import {
  bmpRects,
  bw,
  f2,
  grid,
  gridRuns,
  hashStr,
  keyRects,
  seeded,
  stamp,
  word,
  type Bitmap,
  type Grid,
} from "./knit";
import { digitsArt, tierArt } from "./motifs";
import { nameArt, type NameArt, type RasterText } from "./names";
import { drawPatch, type PatchDraw } from "./patch";
import { F35 } from "./charts";
import { BLUE, SLEEVE, SLEEVE_LT, mix } from "./palette";
import { rimOf, type View } from "./view";
import { hatch, steelGrad, stitchPattern, tassel } from "./yarn";
import { textSink, type DrawOptions, type Drawn } from "./hanging";

const PAD = LG_PAD;
const END_W = LG_END_W;
const GATHER = LG_GATHER;
const BY = LG_BY;
const LCAST = { c: 5, rows: 5 } as const;
const FRINGE_LEN = 54;
const PK_W = END_W - 12;

export interface LegendLayout extends LegendFrame {
  dg: readonly string[];
  nm: NameArt;
  tw: string[];
  keys: string[];
  R: { digits: number; name: number; strip: number };
  patchA: PatchSpec;
  patchB: PatchSpec;
  ph: number;
}

const patchSpecs = (ar: boolean): [PatchSpec, PatchSpec] => [
  { k: 1.3, w: PK_W, keys: 2, cols: 1, head: "logo", footLines: 0, footFs: 4.4, ar },
  { k: 1.3, w: PK_W, keys: 2, cols: 1, head: "season", footLines: 1, footFs: 4.4, ar },
];

export function layoutLegend(v: View, raster: RasterText): LegendLayout {
  const { p, ar } = v;
  const dg = digitsArt(p.ovr);
  const nm = nameArt(v.name, p.founder, ar, LEGEND_INNER, raster);
  const tw = tierArt("legend", ar);
  const content = Math.max(bw(dg) + 1, bw(nm.bmp), bw(tw));
  const fr = legendFrame(nm.bmp.length, tw.length, content);
  // the band's rows (across the scarf): cream selvedge, the 84, the name, the tier strip, Logo Blue selvedge
  const keys: string[] = new Array<string>(fr.nRows).fill("");
  keys[0] = "C";
  for (let i = 0; i < tw.length + 2; i++) keys[fr.rows.strip + i] = "S";
  keys[fr.nRows - 1] = "B";
  const [patchA, patchB] = patchSpecs(ar);
  const ph = Math.max(patchBox(patchA).h, patchBox(patchB).h);
  return { ...fr, dg, nm, tw, keys, R: fr.rows, patchA, patchB, ph };
}

export function drawLegend(v: View, Ly: LegendLayout, o: DrawOptions): Drawn {
  const { p, ar, P, s } = v;
  const { beat, image } = o;
  const u = uid();
  const id = (k: string) => `${u}-${k}`;
  const ids = {
    base: id("pb"),
    flap: id("pf"),
    cast: id("pc"),
    clip: id("cl"),
    curl: id("cu"),
    soft: id("sf"),
    weave: id("wv"),
    weft: id("wf"),
    satin: id("st"),
    grain: id("gr"),
    sleeve: id("sl"),
    dA: id("da"),
    dB: id("db"),
    arms: id("ar"),
    fade: id("fd"),
    mask: id("mk"),
    rail: id("rl"),
  };
  const c = LGC;
  const { dg, nm, tw, R, nRows, BH, mid, fa, fb, xs, bandCols, W, H, avS, shY, railY, ph } = Ly;
  const rim = rimOf(o.theme, P);
  const top = BY;
  const bot = BY + BH;
  const xe = Ly.xe;
  const cols = Math.round((fb - fa) / c);
  const g: Grid = grid(cols, nRows, "G");
  Ly.keys.forEach((k, i) => {
    if (k) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
  });
  const gO: Grid = grid(cols, nRows, "");
  const c0 = Math.round((xs - fa) / c);
  const place = (bmp: Bitmap) => c0 + Math.round((bandCols - bw(bmp)) / 2);
  stamp(g, dg, place(dg) + (ar ? -1 : 1), R.digits + 1, { "#": "D" }); // the knitted drop shadow, as at CHAMPION
  stamp(gO, dg, place(dg), R.digits, { "#": "O" });
  stamp(g, nm.bmp, place(nm.bmp), R.name, { "#": "N", "*": "Y" });
  stamp(g, tw, place(tw), R.strip + 1, { "#": "T" });
  const PK = { G: P.G, L: P.L, C: P.C, B: P.B, N: P.N, Y: P.Y, S: P.S, D: P.D, F: P.F, T: P.T };

  // the ends: patches, the season, the cream cast-on and cast-off, the fringe
  const sink = textSink(image);
  const pw = PK_W;
  const patchIds = { soft: ids.soft, weave: ids.weave, weft: ids.weft, satin: ids.satin };
  const pctx = { ar, strings: s, stats: p.stats, P, ids: patchIds, emit: sink.emit, image };
  const endTop = mid + 20;
  const patchY = mid + 46;
  const yEnd = H - FRINGE_LEN - 4;
  const castTop = yEnd - LCAST.rows * LCAST.c;
  const optA: Omit<PatchDraw, "x" | "y"> = {
    w: pw,
    k: 1.3,
    head: "logo",
    keys: ["cap", "sel"],
    cols: 1,
    foot: p.sample ? [{ text: s.sample }] : [],
    footFs: 4.4,
  };
  const optB: Omit<PatchDraw, "x" | "y"> = {
    w: pw,
    k: 1.3,
    head: "season",
    headText: p.season,
    keys: ["trf", "con"],
    cols: 1,
    foot: [{ text: v.serialText, serial: true }],
    footFs: 4.4,
  };

  let defs =
    stitchPattern(ids.base, c, { gap: 0.48, leg: 0.34, transform: "rotate(-90)" }) +
    stitchPattern(ids.flap, c, { gap: 0.46, leg: 0.32 }) +
    stitchPattern(ids.cast, LCAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
    `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
    `<linearGradient id="${ids.sleeve}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(SLEEVE, "#000000", 0.35)}"/><stop offset=".45" stop-color="${SLEEVE_LT}"/><stop offset="1" stop-color="${mix(SLEEVE, "#000000", 0.45)}"/></linearGradient>` +
    `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.5"/></filter>` +
    `<pattern id="${ids.weave}" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 .5H1M1 1.5H2" stroke="#000" stroke-opacity=".13" stroke-width=".6"/><path d="M1.5 0V1M.5 1V2" stroke="#fff" stroke-opacity=".2" stroke-width=".6"/></pattern>` +
    `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".42" fill="${P.patch}" opacity=".46"/></pattern>` +
    hatch(ids.satin, P.Gdk, mix(P.Gdk, "#000000", 0.35), 0.55, 0.3, 58) +
    `<clipPath id="${ids.arms}"><rect width="${f2(W)}" height="${H}"/></clipPath>` +
    `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial || "0") % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

  // the band, taut between the fists and gathered into each of them
  const gat = 24;
  const outline =
    `M${fa} ${mid - gat}C${fa + 10} ${mid - gat} ${fa + 12} ${top} ${xs} ${top}` +
    `H${xe}C${fb - 12} ${top} ${fb - 10} ${mid - gat} ${fb} ${mid - gat}` +
    `V${mid + gat}C${fb - 10} ${mid + gat} ${fb - 12} ${bot} ${xe} ${bot}` +
    `H${xs}C${fa + 12} ${bot} ${fa + 10} ${mid + gat} ${fa} ${mid + gat}Z`;
  defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;
  const len = fb - fa;
  let fab =
    `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="${P.G}"/>` +
    gridRuns(g, PK, fa, BY, c, c, "G");
  // the number (or its dash), in its own yarn, with a hit area so it is what a pointer finds
  fab +=
    `<g data-mc="ovr"${p.ovr != null ? ` data-ovr="${p.ovr}"` : ""}>` +
    `<rect class="mc-ovr-hit" x="${f2(fa + place(dg) * c)}" y="${f2(BY + R.digits * c)}" width="${f2(bw(dg) * c)}" height="${14 * c}" fill="transparent"/>` +
    `<g fill="${P.F}">${keyRects(gO, "O", fa, BY, c, c)}</g></g>`;
  fab += `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.base})" pointer-events="none"/>`;
  fab +=
    `<g pointer-events="none"><rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.curl})"/>` +
    `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" filter="url(#${ids.grain})" opacity=".5"/>` +
    `</g>`;
  let folds = "";
  for (const [f, dir] of [
    [fa, 1],
    [fb, -1],
  ] as const)
    for (const dy of [-1, -0.45, 0.1, 0.65]) {
      const y1 = mid + dy * gat * 0.8;
      const y2 = mid + dy * BH * 0.46;
      folds += `<path d="M${f2(f + dir * 6)} ${f2(y1)}C${f2(f + dir * 14)} ${f2(y1)} ${f2(f + dir * 18)} ${f2(y2)} ${f2(f + dir * (GATHER + 14))} ${f2(y2)}" stroke="#000" stroke-opacity=".28" stroke-width="1.6" fill="none"/>`;
    }

  // the figure (geometry above)
  const avX = W / 2 - 100 * avS;
  const avY = shY - 184 * avS;
  const figure =
    avatarSvg({
      x: avX,
      y: avY,
      w: 200 * avS,
      h: 240 * avS,
      torso: SLEEVE,
      seam: "#7d8796",
      cls: "mc-av",
    }) +
    (rim
      ? `<svg x="${f2(avX)}" y="${f2(avY)}" width="${f2(200 * avS)}" height="${f2(240 * avS)}" viewBox="${AVATAR.viewBox}" aria-hidden="true" focusable="false"><g fill="none" stroke="${rim}" stroke-width="${f2(1.4 / avS)}"><path d="${AVATAR.hood}"/></g></svg>`
      : "");
  defs +=
    `<linearGradient id="${ids.fade}" gradientUnits="userSpaceOnUse" x1="0" y1="${f2(shY + 14 * avS)}" x2="0" y2="${f2(railY + 4)}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="${ids.mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${f2(W)}" height="${H}"><rect width="${f2(W)}" height="${H}" fill="url(#${ids.fade})"/></mask>` +
    steelGrad(ids.rail);
  // the crowd barrier the scarf came off: a top rail at chest height, a lower rail, a few uprights
  const barrier = (() => {
    let b = "";
    const yl = H - 34;
    const inner0 = PAD + END_W;
    const inner1 = W - PAD - END_W;
    for (let i = 0; i < 4; i++) {
      const x = inner0 + ((inner1 - inner0) * (i + 0.5)) / 4;
      b += `<rect x="${f2(x - 3)}" y="${f2(railY)}" width="6" height="${f2(yl - railY)}" fill="#3a424d"/><rect x="${f2(x - 3)}" y="${f2(railY)}" width="1.6" height="${f2(yl - railY)}" fill="#fff" opacity=".12"/>`;
    }
    b += `<rect x="0" y="${f2(yl)}" width="${f2(W)}" height="9" rx="4.5" fill="url(#${ids.rail})" opacity=".85"/>`;
    b += `<rect x="0" y="${f2(railY - 7)}" width="${f2(W)}" height="14" rx="7" fill="url(#${ids.rail})"/><rect x=".5" y="${f2(railY - 6.5)}" width="${f2(W - 1)}" height="13" rx="6.5" fill="none" stroke="#4E5661"/>`;
    b += `<path d="M7 ${f2(railY - 3.6)}H${f2(W - 7)}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
    return b;
  })();
  // the arms: bench-jacket sleeves from the shoulders up to the fists
  const shoulder = (side: number) => ({ x: W / 2 + side * 64 * avS, y: shY });
  const arm = (fx: number, side: number) => {
    const sh = shoulder(side);
    const rw = 22 * avS; // half-width at the shoulder
    const fw = 19; // half-width at the wrist
    const d = `M${f2(sh.x - rw)} ${f2(sh.y)}L${f2(fx - fw)} ${f2(mid + 10)}L${f2(fx + fw)} ${f2(mid + 10)}L${f2(sh.x + rw)} ${f2(sh.y)}Z`;
    let a = `<path d="${d}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})" transform="translate(2 3)"/>`;
    a += `<path d="${d}" fill="url(#${ids.sleeve})"/>`;
    a += `<path d="M${f2(sh.x + side * rw * 0.4)} ${f2(sh.y)}L${f2(fx + side * fw * 0.4)} ${f2(mid + 14)}" stroke="${mix(SLEEVE, "#000000", 0.4)}" stroke-width="1.6"/>`;
    a += `<path d="M${f2(sh.x - side * rw * 0.5)} ${f2(sh.y)}L${f2(fx - side * fw * 0.5)} ${f2(mid + 14)}" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
    // a ribbed cuff in the club colour at the wrist
    a += `<path d="M${f2(fx - fw)} ${f2(mid + 22)}L${f2(fx + fw)} ${f2(mid + 22)}L${f2(fx + fw - 0.6)} ${f2(mid + 34)}L${f2(fx - fw + 0.6)} ${f2(mid + 34)}Z" fill="${P.G}"/>`;
    let ribs = "";
    for (let x = fx - fw + 2.5; x < fx + fw - 1; x += 3.2)
      ribs += `M${f2(x)} ${f2(mid + 23)}V${f2(mid + 33)}`;
    a += `<path d="${ribs}" stroke="#000" stroke-opacity=".28" stroke-width="1"/>`;
    if (rim) a += `<path d="${d}" fill="none" stroke="${rim}" stroke-width="1.2"/>`;
    return a;
  };

  // the ends hang outside the fists, in front of the arms, down to the card's foot
  const rnd = seeded(hashStr((p.serial || "0") + "fringe-legend"));
  const startSide = ar ? 1 : -1;
  const drape = (side: number, kind: "label" | "cast", clipId: string) => {
    const f = side < 0 ? fa : fb;
    const xL = side < 0 ? f - 4 - END_W : f + 4;
    const xT = xL - side * 6; // the top tucks back under the fist
    const d = `M${f2(xT + 8)} ${endTop}H${f2(xT + END_W - 8)}C${f2(xT + END_W)} ${endTop + 10} ${f2(xL + END_W)} ${endTop + 26} ${f2(xL + END_W)} ${endTop + 46}V${f2(yEnd)}H${f2(xL)}V${endTop + 46}C${f2(xL)} ${endTop + 26} ${f2(xT)} ${endTop + 10} ${f2(xT + 8)} ${endTop}Z`;
    let sv = `<clipPath id="${clipId}"><path d="${d}"/></clipPath>`;
    sv += `<path d="${d}" fill="#020a1c" opacity=".4" filter="url(#${ids.soft})" transform="translate(${2 * side} 3)"/>`;
    sv += `<g clip-path="url(#${clipId})"><rect x="${f2(xL - 12)}" y="${endTop}" width="${END_W + 24}" height="${f2(yEnd - endTop)}" fill="${P.G}"/>`;
    // the season down each end: seven stripes between the patch and the cast-on
    const sTop = patchY + ph + 12;
    const pitch = Math.min(12, (castTop - 10 - sTop) / 7);
    if (pitch >= 6)
      for (let i = 0; i < 7; i++)
        sv += `<rect x="${f2(xL - 12)}" y="${f2(sTop + i * pitch)}" width="${END_W + 24}" height="${f2(pitch / 2)}" fill="${P.S}"/>`;
    sv += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${END_W + 24}" height="${f2(yEnd - endTop)}" fill="url(#${ids.flap})" pointer-events="none"/>`;
    // the selvedges run down the long edges: cream on the outer edge, Logo Blue on the inner
    const outerX = side < 0 ? xL - 4 : xL + END_W - c;
    const innerX = side < 0 ? xL + END_W - c : xL - 4;
    sv += `<rect x="${f2(outerX)}" y="${endTop}" width="${c + 4}" height="${f2(yEnd - endTop)}" fill="${P.C}"/>`;
    sv += `<rect x="${f2(innerX)}" y="${endTop}" width="${c + 4}" height="${f2(yEnd - endTop)}" fill="${BLUE}"/>`;
    // two stripes under the fist
    for (const yy of [endTop + 10, endTop + 20])
      sv += `<rect x="${f2(xL - 12)}" y="${yy}" width="${END_W + 24}" height="${c - 3}" fill="${P.S}"/>`;
    // a cream end on both: the founder's cast-on with 2026, and the cast-off on the other end
    const founder = !!p.founder;
    sv += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${END_W + 8}" height="${LCAST.rows * LCAST.c}" fill="${founder ? P.cast : P.G}"/>`;
    if (founder && kind === "cast") {
      const yr = word(String(p.founder), F35, 1);
      const yx = xL + Math.round((END_W - bw(yr) * LCAST.c) / 2);
      sv += `<g fill="${P.castInk}">${bmpRects(yr, yx, castTop, LCAST.c, LCAST.c)}</g>`;
    }
    sv += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${END_W + 8}" height="${LCAST.rows * LCAST.c}" fill="url(#${ids.cast})" pointer-events="none"/>`;
    sv += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${END_W + 24}" height="${f2(yEnd - endTop)}" fill="url(#${ids.curl})" opacity=".5" pointer-events="none"/></g>`;
    sv += `<path d="${d}" fill="none" stroke="${P.Gdk}" stroke-width="1"/>`;
    if (rim) sv += `<path d="${d}" fill="none" stroke="${rim}" stroke-width="1"/>`;
    sv += drawPatch(pctx, {
      ...(kind === "cast" ? optB : optA),
      x: xL + (END_W - pw) / 2,
      y: patchY,
    }).svg;
    let fr = "";
    for (let i = 0; i < TASSELS.legend; i++) {
      const x = xL + (END_W * (i + 0.5)) / TASSELS.legend;
      fr += `<g class="mc-tassel">${tassel(x, yEnd - 3, FRINGE_LEN - 4 - rnd() * 6, 17, P, {
        rnd,
        knotted: true,
        hang: side * 2.5,
      })}</g>`;
    }
    return `<g class="mc-fringe">${fr}</g><g class="mc-end">${sv}</g>`;
  };
  // the fists: the scarf's end wound round each hand, the knuckles a ridge through the knit
  const fist = (cx: number, dir: number) => {
    const fw = 52;
    const fh = 60;
    const x = cx - fw / 2;
    const y = mid - fh / 2 - 2;
    const kn = [0, 1, 2, 3].map((i) => x + 9 + i * 11.3);
    const shape =
      `M${x} ${y + 16}` +
      kn.map((kx) => `Q${f2(kx)} ${f2(y - 3)} ${f2(kx + 5.6)} ${f2(y + 4)}`).join("") +
      `Q${x + fw} ${y + 4} ${x + fw} ${y + 18}V${y + fh - 16}Q${x + fw} ${y + fh} ${x + fw - 16} ${y + fh}H${x + 16}Q${x} ${y + fh} ${x} ${y + fh - 16}Z`;
    let sv = `<g filter="url(#${ids.soft})" opacity=".45" transform="translate(${dir * 2} 3)"><path d="${shape}" fill="#020a1c"/></g>`;
    sv += `<path d="${shape}" fill="${P.G}"/>`;
    sv += `<path d="${shape}" fill="url(#${ids.flap})" pointer-events="none"/>`;
    // the knuckles catch the light
    sv += kn
      .map(
        (kx) =>
          `<path d="M${f2(kx - 2.5)} ${f2(y + 5)}Q${f2(kx + 2)} ${f2(y - 0.5)} ${f2(kx + 6)} ${f2(y + 4)}" stroke="#fff" stroke-opacity=".32" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
      )
      .join("");
    // three turns of the scarf, each edged by a selvedge
    [y + 22, y + 35, y + 48].forEach((yy, i) => {
      const sl = dir * (i - 1) * 2.5;
      sv += `<path d="M${x} ${f2(yy + sl)}Q${cx} ${f2(yy - 6)} ${x + fw} ${f2(yy - sl)}" stroke="#000" stroke-opacity=".4" stroke-width="2.2" fill="none"/>`;
      sv += `<path d="M${x + 1} ${f2(yy + sl + 2.6)}Q${cx} ${f2(yy - 3.2)} ${x + fw - 1} ${f2(yy - sl + 2.6)}" stroke="${i === 1 ? BLUE : P.C}" stroke-width="2.4" fill="none"/>`;
    });
    sv += `<path d="${shape}" fill="none" stroke="${P.Gxd}" stroke-width="1.2"/>`;
    if (rim) sv += `<path d="${shape}" fill="none" stroke="${rim}" stroke-width="1"/>`;
    return `<g class="mc-fist">${sv}</g>`;
  };
  const rimBand = rim
    ? `<path class="mc-rim" d="${outline}" fill="none" stroke="${rim}" stroke-width="1.2"/>`
    : "";
  const ends = drape(startSide, "label", ids.dA) + drape(-startSide, "cast", ids.dB);
  const body =
    `<defs>${defs}</defs>` +
    `<g clip-path="url(#${ids.arms})"><g class="mc-lg-arms" mask="url(#${ids.mask})">${arm(fa, -1)}${arm(fb, 1)}${figure}</g>${barrier}</g>` +
    `<g class="mc-lg-band"><g class="mc-fabric" clip-path="url(#${ids.clip})">${fab}${folds}</g>${rimBand}</g>` +
    `<g class="mc-lg-ends">${ends}</g>` +
    `<g class="mc-lg-fists">${fist(fa, -1)}${fist(fb, 1)}</g>`;
  return { body, w: W, h: H, texts: sink.texts };
}
