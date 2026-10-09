/**
 * The woven jacquard patch sewn on the scarf: club-secondary ground, a satin-stitch border, a 1u
 * thickness shadow, the colour wordmark at the top, the ratings in Manrope 700 (tabular) under 600
 * caps labels, and the serial woven along the bottom edge.
 *
 * Text is not written here. Each line is handed to `emit`, which returns the markup to place in the
 * SVG (a <text>, in the card) or nothing (in the share image, where the same lines go out as
 * canvas text runs so the fonts are the page's own).
 */
import { INK, mix, type Palette } from "./palette";
import { esc, f2 } from "./knit";
import { DASH } from "./motifs";
import { patchBox, type PatchBox, type PatchSpec } from "./geometry";
import { wordmarkSvg } from "./wordmark";
import type { CardStrings, StatCode } from "../types";

export type PatchTextKind = "note" | "k" | "v" | "nil" | "meta" | "foot";

/** One line of text on the patch, in the patch's own units. */
export interface PatchText {
  kind: PatchTextKind;
  text: string;
  x: number;
  y: number;
  size: number;
  anchor: "start" | "middle" | "end";
  dir: "ltr" | "rtl";
  /** Arabic words are set in the Arabic body face. */
  arabic: boolean;
  /** The serial line: kept findable by tests and by the share image. */
  serial?: boolean;
}

export interface PatchIds {
  soft: string;
  weave: string;
  weft: string;
  satin: string;
}

export interface PatchDraw {
  x: number;
  y: number;
  w: number;
  k?: number;
  keys: readonly StatCode[];
  cols: number;
  head: "logo" | "season";
  /** The season, for `head: "season"`. */
  headText?: string;
  /** The season (and the sample label), at the inline end of a logo header. */
  note?: string;
  foot: readonly { text: string; serial?: boolean }[];
  footFs?: number;
}

export interface PatchCtx {
  ar: boolean;
  strings: CardStrings;
  stats: Readonly<Record<StatCode, number | null>>;
  P: Palette;
  ids: PatchIds;
  emit: (t: PatchText) => string;
  /** The share image: no weave laid over the text, because the text is not in the SVG. */
  image: boolean;
}

/** The ink of the patch's text, as the lab's CSS had it: #23252a at a stated opacity. */
export const PATCH_INK = INK;
const OPACITY: Readonly<Record<PatchTextKind, number>> = {
  note: 0.66,
  k: 0.7,
  v: 1,
  nil: 0.8,
  meta: 1,
  foot: 1,
};
export const patchInk = (kind: PatchTextKind): string => {
  const a = OPACITY[kind];
  return a === 1 ? PATCH_INK : `rgba(35,37,42,${a})`;
};

/** The `<text>` markup for one line (the card's own SVG; fonts and tracking come from echarpe.css). */
export function textSvg(t: PatchText): string {
  // a dash keeps the figure's weight and tabular digits, a step lighter
  const kind = t.kind === "nil" ? "v mc-pt-nil" : t.kind;
  const cls = `mc-pt mc-pt-${kind}${t.arabic ? " mc-pt-ar" : ""}`;
  return `<text x="${f2(t.x)}" y="${f2(t.y)}" text-anchor="${t.anchor}" direction="${t.dir}" font-size="${f2(t.size)}" class="${cls}"${t.serial ? ' data-mc="serial"' : ""}>${esc(t.text)}</text>`;
}

export const patchSpecOf = (o: PatchDraw, ar: boolean): PatchSpec => ({
  k: o.k ?? 1,
  w: o.w,
  keys: o.keys.length,
  cols: o.cols,
  head: o.head,
  footLines: o.foot.length,
  footFs: o.footFs,
  ar,
});

