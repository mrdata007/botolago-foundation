import wordmark from "@/assets/brand/botolago-wordmark-light.svg";
import {
  canvasOf,
  loadImage,
  roundRect,
  SHARE_IMAGE_SIZE,
  toPng,
} from "@/components/pepites/share-image";
import type { Language } from "@/types/domain";

/**
 * The "Ma journée BotolaGO" picture: one 1080×1350 post, drawn in the
 * manager's browser with the share-image helpers Pépites uses, the approved
 * light wordmark, and the app's night and action-gradient colours.
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

const NIGHT = "#070d24";
const PANEL = "#111a3d";
const MUTED = "#9aa4c7";
const ACTION = ["#5de39b", "#7fd6f0"] as const;
const FACE = `"Changa", "Noto Sans Arabic", sans-serif`;
const BODY = `"Manrope", "Noto Sans Arabic", sans-serif`;

async function loadFonts(sample: string) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  await Promise.all(
    [`800 160px ${FACE}`, `800 64px ${FACE}`, `700 40px ${BODY}`, `600 30px ${BODY}`].map((spec) =>
      document.fonts.load(spec, sample).catch(() => []),
    ),
  );
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
  face: string,
  weight: number,
  size: number,
  min: number,
  maxWidth: number,
) {
  let current = size;
  ctx.font = `${weight} ${current}px ${face}`;
  while (current > min && ctx.measureText(value).width > maxWidth) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${face}`;
  }
  return current;
}

export async function renderRecapImage(model: RecapImageModel): Promise<Blob> {
  await loadFonts(`${model.teamName} ${model.total} ${model.kicker}`);
  const logo = await loadImage(wordmark);
  const { width: W, height: H } = SHARE_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(W, H, model.lang);
  const rtl = model.lang === "ar";
  const pad = 88;
  const start = rtl ? W - pad : pad;
  const align: CanvasTextAlign = rtl ? "right" : "left";
  const inner = W - pad * 2;

  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, ACTION[0]);
  band.addColorStop(1, ACTION[1]);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 16);

  // The approved wordmark, at the inline start.
  if (logo) {
    const w = 420;
    const h = (w * 288.1029) / 1614.8063;
    ctx.drawImage(logo, rtl ? W - pad - w : pad, 96, w, h);
  }

  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = ACTION[0];
  ctx.font = `800 40px ${BODY}`;
  ctx.fillText(model.kicker, start, 290, inner);

  ctx.fillStyle = MUTED;
  ctx.font = `600 34px ${BODY}`;
  ctx.fillText(model.heading, start, 350, inner);

  ctx.fillStyle = "#ffffff";
  fit(ctx, model.teamName, FACE, 800, 72, 40, inner);
  ctx.fillText(model.teamName, start, 450, inner);

  // The score: the big figure and its unit, kept left-to-right as one run.
  ctx.save();
  ctx.direction = "ltr";
  const scoreSize = fit(ctx, model.total, FACE, 800, 260, 120, inner - 200);
  const scoreW = ctx.measureText(model.total).width;
  ctx.font = `700 56px ${BODY}`;
  const unitW = ctx.measureText(model.unit).width;
  const runW = scoreW + 24 + unitW;
  const runLeft = rtl ? W - pad - runW : pad;
  // Arabic reads the figure first, from the right: the unit goes on its left.
  const scoreX = rtl ? runLeft + unitW + 24 : runLeft;
  const unitX = rtl ? runLeft : runLeft + scoreW + 24;
  const gradient = ctx.createLinearGradient(scoreX, 0, scoreX + scoreW, 0);
  gradient.addColorStop(0, ACTION[0]);
  gradient.addColorStop(1, ACTION[1]);
  ctx.textAlign = "left";
  ctx.fillStyle = gradient;
  ctx.font = `800 ${scoreSize}px ${FACE}`;
  ctx.fillText(model.total, scoreX, 740);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 56px ${BODY}`;
  ctx.fillText(model.unit, unitX, 740);
  ctx.restore();

  // The factual lines, on one panel.
  const lines = model.lines.slice(0, 3);
  if (lines.length) {
    const top = 820;
    const lineH = 76;
    const panelH = 56 + lines.length * lineH;
    ctx.fillStyle = PANEL;
    roundRect(ctx, pad, top, inner, panelH, 32);
    ctx.fill();
    ctx.textAlign = align;
    ctx.fillStyle = "#ffffff";
    lines.forEach((line, index) => {
      const plain = lineRuns(line)
        .map((run) => run.text)
        .join("");
      fit(ctx, plain, BODY, 600, 34, 22, inner - 80);
      drawLine(ctx, line, rtl ? W - pad - 40 : pad + 40, top + 76 + index * lineH, rtl);
    });
  }

  ctx.textAlign = align;
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${BODY}`;
  ctx.fillText(model.footer, start, H - 96, inner);

  return await toPng(canvas);
}
