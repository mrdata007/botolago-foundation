import type { PepitesEdition, PepitesPlayerCard } from "@/backend/pepites/contracts";
import type { Language } from "@/types/domain";

import { formatNumber, playerPhotoUrl } from "./pepites-format";

/**
 * The share image of a published edition (architecture §1, §3.3): a
 * 1080×1350 picture of the Top 10, drawn in the reader's browser.
 *
 * Drawn here rather than on the server: the browser already has the page's
 * fonts and shapes Arabic correctly, and the server has no image library.
 * The rights rule is the server's own: the image shows a player's photo only
 * when its release allows social use (`scope = 'in_app_and_social'`, the
 * same test `player_photo_for(…, 'share')` makes); any other player gets the
 * silhouette. A withdrawn edition has no share image.
 */

export const SHARE_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

const COLORS = {
  top: "#0b1f44",
  bottom: "#12356b",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.72)",
  faint: "rgba(255,255,255,0.14)",
  accent: "#3ee0a0",
  silhouette: "rgba(255,255,255,0.28)",
} as const;

export interface ShareImageRow {
  readonly rank: string;
  readonly name: string;
  readonly club: string;
  readonly score: string;
}

export interface ShareImageModel {
  readonly lang: Language;
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly footer: string;
  readonly rows: readonly ShareImageRow[];
  /** The leader's photo, only when its rights allow social use. */
  readonly leaderPhotoUrl: string | null;
}

/** A photo the share image may carry: approved for social use, or none. */
export function sharePhotoUrl(
  player: Pick<PepitesPlayerCard, "photo">,
  supabaseUrl?: string,
): string | null {
  if (player.photo?.scope !== "in_app_and_social") return null;
  return playerPhotoUrl(player, supabaseUrl);
}

export function shareImageModel(
  edition: Pick<PepitesEdition, "week" | "status" | "entries">,
  lang: Language,
  copy: { kicker: string; title: string; subtitle: string; footer: string },
): ShareImageModel | null {
  if (edition.status === "withdrawn" || edition.entries.length === 0) return null;
  const entries = [...edition.entries].sort((a, b) => a.rank - b.rank).slice(0, 10);
  return {
    lang,
    kicker: copy.kicker,
    title: copy.title.replace("{n}", formatNumber(edition.week, lang)),
    subtitle: copy.subtitle,
    footer: copy.footer,
    rows: entries.map((entry) => ({
      rank: formatNumber(entry.rank, lang),
      // Isolated, so a Latin name keeps its order in an Arabic picture.
      name: `\u2068${entry.player.name}\u2069`,
      club: entry.player.team ? entry.player.team.shortName[lang] : "",
      score: formatNumber(Math.round(entry.score), lang),
    })),
    leaderPhotoUrl: entries[0] ? sharePhotoUrl(entries[0].player) : null,
  };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = COLORS.faint;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = COLORS.silhouette;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.18, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.78, r * 0.72, r * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws the model and returns a PNG. Throws only when the browser has no 2D
 * canvas; a photo that fails to load (or is refused by CORS) becomes the
 * silhouette.
 */
export async function renderShareImage(model: ShareImageModel, fontFamily: string): Promise<Blob> {
  const { width, height } = SHARE_IMAGE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share_image_no_canvas");
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;

  const rtl = model.lang === "ar";
  ctx.direction = rtl ? "rtl" : "ltr";
  const start = rtl ? width - 72 : 72;
  const end = rtl ? 72 : width - 72;
  const alignStart: CanvasTextAlign = rtl ? "right" : "left";
  const alignEnd: CanvasTextAlign = rtl ? "left" : "right";
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLORS.top);
  gradient.addColorStop(1, COLORS.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = alignStart;
  ctx.font = font(800, 34);
  ctx.fillText(model.kicker, start, 110);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(800, 64);
  ctx.fillText(model.title, start, 190, width - 144);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(500, 32);
  ctx.fillText(model.subtitle, start, 244, width - 144);

  // The leader, larger, with the photo when its rights allow it.
  const leader = model.rows[0];
  const photo = model.leaderPhotoUrl ? await loadImage(model.leaderPhotoUrl) : null;
  const avatarR = 78;
  const avatarX = rtl ? width - 72 - avatarR : 72 + avatarR;
  const avatarY = 360;
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } else {
    drawSilhouette(ctx, avatarX, avatarY, avatarR);
  }
  if (leader) {
    const textStart = rtl ? avatarX - avatarR - 32 : avatarX + avatarR + 32;
    ctx.textAlign = alignStart;
    ctx.fillStyle = COLORS.accent;
    ctx.font = font(800, 40);
    ctx.fillText(`#${leader.rank}`, textStart, avatarY - 24);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 48);
    ctx.fillText(leader.name, textStart, avatarY + 30, 520);
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(500, 30);
    ctx.fillText(leader.club, textStart, avatarY + 72, 520);
    ctx.textAlign = alignEnd;
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 72);
    ctx.fillText(leader.score, end, avatarY + 24);
  }

  // Ranks 2 to 10.
  const rowTop = 480;
  const rowHeight = 86;
  model.rows.slice(1).forEach((row, index) => {
    const y = rowTop + index * rowHeight;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(72, y + rowHeight - 2, width - 144, 2);
    const baseline = y + 56;
    ctx.textAlign = alignStart;
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(800, 34);
    ctx.fillText(row.rank, start, baseline);
    const nameStart = rtl ? start - 72 : start + 72;
    ctx.fillStyle = COLORS.text;
    ctx.font = font(700, 36);
    ctx.fillText(row.name, nameStart, baseline, 500);
    ctx.textAlign = alignEnd;
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(500, 28);
    ctx.fillText(row.club, rtl ? end + 120 : end - 120, baseline, 200);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 38);
    ctx.fillText(row.score, end, baseline);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(600, 30);
  ctx.fillText(model.footer, width / 2, height - 60);

  return await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("share_image_empty"))),
        "image/png",
      );
    } catch (error) {
      // A tainted canvas (a photo without CORS): draw again without it.
      if (model.leaderPhotoUrl) {
        renderShareImage({ ...model, leaderPhotoUrl: null }, fontFamily).then(resolve, reject);
      } else {
        reject(error);
      }
    }
  });
}
