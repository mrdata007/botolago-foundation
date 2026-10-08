/**
 * The BotolaGO wordmark, inlined as a nested <svg> on the woven patch. The geometry is the brand
 * file's, untouched: the path data is read from the two SVG files at build time. The files carry
 * an XML prolog, an id and a <style> with a document-wide class, none of which may be inlined (a
 * second `.st0` rule would recolour every other copy on the page), so only the viewBox and the
 * path data are kept and the colour is set as an attribute on each path.
 *
 * The patch is always a light yarn (the club's second colour when it is light, else a cream), in
 * both themes, so the colour wordmark is the one that reads on it. The all-white file is not
 * bundled: the share image's wordmark is drawn by the share module, on its dark ground.
 */
import colourSvg from "@/assets/brand/botolago-wordmark-color.svg?raw";

export interface WordmarkPath {
  d: string;
  /** The brand file styles this path (the lettering); the other paths are the ball. */
  styled: boolean;
}
export interface WordmarkArt {
  viewBox: string;
  width: number;
  height: number;
  paths: WordmarkPath[];
}

/** Only path-data characters may enter the markup. */
const PATH_DATA = /^[0-9a-zA-Z\s,.\-+]+$/;

export function parseWordmark(svg: string): WordmarkArt {
  const viewBox = /viewBox="([0-9.\s-]+)"/.exec(svg)?.[1] ?? "0 0 1614.8063 288.1029";
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  const paths: WordmarkPath[] = [];
  for (const m of svg.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const d = /\sd="([^"]+)"/.exec(m[1])?.[1];
    if (d && PATH_DATA.test(d)) paths.push({ d, styled: /class="st0"/.test(m[1]) });
  }
  return { viewBox, width: w, height: h, paths };
}

/** The wordmark's width over its height, from the file. */
export const WORDMARK = parseWordmark(colourSvg);

/** Brand blue (the lettering) and black (the ball) of the colour file. */
const INK = "#0151fc";
const BALL = "#000000";

/**
 * The colour wordmark as a nested <svg> at (x, y), w by h units, `aria-hidden`: the patch is
 * decoration, the card's label already says everything.
 */
export function wordmarkSvg(x: number, y: number, w: number, h: number): string {
  const paths = WORDMARK.paths
    .map((p) => `<path d="${p.d}" fill="${p.styled ? INK : BALL}"/>`)
    .join("");
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${WORDMARK.viewBox}" aria-hidden="true" focusable="false" overflow="visible">${paths}</svg>`;
}
