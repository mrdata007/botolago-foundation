/**
 * The share art's still of the Holo edition: one frame of what the live card shows at rest, after
 * `.mc-fx--prism` and `.mc-fx--spark` in `shield.css` (the layers `editions.ts` puts under the text).
 * Inline attributes only, no `<text>`, no `<image>`, no external reference, no stylesheet; every id
 * starts with the one the caller hands in.
 *
 * - The prism: a conic sweep of green, cyan and blue (CSS `conic-gradient(from 40deg at 50% 45%)`,
 *   which an SVG does not have, so it is cut into thin solid wedges), seen through diagonal bands
 *   (118 degrees, 2.2 units solid then 3.4 at a fifth, repeating every 5.6) with the rating column
 *   cleared by a soft hole, over the band's 64.6 % of the card, at 24 % opacity. In Arabic the card
 *   mirrors the bands (242 degrees) and the hole (82 % across).
 * - The glints: five soft white points.
 *
 * Card units: the card is 100 wide and 136.6 tall, as in `image.ts`.
 */

const W = 100;
const H = 136.6;
/** The prism's box: the top 64.6 % of the card, where the band under the art begins. */
const PRISM_H = 88.2;
/** The conic sweep's centre, in the prism's box (50 % across, 45 % down). */
const CONIC = { x: 50, y: PRISM_H * 0.45 } as const;
const CONIC_FROM = 40;
const CONIC_STOPS = ["#5ef0a8", "#4fd8ff", "#4f9bff", "#4fd8ff", "#5ef0a8"] as const;
const WEDGES = 48;
const BAND = { solid: 2.2, period: 5.6, rest: 0.2 } as const;
const PRISM_OPACITY = 0.24;

const n = (x: number): string => String(Math.round(x * 100) / 100);

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The sweep's colour a fraction (0 to 1) of the way round. */
function sweep(f: number): string {
  const seg = f * (CONIC_STOPS.length - 1);
  const i = Math.min(CONIC_STOPS.length - 2, Math.floor(seg));
  const t = seg - i;
  const a = rgb(CONIC_STOPS[i]!);
  const b = rgb(CONIC_STOPS[i + 1]!);
  const hex = [0, 1, 2].map((k) =>
    Math.round(a[k]! + (b[k]! - a[k]!) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${hex.join("")}`;
}

/** The point `r` away from the sweep's centre at `deg` clockwise from straight up. */
function onSweep(deg: number, r: number): string {
  const a = (deg * Math.PI) / 180;
  return `${n(CONIC.x + r * Math.sin(a))},${n(CONIC.y - r * Math.cos(a))}`;
}

function wedges(): string {
  const step = 360 / WEDGES;
  let out = "";
  for (let i = 0; i < WEDGES; i++) {
    const from = CONIC_FROM + i * step;
    // a hair of overlap, so no seam shows between two wedges
    const to = from + step + 0.4;
    out += `<polygon points="${n(CONIC.x)},${n(CONIC.y)} ${onSweep(from, 160)} ${onSweep((from + to) / 2, 160)} ${onSweep(to, 160)}" fill="${sweep((i + 0.5) / WEDGES)}"/>`;
  }
  return out;
}

/** The solid bands as parallelograms across the box, `deg` being the CSS gradient angle. */
function bands(deg: number, startX: number): string {
  const a = (deg * Math.PI) / 180;
  // the gradient's direction, and the line across it, in card units (y down)
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const px = -dy;
  const py = dx;
  const reach = 160;
  const length = Math.abs(W * dx) + Math.abs(PRISM_H * dy);
  let out = "";
  for (let t = 0; t < length; t += BAND.period) {
    const pt = (u: number, side: number): string =>
      `${n(startX + dx * u + px * reach * side)},${n(dy * u + py * reach * side)}`;
    const end = Math.min(t + BAND.solid, length);
    out += `<polygon points="${pt(t, -1)} ${pt(t, 1)} ${pt(end, 1)} ${pt(end, -1)}" fill="#ffffff"/>`;
  }
  return out;
}

const SPARKS = [
  { x: 18, y: 44, r: 0.4, edge: 1.1, colour: "#ffffff" },
  { x: 74, y: 38, r: 0.3, edge: 1, colour: "#ffffff" },
  { x: 58, y: 52, r: 0.45, edge: 1.2, colour: "#e2fff0" },
  { x: 30, y: 62, r: 0.3, edge: 1, colour: "#dff6ff" },
  { x: 86, y: 58, r: 0.4, edge: 1.1, colour: "#ffffff" },
] as const;

/**
 * The still of the Holo edition. `under` goes inside the face's clip over the band; `over` is empty.
 * `rtl` mirrors the prism's bands and its clear patch the way the Arabic card does.
 */
export function holoStill(id: string, rtl = false): { under: string; over: string } {
  const mask = `${id}-holo-mask`;
  const hole = `${id}-holo-hole`;
  const deg = rtl ? 242 : 118;
  const holeCx = rtl ? 82 : 18;
  const holeCy = 0.21 * PRISM_H;
  const holeRx = 0.38 * W;
  const holeRy = 0.25 * PRISM_H;

  const defs =
    `<radialGradient id="${hole}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${n(holeCx)} ${n(holeCy)}) scale(${n(holeRx)} ${n(holeRy)})">` +
    `<stop offset="0" stop-color="#000000"/><stop offset=".6" stop-color="#000000"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>` +
    `<mask id="${mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${PRISM_H}">` +
    `<rect x="0" y="0" width="${W}" height="${PRISM_H}" fill="#ffffff" fill-opacity="${BAND.rest}"/>` +
    bands(deg, rtl ? W : 0) +
    `<rect x="0" y="0" width="${W}" height="${PRISM_H}" fill="url(#${hole})"/>` +
    `</mask>` +
    SPARKS.map(
      (s, i) =>
        `<radialGradient id="${id}-holo-spark-${i}" gradientUnits="userSpaceOnUse" cx="${s.x}" cy="${n((s.y / 100) * H)}" r="${s.edge}">` +
        `<stop offset="0" stop-color="${s.colour}"/><stop offset="${n(s.r / s.edge)}" stop-color="${s.colour}"/><stop offset="1" stop-color="${s.colour}" stop-opacity="0"/></radialGradient>`,
    ).join("");

  const prism = `<g mask="url(#${mask})" opacity="${PRISM_OPACITY}">${wedges()}</g>`;
  const sparks = SPARKS.map(
    (s, i) =>
      `<circle cx="${s.x}" cy="${n((s.y / 100) * H)}" r="${s.edge}" fill="url(#${id}-holo-spark-${i})"/>`,
  ).join("");

  return { under: `<defs>${defs}</defs>${prism}${sparks}`, over: "" };
}
