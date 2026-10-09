/**
 * Textures and fringe: the stitch pattern laid over a gauge, the satin thread of a woven edge, the
 * brushed steel of the barrier rail, and the tassels. All plain SVG paths; every number is computed
 * here and every colour is a hex from the palette, so nothing a user typed reaches this module.
 */
import { f2 } from "./knit";
import type { Palette } from "./palette";

export interface StitchOptions {
  /** Pattern cell height (default: the width). */
  h?: number;
  gapC?: string;
  gap?: number;
  leg?: number;
  garter?: boolean;
  transform?: string;
}

/** Stockinette (Vs) or garter (ridges) over any yarn colour. */
export function stitchPattern(id: string, c: number, opt: StitchOptions = {}): string {
  const w = c;
  const h = opt.h || c;
  const gapC = opt.gapC || "#020a1c";
  const gapO = opt.gap != null ? opt.gap : 0.4;
  const legO = opt.leg != null ? opt.leg : 0.26;
  const tf = opt.transform ? ` patternTransform="${opt.transform}"` : "";
  const gid = id + "-lg";
  const grad =
    `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="${legO}"/><stop offset=".45" stop-color="#fff" stop-opacity="${f2(legO * 0.2)}"/>` +
    `<stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`;
  if (opt.garter) {
    // garter: continuous horizontal ridges, the bumps of each ridge half a stitch off the row below
    let rows = "";
    for (let r = 0; r < 2; r++) {
      const y0 = r * h;
      const off = r ? w / 2 : 0;
      rows +=
        `<rect y="${f2(y0 + h * 0.68)}" width="${f2(w)}" height="${f2(h * 0.32)}" fill="${gapC}" fill-opacity="${gapO}"/>` +
        [off - w / 2, off + w / 2]
          .map(
            (cx) =>
              `<ellipse cx="${f2(cx)}" cy="${f2(y0 + h * 0.38)}" rx="${f2(w * 0.5)}" ry="${f2(h * 0.28)}" fill="url(#${gid})"/>`,
          )
          .join("") +
        `<rect x="${f2(off - 0.3)}" y="${f2(y0 + h * 0.16)}" width=".6" height="${f2(h * 0.45)}" fill="${gapC}" fill-opacity="${f2(gapO * 0.45)}"/>`;
    }
    return (
      grad +
      `<pattern id="${id}" width="${f2(w)}" height="${f2(2 * h)}" patternUnits="userSpaceOnUse"${tf}>${rows}</pattern>`
    );
  }
  const rx = w * 0.25;
  const ry = h * 0.6;
  const legs: [number, number, number][] = [
    [w * 0.29, h * 0.5, -24],
    [w * 0.71, h * 0.5, 24],
  ];
  const ell = ([cx, cy, a]: [number, number, number]) => {
    const t = (a * Math.PI) / 180;
    const ax = ry * Math.sin(-t);
    const ay = ry * Math.cos(t);
    return `M${f2(cx - ax)} ${f2(cy - ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx + ax)} ${f2(cy + ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx - ax)} ${f2(cy - ay)}Z`;
  };
  return (
    grad +
    `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
    `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ell).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
    legs
      .map(
        ([cx, cy, a]) =>
          `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`,
      )
      .join("") +
    `</pattern>`
  );
}

/** Satin-stitch thread: a slanted hatch of threads and shadow gaps. */
export function hatch(
  id: string,
  thread: string,
  gap: string,
  tw = 0.8,
  gw = 0.45,
  ang = 62,
): string {
  const p = f2(tw + gw);
  return `<pattern id="${id}" width="${p}" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><rect width="${p}" height="6" fill="${gap}"/><rect width="${tw}" height="6" fill="${thread}"/></pattern>`;
}

/** Brushed steel for the barrier rail. */
export function steelGrad(id: string): string {
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#5E6876"/><stop offset=".18" stop-color="#E6EBF0"/><stop offset=".42" stop-color="#C6CDD6"/>` +
    `<stop offset=".7" stop-color="#A9B2BE"/><stop offset="1" stop-color="#4E5661"/></linearGradient>`
  );
}

export interface TasselOptions {
  rnd: () => number;
  /** Sideways drift of the strands' tips. */
  hang?: number;
  /** CHAMPION: a two-ply cord ending in a brushed tip. */
  twisted?: boolean;
  /** LEGEND: knotted at the head. */
  knotted?: boolean;
}

