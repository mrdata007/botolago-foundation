/**
 * Lifting the parts that follow the light out of the layers they are drawn in, so a tilt moves
 * layers instead of repainting them (the tilt's frame rate, `tilt.ts`).
 *
 * A layer is one SVG, which the browser rasterises once and keeps. A part inside it that moves with
 * the pointer (the jersey's cast shadow, the specular streak on the metal, the foil in the cells and
 * on LEGEND's plaque) invalidates the whole layer each frame, and the frame layer alone takes 19 ms
 * to rasterise. Compositing the part on its own does not work in place: a composited element under
 * a mask or a clip-path costs the compositor a mask layer rasterised every frame (measured: 30 to
 * 45 raster tasks a frame, against 1 here). A part that is its own SVG root, a sibling of the layer
 * in a flat group, does work.
 *
 * So, once, when a card is mounted to tilt, this file rebuilds the DOM of that card:
 *
 * - `splitFilterGroups`: a blur over several creases that lie apart is one effect over sparse
 *   content, and the browser composites each crease as a layer of its own with its own blur
 *   (seven layers for the shirt; the compositor applies each blur on every frame). Each run of
 *   creases that lie together gets a blur of its own, which the browser rasterises into the layer.
 * - `hoistCast`: the jersey's cast shadow is the last thing the base draws, so it moves out into a
 *   layer of its own beside the rims, over the base and under the shirt, where it is only ever
 *   translated.
 * - `liftUnit`: the specular streak (frame), LEGEND's plaque foil (frame) and the honeycomb's foil
 *   (CHAMPION and LEGEND's base) are split out of their layer where they stand: the content before
 *   them stays in the layer, the part is its own SVG root with copies of the groups it was inside
 *   (the same masks and clips, rasterised inside its own root), and what drew after it follows in a
 *   third root. The layer becomes a flat group (`.mc-leaf`) holding the three, so the order of
 *   everything is what it was.
 *
 * Nothing is added to the card's drawing and nothing is removed: the pieces together are the layer.
 * At rest they are one browser layer again (no piece has a reason to be composited until the
 * tilt asks for `will-change`), so the card at rest is the card it was. The markup the renderer
 * builds is not changed (the share art, the founder's detail and every other reader see the
 * original), only the DOM of a card that is going to tilt, and never one that plays a beat.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The jersey's cast shadow lies inside this box of the card (1000 × 1618), blur included. */
export const CAST_BOX = { x: 60, y: 200, w: 880, h: 840 } as const;

/**
 * Everything the number layer draws lies inside this box of the card (1000 × 1618): the print and
 * its shade and highlight (jersey space 336..664 × 476..796, moved onto the card by `JT`), « OVR » and
 * its halo under it, with room for the shadow's blur. Symmetric about the card's axis. The layer is
 * cropped to it, so the browser rasterises and the compositor draws 16 % of a card, not all of it.
 */
export const NUM_BOX = { x: 280, y: 400, w: 440, h: 500 } as const;

/** How much bigger than its parts a group's box may be before it is "sparse" (the browser splits it). */
const SPARSE = 1.6;
/** Room for thin shapes whose boxes are nearly empty, in SVG units squared. */
const ROOM = 400;

const shellOf = (el: Element): Element => {
  const copy = el.cloneNode(false) as Element;
  copy.removeAttribute("id");
  return copy;
};

const layerOf = (svg: Element): string =>
  /\bmc-l--(\w+)/.exec(svg.getAttribute("class") ?? "")?.[1] ?? "";

/** Whether a drawing has anything to show, not only the groups it was nested in. */
const hasContent = (el: Element): boolean => el.querySelector(":not(g)") !== null;