/** Draws a patch at (x, y); returns its markup and its box. */
export function drawPatch(ctx: PatchCtx, o: PatchDraw): { svg: string; box: PatchBox } {
  const { ar, P, ids } = ctx;
  const k = o.k ?? 1;
  const box = patchBox(patchSpecOf(o, ar));
  const { x, y, w } = o;
  const { bdr, h } = box;
  const L = x + box.L;
  const R = x + box.R;
  const iw = box.iw;
  const ncol = o.cols;
  const headY = y + box.headY;
  const stat0 = y + box.stat0;
  let s = "";
  // thickness: a soft shadow, then a 1u hard edge below and to the inline end
  s += `<rect x="${f2(x + 0.6)}" y="${f2(y + 1.6)}" width="${f2(w)}" height="${h}" fill="#020a1c" opacity=".18" filter="url(#${ids.soft})"/>`;
  s += `<rect x="${f2(x + (ar ? -1 : 1) * k)}" y="${f2(y + 1 * k)}" width="${f2(w)}" height="${h}" fill="${mix(P.patch, "#000000", 0.45)}"/>`;
  s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="${P.patch}"/>`;
  s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="url(#${ids.weave})"/>`;
  // the satin-stitch border (a merrowed edge): threads over the edge, in the club's dark yarn
  s += `<path d="M${f2(x)} ${f2(y)}h${f2(w)}v${h}h${f2(-w)}Z M${f2(x + bdr)} ${f2(y + bdr)}v${f2(h - 2 * bdr)}h${f2(w - 2 * bdr)}v${f2(-(h - 2 * bdr))}Z" fill="url(#${ids.satin})" fill-rule="evenodd"/>`;
  // header: the logo (unmodified, colour) at the inline start
  if (o.head === "logo") {
    const lx = ar ? R - box.lw : L;
    s += wordmarkSvg(f2(lx), f2(headY), f2(box.lw), f2(box.lh));
  }
  // the note sits at the inline end of the header
  if (o.note) {
    const arabic = ar && /\p{Script=Arabic}/u.test(o.note);
    s += ctx.emit({
      kind: "note",
      text: o.note,
      x: ar ? L : R,
      y: headY + box.headH * 0.78,
      size: 5.4 * k,
      anchor: arabic || !ar ? "end" : "start",
      dir: arabic ? "rtl" : "ltr",
      arabic,
    });
  }
  if (o.head === "season" && o.headText)
    s += ctx.emit({
      kind: "meta",
      text: o.headText,
      x: ar ? R : L,
      y: headY + box.headH * 0.86,
      size: 6.2 * k,
      anchor: ar ? "end" : "start",
      dir: "ltr",
      arabic: false,
    });
  // the ratings: label (600 caps) over the figure (700, tabular), centred in each column
  o.keys.forEach((key, i) => {
    const col = i % ncol;
    const rowI = Math.floor(i / ncol);
    const vis = ar ? ncol - 1 - col : col;
    const cx = L + (iw / ncol) * (vis + 0.5);
    const top = stat0 + rowI * (box.cellH + 4 * k);
    const label = ctx.strings.stats[key];
    s += ctx.emit({
      kind: "k",
      text: label,
      x: cx,
      y: top + box.labFs * (ar ? 0.95 : 0.9),
      size: box.labFs,
      anchor: "middle",
      dir: ar ? "rtl" : "ltr",
      arabic: ar,
    });
    // a rating that does not exist yet is a dash, never 0
    const v = ctx.stats[key];
    const nil = v == null;
    s += ctx.emit({
      kind: nil ? "nil" : "v",
      text: nil ? DASH : String(v),
      x: cx,
      y: top + box.labFs * 1.25 + box.figFs * 0.86,
      size: box.figFs,
      anchor: "middle",
      dir: "ltr",
      arabic: false,
    });
  });
  // the woven bottom edge: a rule, then the serial's physical carrier
  if (o.foot.length) {
    s += `<path d="M${f2(L)} ${f2(y + box.ruleY)}H${f2(R)}" stroke="${P.Gdk}" stroke-width="${f2(0.8 * k)}" stroke-dasharray="${f2(2.2 * k)} ${f2(1.4 * k)}" stroke-linecap="round" opacity=".7"/>`;
    o.foot.forEach((ln, i) => {
      s += ctx.emit({
        kind: "foot",
        text: ln.text,
        x: (L + R) / 2,
        y: y + box.footY0 + i * box.footFs * 1.4,
        size: box.footFs,
        anchor: "middle",
        // the serial always reads left to right ("BOT #482913"), whatever the interface language
        dir: "ltr",
        arabic: false,
        serial: ln.serial,
      });
    });
  }
  // the weave over everything woven (the text reads as floats of thread, not print)
  if (!ctx.image)
    s += `<rect x="${f2(x + bdr)}" y="${f2(y + bdr)}" width="${f2(w - 2 * bdr)}" height="${f2(h - 2 * bdr)}" fill="url(#${ids.weft})" pointer-events="none"/>`;
  return { svg: s, box };
}
