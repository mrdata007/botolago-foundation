import wordmark from "@/assets/brand/botolago-wordmark-light.svg";
import {
  actionGradient,
  bodyFace,
  canvasOf,
  inkCentredBaseline,
  loadImage,
  loadShareFonts,
  roundRect,
  SHARE_FONTS,
  SHARE_IMAGE_SIZE,
  SHARE_PALETTE,
  shareFont,
  toPng,
} from "@/components/pepites/share-image";
import type { Language } from "@/types/domain";

/**
 * The "Ma journée BotolaGO" picture: one 1080×1350 post, drawn in the
 * manager's browser with the share-image helpers Pépites uses, in the main
 * app's look (BG-0153): the approved white wordmark on Tunnel Navy, white
 * Changa for the team, the total on the picture's one use of the action
 * gradient (a plate like a selected Fantasy plate, its figures in Tunnel
 * Navy), the factual lines on a Floodlight Navy panel.
 *
 * Every string arrives already translated and formatted (`RecapImageModel`):
 * this file only lays them out, mirrored for Arabic.
 */
export interface RecapImageModel {
  lang: Language;
  kicker: string;
  /** "Journée 9 · Résultat final". */
  heading: string;
  teamName: string;
  total: string;
  unit: string;
  /** Up to three factual lines (captain, transfers, top contributor). */
  lines: string[];
  footer: string;
}

/**
 * A line's runs: the left-to-right isolates (U+2066 … U+2069) the card puts
 * around a sum or a signed figure, and the text between them, with the
 * first-strong isolates (U+2068) dropped, so the canvas draws plain text.
 */
export function lineRuns(value: string): { text: string; ltr: boolean }[] {
  const runs: { text: string; ltr: boolean }[] = [];
  let current = "";
  let ltr = false;
  let depth = 0;
  const flush = () => {
    if (current) runs.push({ text: current, ltr });
    current = "";
  };
  for (const char of value) {
    if (char === "\u2066" && depth === 0) {
      flush();
      ltr = true;
      depth = 1;
    } else if (char === "\u2066" || char === "\u2068" || char === "\u2067") {
      if (depth > 0) depth += 1;
    } else if (char === "\u2069") {
      if (depth === 1) {
        flush();
        ltr = false;
        depth = 0;
      } else if (depth > 1) depth -= 1;
    } else {
      current += char;
    }
  }
  flush();
  return runs;
}

/**
 * Draws a line from the inline start. In Arabic each left-to-right run is
 * drawn on its own, placed right to left in reading order, so "8 × 2 = 16"
 * and "−4" keep their order and sign.
 */
function drawLine(
  ctx: CanvasRenderingContext2D,
  value: string,
  start: number,
  y: number,
  rtl: boolean,
) {
  const runs = lineRuns(value);
  if (!rtl) {
    ctx.textAlign = "left";
    ctx.fillText(runs.map((run) => run.text).join(""), start, y);
    return;
  }
  // Each run is drawn on its own, so its order never depends on how a canvas
  // treats the isolate marks (it draws text, not a DOM paragraph). The
  // invisible mark at its head (LRM / RLM) fixes the run's own direction.
  let cursor = start;
  ctx.save();
  ctx.textAlign = "right";
  for (const run of runs) {
    const marked = `${run.ltr ? "\u200e" : "\u200f"}${run.text}`;
    ctx.fillText(marked, cursor, y);
    cursor -= ctx.measureText(marked).width;
  }
  ctx.restore();
}

/** Shrinks a line until it fits `maxWidth`, down to `min` px. */
function fit(
  ctx: CanvasRenderingContext2D,
  value: string,
  face: keyof typeof SHARE_FONTS,
  weight: number,
  size: number,
  min: number,
  maxWidth: number,
) {
  let current = size;
  ctx.font = shareFont(face, weight, current);
  while (current > min && ctx.measureText(value).width > maxWidth) {
    current -= 2;
    ctx.font = shareFont(face, weight, current);
  }
  return current;
}