/** A flat group around a layer's SVG, the 3D leaf the tilt lifts, holding the layer's pieces in order. */
function ensureLeaf(svg: Element): Element {
  const parent = svg.parentElement;
  if (parent?.classList.contains("mc-leaf")) return parent;
  const leaf = svg.ownerDocument.createElement("div");
  leaf.setAttribute("class", `mc-leaf mc-leaf--${layerOf(svg)}`);
  svg.before(leaf);
  leaf.appendChild(svg);
  return leaf;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Runs of neighbouring boxes that make a compact group: a box joins the run before it while the box
 * round them both is not much bigger than the boxes together (`SPARSE` times, with a little room for
 * thin shapes). A crease and its highlight, three overlapping ellipses: one run. Two creases at
 * opposite sides of the shirt: two. That is the browser's own test for whether sparse content is
 * worth a layer of its own, so a run that passes it is one layer and its blur is rasterised into it.
 */
export function runs(boxes: readonly Box[]): number[][] {
  const out: number[][] = [];
  let members: number[] = [];
  let box: Box | null = null;
  let sum = 0;
  boxes.forEach((b, i) => {
    if (box) {
      const x0 = Math.min(box.x, b.x);
      const y0 = Math.min(box.y, b.y);
      const x1 = Math.max(box.x + box.width, b.x + b.width);
      const y1 = Math.max(box.y + box.height, b.y + b.height);
      const union = (x1 - x0) * (y1 - y0);
      if (union <= SPARSE * (sum + b.width * b.height) + ROOM) {
        members.push(i);
        sum += b.width * b.height;
        box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        return;
      }
      out.push(members);
    }
    members = [i];
    sum = b.width * b.height;
    box = b;
  });
  if (members.length) out.push(members);
  return out;
}

/**
 * A group with a filter over children that lie apart becomes one group (and one filter) per run of
 * children that lie together. Blur is linear, so children that never reach each other blur the same
 * apart as together (and the few that overlap by a stroke's width differ by less than a grey level);
 * the browser can then rasterise each filter into the layer instead of compositing one effect over
 * sparse content.
 */
export function splitFilterGroups(svg: Element): number {
  let split = 0;
  for (const group of [...svg.querySelectorAll<SVGGElement>("g[filter]")]) {
    const kids = [...group.children] as SVGGraphicsElement[];
    if (kids.length < 2) continue;
    let boxes: DOMRect[];
    try {
      boxes = kids.map((k) => k.getBBox());
    } catch {
      continue;
    }
    if (boxes.some((b) => !(b.width > 0 || b.height > 0))) continue;
    const parts = runs(boxes);
    if (parts.length < 2) continue;
    for (const part of parts) {
      const copy = shellOf(group);
      for (const i of part) copy.appendChild(kids[i]!);
      group.before(copy);
    }
    group.remove();
    split += 1;
  }
  return split;
}

/**
 * Takes the jersey's cast shadow out of the base layer into a layer of its own inside `into` (the
 * rims' group). The groups it stood in that only transform (the Arabic mirror) are copied round it;
 * the window's clip is not: it is inside the window already, and a clip over a composited layer is
 * the cost this file exists to avoid. Returns the new layer, or null where there is nothing to lift.
 */
export function hoistCast(root: Element, into: Element | null): Element | null {
  const cast = root.querySelector(".mc-l--base .mc-shirt-cast");
  const base = cast?.closest("svg");
  if (!cast || !base || !into) return null;
  const doc = base.ownerDocument;
  const layer = doc.createElementNS(SVG_NS, "svg");
  layer.setAttribute("class", "mc-s mc-cast mc-live");
  layer.setAttribute("viewBox", `${CAST_BOX.x} ${CAST_BOX.y} ${CAST_BOX.w} ${CAST_BOX.h}`);
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("focusable", "false");
  const pct = (v: number, of: number): string => `${Math.round((v / of) * 1e4) / 100}%`;
  layer.setAttribute(
    "style",
    `direction:ltr;left:${pct(CAST_BOX.x, 1000)};top:${pct(CAST_BOX.y, 1618)};width:${pct(CAST_BOX.w, 1000)};height:${pct(CAST_BOX.h, 1618)}`,
  );
  let host: Element = layer;
  const chain: Element[] = [];
  for (let n: Element | null = cast.parentElement; n && n !== base; n = n.parentElement)
    chain.unshift(n);
  for (const a of chain) {
    if (a.hasAttribute("clip-path") || a.hasAttribute("mask") || a.hasAttribute("filter")) continue;
    const s = shellOf(a);
    host.appendChild(s);
    host = s;
  }
  host.appendChild(cast);
  into.appendChild(layer);
  return layer;
}

/**
 * Splits `unit` out of the SVG it is drawn in, keeping the order of everything: the content before
 * it stays where it is, the unit becomes an SVG root of its own (inside copies of the groups it was
 * nested in, so its masks and clips are the same ones), and what came after it follows in a third
 * root. The layer's SVG goes inside a flat group holding the three. Returns the unit's root.
 */
export function liftUnit(unit: Element | null): Element | null {
  const svg = unit?.closest("svg");
  if (!unit || !svg) return null;
  if (svg === unit || !svg.parentNode) return null;
  ensureLeaf(svg);
  const chain: Element[] = [];
  for (let n: Element | null = unit.parentElement; n && n !== svg; n = n.parentElement)
    chain.push(n);
  // after: bottom-up, each level's following siblings go into a copy of that level's group
  const rest = shellOf(svg);
  let node: Element = unit;
  let carry: Element | null = null;
  for (const level of [...chain, svg]) {
    const tail: ChildNode[] = [];
    for (let s = node.nextSibling; s; s = s.nextSibling) tail.push(s);
    const target = level === svg ? rest : shellOf(level);
    if (carry) target.appendChild(carry);
    for (const t of tail) target.appendChild(t);
    carry = target;
    node = level;
  }
  // the unit: inside copies of the same groups, top-down
  const live = shellOf(svg);
  let host: Element = live;
  for (let i = chain.length - 1; i >= 0; i--) {
    const s = shellOf(chain[i]!);
    host.appendChild(s);
    host = s;
  }
  host.appendChild(unit);
  live.setAttribute("class", "mc-s mc-live");
  rest.setAttribute("class", "mc-s");
  svg.after(live);
  if (hasContent(rest)) live.after(rest);
  return live;
}

/** The group a moving rectangle is drawn through (its mask or clip), the unit to lift. */
const unitOf = (part: Element | null, attr: string): Element | null => {
  const parent = part?.parentElement;
  return parent && parent.tagName.toLowerCase() === "g" && parent.hasAttribute(attr)
    ? parent
    : null;
};

/** The card's own centre, which a layer turns about, in the 1000 × 1618 box. */
const CENTRE = { x: 500, y: 809 } as const;

/**
 * Crops the number layer to the box that holds what it draws (`on`), or gives it back whole. The
 * crop is for while the card moves: the browser rasterises, repaints (the number's shade and
 * highlight move) and the compositor draws a sixth of a card instead of all of it. The layer keeps
 * its place in the stack, its depth and its centre of scaling (the card's, not its own), so it lines
 * up as before. The box is put on whole CSS pixels of a card `width` px across, and the view box is
 * moved to match, so every unit lands on the pixel it landed on in the whole layer: the glyphs are
 * rasterised on the same grid and look the same. At rest it is the layer the renderer drew.
 */
export function cropNum(root: Element, on: boolean, width = 0): boolean {
  const svg = root.querySelector<SVGElement>("svg.mc-l--num");
  if (!svg) return false;
  if (!on) {
    if (!svg.classList.contains("mc-crop")) return true;
    svg.classList.remove("mc-crop");
    svg.setAttribute("viewBox", svg.dataset.mcViewBox ?? "0 0 1000 1618");
    const style = svg.dataset.mcStyle;
    if (style) svg.setAttribute("style", style);
    else svg.removeAttribute("style");
    return true;
  }
  if (svg.classList.contains("mc-crop") || !(width > 0)) return svg.classList.contains("mc-crop");
  const k = width / 1000;
  // the box on whole pixels, grown to the pixel (never shrunk): its edges, in card units and in px
  const left = Math.floor(NUM_BOX.x * k);
  const top = Math.floor(NUM_BOX.y * k);
  const right = Math.ceil((NUM_BOX.x + NUM_BOX.w) * k);
  const bottom = Math.ceil((NUM_BOX.y + NUM_BOX.h) * k);
  const [x, y, w, h] = [left / k, top / k, (right - left) / k, (bottom - top) / k];
  const n = (v: number): string => String(Math.round(v * 1e4) / 1e4);
  svg.dataset.mcViewBox = svg.getAttribute("viewBox") ?? "0 0 1000 1618";
  svg.dataset.mcStyle = svg.getAttribute("style") ?? "";
  svg.setAttribute("viewBox", `${n(x)} ${n(y)} ${n(w)} ${n(h)}`);
  svg.classList.add("mc-crop");
  // keep what the tilt has written (its transform) and add the box
  svg.style.left = `${left}px`;
  svg.style.top = `${top}px`;
  svg.style.width = `${right - left}px`;
  svg.style.height = `${bottom - top}px`;
  svg.style.transformOrigin = `${n(CENTRE.x * k - left)}px ${n(CENTRE.y * k - top)}px`;
  return true;
}

/** What `liftCard` did, for the tests and the notes. */
export interface Lifted {
  filters: number;
  cast: boolean;
  spec: boolean;
  plaque: boolean;
  cells: boolean;
}

/**
 * Rebuilds a card's DOM for the tilt (see the top of this file). Idempotent, and a card that plays
 * a beat is left alone (the beat animates groups this would copy; the card is drawn again without
 * the beat when it ends, and that drawing is lifted).
 */
export function liftCard(root: Element): Lifted | null {
  if (
    typeof root.querySelector !== "function" ||
    typeof root.hasAttribute !== "function" ||
    typeof root.ownerDocument?.createElementNS !== "function"
  )
    return null;
  if (root.hasAttribute("data-mc-lift") || root.hasAttribute("data-mc-beat")) return null;
  const out: Lifted = { filters: 0, cast: false, spec: false, plaque: false, cells: false };
  root.setAttribute("data-mc-lift", "1");
  for (const svg of root.querySelectorAll(".mc-l:not(.mc-rim)"))
    out.filters += splitFilterGroups(svg);
  out.cast = hoistCast(root, root.querySelector(".mc-rims")) !== null;
  const frame = root.querySelector("svg.mc-l--frame");
  if (frame) {
    out.spec = liftUnit(unitOf(frame.querySelector(".mc-spec-shift"), "mask")) !== null;
    const plaque = [
      ...root.querySelectorAll(".mc-leaf--frame .mc-foil-shift, .mc-l--frame .mc-foil-shift"),
    ]
      .map((r) => unitOf(r, "clip-path"))
      .find(Boolean);
    out.plaque = liftUnit(plaque ?? null) !== null;
  }
  const base = root.querySelector("svg.mc-l--base");
  const cells = base?.querySelector(".mc-foil-shift")?.closest('g[mask*="cells"]');
  out.cells = liftUnit(cells ?? null) !== null;
  return out;
}
