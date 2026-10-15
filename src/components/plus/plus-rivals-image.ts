import { WORDMARK_PATHS } from "@/assets/brand/wordmark-paths";
import {
  canvasOf,
  inkCentredBaseline,
  loadShareFonts,
  roundRect,
  shareFont,
  SHARE_IMAGE_SIZE,
  bodyFace,
  toPng,
} from "@/components/pepites/share-image";
import type { Language } from "@/types/domain";

import { PLUS_SHAPE } from "./PlusLogo";

/**
 * The rivalry poster: one 1080x1350 picture, drawn in the member's browser with the share-image
 * helpers the recap uses, in the night-stadium look of the screen's poster (a diagonal mint and sky
 * split, the two managers' initials, the journée's score between them, the totals, the tally, the
 * day the journée was published, a crowd at the foot). The BotolaGO+ logo is drawn from the brand
 * paths and the mint « + » of the logo, never typed.
 *
 * It shows the friend's FULL name, as the league already shows it to its members (owner decision,
 * 2026-10-15), and nothing about any card rating: only names, points, the league's name and the
 * stamp. Every string arrives already translated (`RivalImageModel`): this file only lays them out,
 * mirrored for Arabic.
 */
export interface RivalImageModel {
  lang: Language;
  leagueName: string;
  /** « Journée 11 · Publié le 12 oct. ». */
  stamp: string;
  meName: string;
  rivalName: string;
  meInitials: string;
  rivalInitials: string;
  /** The journée's scores, as text. */
  meScore: string;
  rivalScore: string;
  /** « Journée 11 : vous gagnez 62 à 58 ». */
  verdict: string;
  totalLabel: string;
  meTotal: string;
  rivalTotal: string;
  /** « Vous menez de 14 pts »; null when a total is unknown. */
  gap: string | null;
  /** « Bilan : 7 victoires, 4 défaites ». */
  bilan: string;
  leader: "me" | "rival" | "tie" | null;
}

/** The colours of the screen's poster as sRGB hex (a canvas does not parse oklch). */
const PALETTE = {
  navy: "#050b18",
  mint: "#53e488",
  sky: "#87d7f7",
  mintHalf: "#002f1f",
  skyHalf: "#0b293c",
  glass: "rgba(27, 36, 51, 0.82)",
  line: "rgba(255, 255, 255, 0.16)",
  white: "#ffffff",
  muted: "#c7d2de",
  crowd: "#000104",
  pill: "rgba(4, 10, 22, 0.72)",
} as const;

/** A repeatable pseudo-random sequence, so the crowd is the same in every picture. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function drawCrowd(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const top = H - 126;
  const haze = ctx.createLinearGradient(0, top, 0, H);
  haze.addColorStop(0, "rgba(127, 214, 255, 0)");
  haze.addColorStop(0.35, "rgba(159, 240, 196, 0.2)");
  haze.addColorStop(1, "rgba(127, 214, 255, 0.05)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, top, W, 126);
  const random = seeded(7);
  ctx.fillStyle = PALETTE.crowd;
  for (const [row, alpha, base] of [
    [0, 0.55, top + 46],
    [1, 1, top + 78],
  ] as const) {
    ctx.globalAlpha = alpha;
    for (let x = -20 + row * 18; x < W + 40; x += 38 + random() * 12) {
      const r = 15 + random() * 6;
      const y = base + random() * 10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, x - r * 1.7, y + r * 0.9, r * 3.4, 200, r * 1.4);
      ctx.fill();
      if (random() > 0.82) {
        roundRect(ctx, x + r, y - 70 - random() * 26, 6, 70, 3);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Shrinks a line until it fits `maxWidth`, down to `min` px, in the given face and weight. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  value: string,
  face: Parameters<typeof shareFont>[0],
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

/** The logo's 1860 x 288 box: the wordmark in white, the « + » in mint, at `x`, `y`, `width` wide. */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const scale = width / 1860;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = PALETTE.white;
  for (const d of WORDMARK_PATHS) ctx.fill(new Path2D(d));
  ctx.fillStyle = PALETTE.mint;
  ctx.fill(new Path2D(PLUS_SHAPE));
  ctx.restore();
}