/** One tassel. Bundled strands under a wrap; CHAMPION twists two plies; LEGEND knots them. */
export function tassel(
  x: number,
  top: number,
  len: number,
  w: number,
  P: Palette,
  opt: TasselOptions,
): string {
  const rnd = opt.rnd;
  const hang = opt.hang || 0;
  let s = "";
  if (opt.twisted) {
    // a two-ply cord: the ground yarn twisted with the second yarn, ending in a brushed tip
    const cw = w * 0.46;
    const y0 = top + 3;
    const y1 = top + len - 11;
    const xb = x + hang;
    s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.Gxd}" stroke-width="${f2(cw + 1.6)}" stroke-linecap="round" opacity=".55"/>`;
    s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.G}" stroke-width="${f2(cw)}" stroke-linecap="round"/>`;
    let tw = "";
    for (let y = y0 + 2.5; y < y1 - 1; y += 4.6) {
      const xx = x + (hang * (y - y0)) / (y1 - y0);
      tw += `M${f2(xx - cw * 0.42)} ${f2(y + 1.6)}L${f2(xx + cw * 0.42)} ${f2(y - 1.6)}`;
    }
    s += `<path d="${tw}" stroke="${P.S}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M${f2(x - cw * 0.18)} ${f2(y0 + 2)}L${f2(xb - cw * 0.18)} ${f2(y1 - 1)}" stroke="#fff" stroke-opacity=".16" stroke-width="1" fill="none"/>`;
    for (let i = 0; i < 6; i++) {
      const t = (i - 2.5) / 2.5;
      s += `<path d="M${f2(xb + t * cw * 0.35)} ${f2(y1 - 1)}Q${f2(xb + t * cw * 0.6)} ${f2(y1 + 5)} ${f2(xb + t * cw * 0.85 + (rnd() - 0.5))} ${f2(y1 + 11 - rnd() * 2.5)}" stroke="${i % 2 ? P.S : P.G}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    }
    s += `<rect x="${f2(x - w * 0.3)}" y="${f2(top + 1)}" width="${f2(w * 0.6)}" height="3.4" rx="1.4" fill="${P.Gdk}"/>`;
    return s;
  }
  // matte yarn: seven strands gathered under the wrap and splaying to uneven tips. Each strand is
  // drawn as a ply (a dashed twist over the yarn), with no outline round the bundle and no light
  // streak, so the tassel reads as wool rather than a moulded cone.
  const n = 7;
  const knot = opt.knotted;
  const order = [0, 6, 1, 5, 2, 4, 3]; // outer strands first, the centre on top
  for (const i of order) {
    const t = (i - (n - 1) / 2) / ((n - 1) / 2);
    const x0 = x + t * w * 0.2;
    const x1 = x + t * w * 0.62 + hang + (rnd() * 2 - 1) * 1.1;
    const l = len - rnd() * 6;
    const kink = knot ? 9 : 4;
    const d = `M${f2(x0)} ${f2(top + kink)}C${f2(x0 + hang * 0.1)} ${f2(top + l * 0.4)} ${f2(x1 - hang * 0.25 - t * 0.8)} ${f2(top + l * 0.72)} ${f2(x1)} ${f2(top + l)}`;
    const yarnW = f2(Math.max(1.4, (w / n) * 0.95));
    s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 1 + 0.7)}" fill="none" stroke-linecap="round" opacity=".32"/>`;
    s += `<path d="${d}" stroke="${P.G}" stroke-width="${yarnW}" fill="none" stroke-linecap="round"/>`;
    if (i % 2)
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${yarnW}" fill="none" stroke-linecap="round" opacity=".22"/>`;
    s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 0.42)}" stroke-dasharray="1.3 1.7" fill="none" opacity=".45"/>`;
  }
  if (knot) {
    s += `<ellipse cx="${f2(x)}" cy="${f2(top + 6)}" rx="${f2(w * 0.36)}" ry="4.2" fill="${P.G}" stroke="${P.Gdk}" stroke-width="1"/>`;
    s += `<path d="M${f2(x - w * 0.28)} ${f2(top + 5)}C${f2(x - 2)} ${f2(top + 2.4)} ${f2(x + 2)} ${f2(top + 9)} ${f2(x + w * 0.3)} ${f2(top + 6)}" stroke="${P.Glt}" stroke-width="1" fill="none" opacity=".8"/>`;
  } else {
    // the wrap: a few turns of the second yarn round the gathered head
    s += `<rect x="${f2(x - w * 0.26)}" y="${f2(top + 0.6)}" width="${f2(w * 0.52)}" height="4" rx="1.4" fill="${P.Gdk}"/>`;
    s += `<path d="M${f2(x - w * 0.24)} ${f2(top + 1.8)}H${f2(x + w * 0.24)}M${f2(x - w * 0.24)} ${f2(top + 3.4)}H${f2(x + w * 0.24)}" stroke="${P.S}" stroke-width=".8" fill="none"/>`;
  }
  return s;
}

/**
 * The base scarf's fringe: no tassels (their count is the tier), only a close row of loose
 * strands, each a short ply of the ground yarn, hanging straight from the knitted end.
 */
export function looseFringe(
  x0: number,
  x1: number,
  y: number,
  len: number,
  P: Palette,
  rnd: () => number,
): string {
  const n = Math.max(8, Math.round((x1 - x0) / 7));
  const step = (x1 - x0) / n;
  const w = f2(step * 0.52);
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = x0 + step * (i + 0.5);
    const l = len - rnd() * 7;
    const sw = (rnd() * 2 - 1) * 1.8;
    const d = `M${f2(x)} ${f2(y + 1)}C${f2(x + sw * 0.25)} ${f2(y + l * 0.4)} ${f2(x + sw * 0.8)} ${f2(y + l * 0.72)} ${f2(x + sw)} ${f2(y + l)}`;
    s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(w + 0.7)}" fill="none" stroke-linecap="round" opacity=".32"/>`;
    s += `<path d="${d}" stroke="${P.G}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    if (i % 2)
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".22"/>`;
    s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(w * 0.4)}" stroke-dasharray="1.2 1.6" fill="none" opacity=".45"/>`;
  }
  return s;
}
