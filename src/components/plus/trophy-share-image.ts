/**
 * The picture of one trophy, drawn on the phone: 1080 × 1350 (4:5, the standard image, free for
 * everyone) or 1080 × 1920 (the story card, a member's). The frame is a border of the card in the
 * colours of the chosen frame; the standard image has none. No card serial and no AI notice: the
 * footer is the site and the game, and the figure is the one that earned the trophy.
 */
export type TrophyImageFormat = "post" | "story";

export interface TrophyImageModel {
  format: TrophyImageFormat;
  rtl: boolean;
  kicker: string;
  /** The big figure (« +11 », « 81 », « 3e »). */
  figure: string;
  unit: string;
  label: string;
  /** One line under the label: the players of a transfer, the journée. */
  sub: string;
  stamp: string;
  who: string;
  footer: string;
  /** Colours of the frame border, or null for the standard image. */
  frame: readonly [string, string] | null;
}

export const TROPHY_IMAGE_SIZE: Record<TrophyImageFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

/** The two colours of each frame's border (the picture cannot draw a CSS gradient string). */
export const FRAME_COLOURS: Record<string, readonly [string, string]> = {
  founder_2026: ["#5ccbff", "#45e58f"],
  first_stade: ["#7fd4ff", "#1f6f9e"],
  first_pro: ["#5cf0a0", "#1e8a58"],
  first_champion: ["#ffd35c", "#b0741f"],
  first_legend: ["#d9c8ff", "#45e58f"],
  winning_transfer: ["#45e58f", "#0f3a2a"],
  ten_gameweeks: ["#45e58f", "#0f3a2a"],
  thirty_gameweeks: ["#45e58f", "#5ccbff"],
};

const FONT = '"Changa", "Manrope", "Cairo", system-ui, sans-serif';

function drawCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = "#45e58f";
  ctx.fillStyle = "rgba(69,229,143,0.18)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  const bowl = new Path2D("M-30 -40 H30 V-5 A30 30 0 0 1 -30 -5 Z");
  ctx.fill(bowl);
  ctx.stroke(bowl);
  ctx.stroke(
    new Path2D(
      "M-30 -30 H-45 V-20 A20 20 0 0 0 -28 0 M30 -30 H45 V-20 A20 20 0 0 1 28 0 M0 25 V42 M-20 46 H20",
    ),
  );
  ctx.restore();
}

export async function renderTrophyImage(model: TrophyImageModel): Promise<Blob> {
  const { width, height } = TROPHY_IMAGE_SIZE[model.format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.direction = model.rtl ? "rtl" : "ltr";
  ctx.textAlign = "center";

  const margin = model.frame ? 40 : 0;
  if (model.frame) {
    const border = ctx.createLinearGradient(0, 0, width, height);
    border.addColorStop(0, model.frame[0]);
    border.addColorStop(1, model.frame[1]);
    ctx.fillStyle = border;
    ctx.fillRect(0, 0, width, height);
  }
  const bg = ctx.createRadialGradient(width / 2, 0, 40, width / 2, height * 0.3, height);
  bg.addColorStop(0, "#1b3150");
  bg.addColorStop(1, "#070d19");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(margin, margin, width - margin * 2, height - margin * 2, margin ? 48 : 0);
  ctx.fill();

  const top = height * (model.format === "story" ? 0.3 : 0.26);
  const cone = ctx.createLinearGradient(0, margin, 0, top + 360);
  cone.addColorStop(0, "rgba(127,212,255,0.35)");
  cone.addColorStop(1, "rgba(127,212,255,0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 90, margin);
  ctx.lineTo(width / 2 + 90, margin);
  ctx.lineTo(width / 2 + 420, top + 360);
  ctx.lineTo(width / 2 - 420, top + 360);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#7fd4ff";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(model.kicker.toUpperCase(), width / 2, top - 120);
  drawCup(ctx, width / 2, top, 150);
  ctx.fillStyle = "#45e58f";
  ctx.font = `800 220px ${FONT}`;
  ctx.fillText(model.figure, width / 2, top + 260);
  ctx.fillStyle = "#c9d4e6";
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(model.unit, width / 2, top + 330);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(model.label, width / 2, top + 460);
  ctx.fillStyle = "#c9d4e6";
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(model.sub, width / 2, top + 530);
  ctx.fillStyle = "#7fd4ff";
  ctx.fillText(model.stamp, width / 2, top + 596);
  ctx.fillStyle = "#c9d4e6";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(model.who, width / 2, height - margin - 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(model.footer, width / 2, height - margin - 80);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image_unavailable"))),
      "image/png",
    ),
  );
}