export async function renderRecapImage(model: RecapImageModel): Promise<Blob> {
  await loadShareFonts(model.lang, `${model.teamName} ${model.total} ${model.kicker}`);
  const logo = await loadImage(wordmark);
  const { width: W, height: H } = SHARE_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(W, H, model.lang);
  const rtl = model.lang === "ar";
  const body = bodyFace(model.lang);
  const pad = 88;
  const start = rtl ? W - pad : pad;
  const align: CanvasTextAlign = rtl ? "right" : "left";
  const inner = W - pad * 2;

  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.fillRect(0, 0, W, H);

  // The approved wordmark, at the inline start.
  if (logo) {
    const w = 420;
    const h = (w * 288.1029) / 1614.8063;
    ctx.drawImage(logo, rtl ? W - pad - w : pad, 96, w, h);
  }

  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = SHARE_PALETTE.white;
  ctx.font = shareFont(body, 800, 40);
  ctx.fillText(model.kicker, start, 290, inner);

  ctx.fillStyle = SHARE_PALETTE.muted;
  ctx.font = shareFont(body, 600, 34);
  ctx.fillText(model.heading, start, 350, inner);

  ctx.fillStyle = SHARE_PALETTE.white;
  fit(ctx, model.teamName, "display", 800, 72, 40, inner);
  ctx.fillText(model.teamName, start, 450, inner);

  // The total on the action gradient, like a selected Fantasy plate: the big
  // figure and its unit in Tunnel Navy, kept left-to-right as one run.
  const plate = { top: 500, height: 300, padding: 56 };
  ctx.fillStyle = actionGradient(ctx, plate.top, plate.top + plate.height);
  roundRect(ctx, pad, plate.top, inner, plate.height, 44);
  ctx.fill();
  ctx.save();
  ctx.direction = "ltr";
  ctx.font = shareFont(body, 800, 56);
  const unitW = ctx.measureText(model.unit).width;
  const scoreSize = fit(
    ctx,
    model.total,
    "display",
    800,
    260,
    120,
    inner - plate.padding * 2 - 24 - unitW,
  );
  const scoreW = ctx.measureText(model.total).width;
  const runW = scoreW + 24 + unitW;
  const runLeft = rtl ? W - pad - plate.padding - runW : pad + plate.padding;
  // Arabic reads the figure first, from the right: the unit goes on its left.
  const scoreX = rtl ? runLeft + unitW + 24 : runLeft;
  const unitX = rtl ? runLeft : runLeft + scoreW + 24;
  // The figure's measured ink centred in the plate; the unit shares its baseline.
  const baseline = inkCentredBaseline(ctx, model.total, scoreSize, plate.top + plate.height / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.font = shareFont("display", 800, scoreSize);
  ctx.fillText(model.total, scoreX, baseline);
  ctx.font = shareFont(body, 800, 56);
  ctx.fillText(model.unit, unitX, baseline);
  ctx.restore();

  // The factual lines, on one Floodlight Navy panel.
  const lines = model.lines.slice(0, 3);
  if (lines.length) {
    const top = 840;
    const lineH = 76;
    const panelH = 56 + lines.length * lineH;
    ctx.fillStyle = SHARE_PALETTE.panel;
    roundRect(ctx, pad, top, inner, panelH, 44);
    ctx.fill();
    ctx.textAlign = align;
    ctx.fillStyle = SHARE_PALETTE.white;
    lines.forEach((line, index) => {
      const plain = lineRuns(line)
        .map((run) => run.text)
        .join("");
      fit(ctx, plain, body, 600, 34, 22, inner - 80);
      drawLine(ctx, line, rtl ? W - pad - 40 : pad + 40, top + 76 + index * lineH, rtl);
    });
  }

  ctx.textAlign = align;
  ctx.fillStyle = SHARE_PALETTE.muted;
  ctx.font = shareFont(body, 600, 30);
  ctx.fillText(model.footer, start, H - 96, inner);

  return await toPng(canvas);
}