export async function renderRivalImage(model: RivalImageModel): Promise<Blob> {
  await loadShareFonts(
    model.lang,
    `${model.meName} ${model.rivalName} ${model.leagueName} ${model.verdict} ${model.bilan} ${model.stamp}`,
  );
  const { width: W, height: H } = SHARE_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(W, H, model.lang);
  const rtl = model.lang === "ar";
  const body = bodyFace(model.lang);
  const pad = 72;
  const centre = W / 2;
  // The member sits at the inline start (left in French, right in Arabic).
  const meX = rtl ? W - 228 : 228;
  const rivalX = rtl ? 228 : W - 228;

  // The ground and the diagonal split: the member's half mint, the rival's half sky.
  ctx.fillStyle = PALETTE.navy;
  ctx.fillRect(0, 0, W, H);
  const seam = (x: number) => (rtl ? W - x : x);
  ctx.fillStyle = PALETTE.mintHalf;
  ctx.beginPath();
  ctx.moveTo(seam(0), 0);
  ctx.lineTo(seam(W * 0.6), 0);
  ctx.lineTo(seam(W * 0.4), H);
  ctx.lineTo(seam(0), H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.skyHalf;
  ctx.beginPath();
  ctx.moveTo(seam(W * 0.6), 0);
  ctx.lineTo(seam(W), 0);
  ctx.lineTo(seam(W), H);
  ctx.lineTo(seam(W * 0.4), H);
  ctx.closePath();
  ctx.fill();
  const fade = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.82);
  fade.addColorStop(0, "rgba(5, 11, 24, 0)");
  fade.addColorStop(1, "rgba(3, 8, 18, 0.94)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  // The leader's side glows.
  if (model.leader === "me" || model.leader === "rival") {
    const x = model.leader === "me" ? meX : rivalX;
    const glow = ctx.createRadialGradient(x, 500, 0, x, 500, 420);
    glow.addColorStop(
      0,
      model.leader === "me" ? "rgba(83, 228, 136, 0.34)" : "rgba(135, 215, 247, 0.32)",
    );
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 100, W, 800);
  }

  // Logo and stamp.
  const logoW = 400;
  drawLogo(ctx, rtl ? W - pad - logoW : pad, 88, logoW);
  ctx.font = shareFont(body, 800, 30);
  const stampW = Math.min(ctx.measureText(model.stamp).width + 56, W - pad * 2 - logoW - 24);
  const stampX = rtl ? pad : W - pad - stampW;
  ctx.fillStyle = PALETTE.pill;
  roundRect(ctx, stampX, 96, stampW, 56, 28);
  ctx.fill();
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitSize(ctx, model.stamp, body, 800, 30, 22, stampW - 40);
  ctx.fillText(model.stamp, stampX + stampW / 2, 134, stampW - 40);

  // The league.
  ctx.fillStyle = PALETTE.white;
  fitSize(ctx, model.leagueName, body, 800, 40, 26, W - pad * 2);
  ctx.direction = /[\u0600-\u06ff]/.test(model.leagueName) ? "rtl" : "ltr";
  ctx.fillText(model.leagueName, centre, 262, W - pad * 2);
  ctx.direction = rtl ? "rtl" : "ltr";

  // The two faces, the journée's score between them.
  for (const [x, initials, border, name] of [
    [meX, model.meInitials, PALETTE.mint, model.meName],
    [rivalX, model.rivalInitials, PALETTE.sky, model.rivalName],
  ] as const) {
    ctx.save();
    ctx.shadowColor = border;
    ctx.shadowBlur = 36;
    ctx.fillStyle = "rgba(5, 11, 24, 0.7)";
    ctx.beginPath();
    ctx.arc(x, 500, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = border;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, 500, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.white;
    const size = fitSize(ctx, initials, "display", 800, 88, 56, 150);
    ctx.fillText(initials, x, inkCentredBaseline(ctx, initials, size, 500));
    ctx.fillStyle = PALETTE.white;
    fitSize(ctx, name, "display", 800, 48, 28, 420);
    // A Latin name keeps its full stop on its right in an Arabic picture.
    ctx.direction = /[\u0600-\u06ff]/.test(name) ? "rtl" : "ltr";
    ctx.fillText(name, x, 692, 420);
    ctx.direction = rtl ? "rtl" : "ltr";
  }
  ctx.save();
  ctx.direction = "ltr";
  // Left to right as drawn: in Arabic the member is on the right, so their score is written last.
  const round = rtl
    ? `${model.rivalScore} – ${model.meScore}`
    : `${model.meScore} – ${model.rivalScore}`;
  const roundSize = fitSize(ctx, round, "display", 800, 100, 56, 296);
  ctx.fillStyle = PALETTE.white;
  ctx.fillText(round, centre, inkCentredBaseline(ctx, round, roundSize, 500), 296);
  ctx.restore();

  ctx.fillStyle = PALETTE.white;
  fitSize(ctx, model.verdict, body, 800, 44, 28, W - pad * 2);
  ctx.fillText(model.verdict, centre, 780, W - pad * 2);

  // The totals on a glass panel.
  const panel = { top: 830, height: 290 };
  ctx.fillStyle = PALETTE.glass;
  roundRect(ctx, pad, panel.top, W - pad * 2, panel.height, 40);
  ctx.fill();
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = shareFont(body, 800, 34);
  ctx.fillText(model.totalLabel, centre, panel.top + 62);
  ctx.save();
  ctx.direction = "ltr";
  const dash = "–";
  const sizeTotal = fitSize(
    ctx,
    `${model.meTotal} ${dash} ${model.rivalTotal}`,
    "display",
    800,
    150,
    80,
    W - pad * 2 - 80,
  );
  ctx.font = shareFont("display", 800, sizeTotal);
  const dashW = ctx.measureText(` ${dash} `).width;
  const meW = ctx.measureText(model.meTotal).width;
  const rivalW = ctx.measureText(model.rivalTotal).width;
  const runW = meW + dashW + rivalW;
  const left = centre - runW / 2;
  const base = inkCentredBaseline(ctx, model.meTotal, sizeTotal, panel.top + 146);
  // The member's total is always the mint one, on the member's side of the picture.
  const first = rtl
    ? { text: model.rivalTotal, colour: PALETTE.sky, w: rivalW }
    : { text: model.meTotal, colour: PALETTE.mint, w: meW };
  const second = rtl
    ? { text: model.meTotal, colour: PALETTE.mint, w: meW }
    : { text: model.rivalTotal, colour: PALETTE.sky, w: rivalW };
  ctx.textAlign = "left";
  ctx.fillStyle = first.colour;
  ctx.fillText(first.text, left, base);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(` ${dash} `, left + first.w, base);
  ctx.fillStyle = second.colour;
  ctx.fillText(second.text, left + first.w + dashW, base);
  ctx.restore();
  ctx.textAlign = "center";
  if (model.gap) {
    ctx.fillStyle = PALETTE.white;
    fitSize(ctx, model.gap, body, 800, 38, 26, W - pad * 2 - 80);
    ctx.fillText(model.gap, centre, panel.top + 254, W - pad * 2 - 80);
  }

  // The tally, then the crowd.
  ctx.fillStyle = PALETTE.white;
  fitSize(ctx, model.bilan, body, 800, 40, 26, W - pad * 2);
  ctx.fillText(model.bilan, centre, 1178, W - pad * 2);
  drawCrowd(ctx, W, H);

  return await toPng(canvas);
}
