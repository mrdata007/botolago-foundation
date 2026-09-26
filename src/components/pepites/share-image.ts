import type { PepitesEdition, PepitesPlayerCard, PositionGroup } from "@/backend/pepites/contracts";
import type { Language } from "@/types/domain";

import { initials, segments, teamKit } from "./pepites-design";
import { formatCount, formatNumber, playerPhotoUrl } from "./pepites-format";

/**
 * The share images (architecture §1, §3.3), drawn in the reader's browser
 * after the Figma page "Share images":
 *
 * - the Top 10 post, 1080×1350 (`29:386`, Arabic `29:581`);
 * - a player's story card, 1080×1920 (`11:515`, Arabic `26:436`): the
 *   390×694 card at ×2.769.
 *
 * Drawn here rather than on the server: the browser already has the page's
 * fonts and shapes Arabic correctly, and the server has no image library.
 * The rights rule is the server's own: a picture shows a player's photo only
 * when its release allows social use (`scope = 'in_app_and_social'`, the
 * same test `player_photo_for(…, 'share')` makes); any other player gets the
 * club disc and initials. A withdrawn edition has no share image.
 */

export const SHARE_IMAGE_SIZE = { width: 1080, height: 1350 } as const;
export const STORY_IMAGE_SIZE = { width: 1080, height: 1920 } as const;

const NIGHT = "#070d24";
const MUTED = "#9aa4c7";
const SOFT = "#c9d2ea";
const SPRING = "#5de39b";
const ENERGY = ["#5de39b", "#7fd6f0", "#7c6cf0"] as const;
/** The feed's bar colours, a shade off Seg10Bar's (Figma 29:386). */
const FEED_SEGMENTS = [
  "#5de39b",
  "#65e0b0",
  "#6eddc5",
  "#76d9da",
  "#7fd6ef",
  "#7ec2f0",
  "#7eacf0",
  "#7d97f0",
  "#7d81f0",
  "#7c6cf0",
] as const;
/** The radial chart's slices, in the percentiles' order (Figma 11:515). */
export const SLICE_COLOURS = ["#4f6bff", "#22b8cf", "#2fcf7f", "#8b6cf6", "#f0a020"] as const;

/** Latin names keep their order inside an Arabic picture. */
const isolate = (text: string) => `⁨${text}⁩`;

/** A photo a share image may carry: approved for social use, or none. */
export function sharePhotoUrl(
  player: Pick<PepitesPlayerCard, "photo">,
  supabaseUrl?: string,
): string | null {
  if (player.photo?.scope !== "in_app_and_social") return null;
  return playerPhotoUrl(player, supabaseUrl);
}

/* ----------------------------------------------------------------- models */

export interface ShareImageRow {
  readonly rank: string;
  readonly rankNumber: number;
  readonly name: string;
  readonly meta: string;
  readonly score: string;
  readonly segments: number;
  readonly initials: string;
  readonly club: string;
  readonly photoUrl: string | null;
}

export interface ShareImageModel {
  readonly lang: Language;
  readonly brand: string;
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly footer: string;
  readonly legend: string;
  readonly rows: readonly ShareImageRow[];
}

export interface ShareCopy {
  readonly brand: string;
  readonly kicker: string;
  /** "TOP 10" / "أفضل 10". */
  readonly title: string;
  /** "SEMAINE {n} · RISING SCORE". */
  readonly subtitle: string;
  readonly footer: string;
  readonly legend: string;
  readonly club: (player: PepitesPlayerCard) => string;
  readonly position: (group: PositionGroup) => string;
}

export function shareImageModel(
  edition: Pick<PepitesEdition, "week" | "status" | "entries">,
  lang: Language,
  copy: ShareCopy,
): ShareImageModel | null {
  if (edition.status === "withdrawn" || edition.entries.length === 0) return null;
  const entries = [...edition.entries].sort((a, b) => a.rank - b.rank).slice(0, 10);
  return {
    lang,
    brand: copy.brand,
    kicker: copy.kicker,
    title: copy.title,
    subtitle: copy.subtitle.replace("{n}", formatNumber(edition.week, lang)),
    footer: copy.footer,
    legend: copy.legend,
    rows: entries.map((entry) => ({
      rank: formatNumber(entry.rank, lang),
      rankNumber: entry.rank,
      name: isolate(entry.player.name),
      meta: [
        copy.club(entry.player),
        entry.player.positionGroup ? copy.position(entry.player.positionGroup) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      score: formatNumber(Math.round(entry.score), lang),
      segments: segments(entry.score),
      initials: initials(entry.player.name),
      club: teamKit(entry.player.team).primary,
      photoUrl: sharePhotoUrl(entry.player),
    })),
  };
}

export interface StoryModel {
  readonly lang: Language;
  readonly brand: string;
  readonly kicker: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly meta: string;
  readonly ghost: string;
  /** Note, forme, contribution, progression, temps de jeu: 0–100 or null. */
  readonly percentiles: readonly (number | null)[];
  readonly legend: readonly string[];
  readonly score: string;
  readonly rankLine: string;
  readonly statsLine: string;
  readonly footer: string;
  readonly initials: string;
  readonly club: string;
  readonly photoUrl: string | null;
}

/** "Mohamed El Arouch" → ["Mohamed", "El Arouch"]; one word stays on the second line. */
export function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return ["", words[0] ?? ""];
  return [words[0]!, words.slice(1).join(" ")];
}

export function storyModel(
  player: PepitesPlayerCard,
  score: {
    score: number | null;
    rank: number | null;
    minutes: number;
    ratingAvg: number | null;
    percentiles: Record<string, number | null>;
  },
  lang: Language,
  copy: {
    brand: string;
    kicker: string;
    meta: string;
    legend: readonly string[];
    rankLine: string;
    statsLine: string;
    footer: string;
  },
): StoryModel {
  const [first, last] = splitName(player.name);
  return {
    lang,
    brand: copy.brand,
    kicker: copy.kicker,
    firstName: lang === "ar" ? first : first.toLocaleUpperCase("fr"),
    lastName: lang === "ar" ? last : last.toLocaleUpperCase("fr"),
    meta: copy.meta,
    ghost: score.rank !== null ? String(score.rank).padStart(2, "0") : "",
    percentiles: ["rating", "form", "contribution", "progression", "minutes"].map((key) => {
      const value = score.percentiles[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
    legend: copy.legend,
    score: typeof score.score === "number" ? formatNumber(Math.round(score.score), lang) : "–",
    rankLine: copy.rankLine.replace(
      "{n}",
      score.rank !== null ? formatNumber(score.rank, lang) : "–",
    ),
    statsLine: copy.statsLine
      .replace("{minutes}", formatCount(score.minutes, lang))
      .replace("{rating}", score.ratingAvg !== null ? formatNumber(score.ratingAvg, lang, 2) : "–"),
    footer: copy.footer,
    initials: initials(player.name),
    club: teamKit(player.team).primary,
    photoUrl: sharePhotoUrl(player),
  };
}

/* ---------------------------------------------------------------- drawing */

const FONTS = {
  display: `"Changa", "Noto Sans Arabic", sans-serif`,
  body: `"Manrope", "Noto Sans Arabic", sans-serif`,
  mono: `"IBM Plex Mono", "Noto Sans Arabic", monospace`,
  arabic: `"Noto Sans Arabic", "Changa", sans-serif`,
} as const;

/** The ascent Figma's "line-height: normal" boxes put above the baseline. */
const ASCENT = { display: 1.227, body: 1.066, mono: 1.025, arabic: 1.25 } as const;

type Face = keyof typeof FONTS;

function font(face: Face, weight: number, size: number) {
  return `${weight} ${size}px ${FONTS[face]}`;
}

/** Loads the faces a picture uses; a canvas does not wait for them by itself. */
async function loadFonts(lang: Language) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const sample = lang === "ar" ? "أفضل 10 جواهر" : "TOP 10 Pépites";
  await Promise.all(
    [
      font("display", 800, 40),
      font("body", 800, 28),
      font("body", 700, 18),
      font("mono", 600, 22),
      font("mono", 500, 17),
      font("arabic", 700, 20),
    ].map((spec) => document.fonts.load(spec, sample).catch(() => [])),
  );
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

function energy(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, ENERGY[0]);
  gradient.addColorStop(0.45, ENERGY[1]);
  gradient.addColorStop(1, ENERGY[2]);
  return gradient;
}

/** A blurred circle of colour, as a radial fade (Figma layer blur). */
function glow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  colour: string,
  alpha: number,
  blur: number,
) {
  const outer = r + blur;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
  ctx.save();
  ctx.globalAlpha = alpha;
  gradient.addColorStop(0, colour);
  gradient.addColorStop(Math.max(0, (r - blur) / outer), colour);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
  ctx.restore();
}

/** Text whose box top is at `y` (Figma coordinates), optionally slanted. */
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: {
    face: Face;
    weight: number;
    size: number;
    /** A colour, or "energy": the gradient across the text's own width. */
    fill: string;
    align?: CanvasTextAlign;
    slant?: boolean;
    tracking?: number;
    stroke?: { width: number; colour: string };
    maxWidth?: number;
  },
) {
  ctx.save();
  ctx.font = font(options.face, options.weight, options.size);
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx && options.tracking) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${options.tracking}px`;
  }
  const baseline = options.size * ASCENT[options.face];
  ctx.translate(x, y);
  // Figma's slant: skewX(−7.97°) scaleY(.99) from the box's top-left corner.
  if (options.slant) ctx.transform(1, 0, -0.1386, 0.9903, 0, 0);
  if (options.stroke) {
    ctx.lineWidth = options.stroke.width;
    ctx.strokeStyle = options.stroke.colour;
    ctx.strokeText(value, 0, baseline, options.maxWidth);
  } else {
    if (options.fill === "energy") {
      const measured = ctx.measureText(value).width;
      const w = options.maxWidth ? Math.min(measured, options.maxWidth) : measured;
      const align = options.align ?? "left";
      const x0 =
        align === "right" || (align === "end" && ctx.direction !== "rtl")
          ? -w
          : align === "center"
            ? -w / 2
            : 0;
      ctx.fillStyle = energy(ctx, x0, x0 + w);
    } else {
      ctx.fillStyle = options.fill;
    }
    ctx.fillText(value, 0, baseline, options.maxWidth);
  }
  ctx.restore();
}

/** The club disc with initials, or the photo, in a circle. */
function headshot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  club: string,
  label: string,
  photo: HTMLImageElement | null,
  dark = "#0a0d1f",
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const gradient = ctx.createRadialGradient(cx, cy + r * 0.6, 0, cx, cy + r * 0.6, r * 1.6);
  gradient.addColorStop(0, club);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (photo) {
    ctx.drawImage(photo, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = font("display", 800, r * 0.72);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + r * 0.04);
  }
  ctx.restore();
}

/** GoMark: [GO] Pépites [DATA], or in Arabic [DATA] جواهر [GO], at scale `k`. */
function goMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  brand: string,
  rtl: boolean,
) {
  const logoH = 22 * k;
  ctx.save();
  ctx.font = font("body", 800, 9 * k);
  const logoW = Math.max(22 * k, ctx.measureText("GO").width + 10 * k);
  ctx.font = font(rtl ? "arabic" : "body", rtl ? 700 : 800, 12 * k);
  const brandW = ctx.measureText(brand).width;
  ctx.font = font("mono", 600, 8 * k);
  const dataW = ctx.measureText("DATA").width + 5 * k * 2 + 1.12 * k * 4;
  ctx.restore();
  const gap = 6 * k;
  const total = logoW + gap + brandW + gap + dataW;
  // `x` is the inline start: the left edge in French, the right edge in Arabic.
  const left = rtl ? x - total : x;
  const parts = rtl ? ["data", "brand", "logo"] : ["logo", "brand", "data"];
  let cursor = left;
  for (const part of parts) {
    if (part === "logo") {
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, cursor, y, logoW, logoH, 6 * k);
      ctx.fill();
      ctx.fillStyle = "#1b2a6b";
      ctx.font = font("body", 800, 9 * k);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GO", cursor + logoW / 2, y + logoH / 2);
      cursor += logoW + gap;
    } else if (part === "brand") {
      ctx.fillStyle = "#ffffff";
      ctx.font = font(rtl ? "arabic" : "body", rtl ? 700 : 800, 12 * k);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(brand, cursor, y + logoH / 2);
      cursor += brandW + gap;
    } else {
      const h = 8 * k + 6 * k;
      const top = y + (logoH - h) / 2;
      ctx.fillStyle = energy(ctx, cursor, cursor + dataW);
      roundRect(ctx, cursor, top, dataW, h, 4 * k);
      ctx.fill();
      text(ctx, "DATA", cursor + 5 * k, top + 3 * k - 8 * k * 0.1, {
        face: "mono",
        weight: 600,
        size: 8 * k,
        fill: "#0b1330",
        tracking: 1.12 * k,
      });
      cursor += dataW + gap;
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("share_image_empty"))),
        "image/png",
      );
    } catch (error) {
      reject(error);
    }
  });
}

function canvasOf(width: number, height: number, lang: Language) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share_image_no_canvas");
  // Arabic runs right to left, so a line mixing Arabic and figures keeps its
  // order; alignment below is physical ("left"/"right") in both languages.
  ctx.direction = lang === "ar" ? "rtl" : "ltr";
  return { canvas, ctx };
}

/**
 * The Top 10 post (Figma 29:386 / 29:581). Throws only when the browser has
 * no 2D canvas; a photo that fails to load, or would taint the canvas, gives
 * way to the club disc.
 */
export async function renderShareImage(model: ShareImageModel): Promise<Blob> {
  const photos = await Promise.all(
    model.rows.map((row) => (row.photoUrl ? loadImage(row.photoUrl) : Promise.resolve(null))),
  );
  try {
    return await drawTopTen(model, photos);
  } catch (error) {
    if (photos.some(Boolean))
      return await drawTopTen(
        model,
        photos.map(() => null),
      );
    throw error;
  }
}

async function drawTopTen(model: ShareImageModel, photos: (HTMLImageElement | null)[]) {
  const { width, height } = SHARE_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(width, height, model.lang);
  await loadFonts(model.lang);
  const rtl = model.lang === "ar";
  const mx = (x: number) => (rtl ? width - x : x);

  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, width, height);
  glow(ctx, mx(910), 50, 350, "#7c6cf0", 0.35, 160);
  glow(ctx, mx(40), 420, 300, "#1597b8", 0.28, 160);
  text(ctx, "10", rtl ? -40 : 560, -120, {
    face: "display",
    weight: 800,
    size: 620,
    fill: "transparent",
    slant: true,
    stroke: { width: 3, colour: "rgba(255,255,255,0.07)" },
  });

  goMark(ctx, mx(72), 64, 2.2, model.brand, rtl);
  // The kicker sits at the inline end: right in French, left in Arabic.
  text(ctx, model.kicker, rtl ? 72 : 1008, 72, {
    face: "mono",
    weight: 600,
    size: 22,
    fill: MUTED,
    align: rtl ? "left" : "right",
    tracking: rtl ? 0 : 2.2,
  });

  if (rtl) {
    text(ctx, model.title, mx(72), 96, {
      face: "display",
      weight: 800,
      size: 140,
      fill: "energy",
      align: "right",
    });
    text(ctx, model.brand, mx(84), 280, {
      face: "display",
      weight: 800,
      size: 64,
      fill: "#ffffff",
      align: "right",
    });
  } else {
    text(ctx, model.title, 76, 112, {
      face: "display",
      weight: 800,
      size: 150,
      fill: "energy",
      slant: true,
    });
    text(ctx, model.brand.toLocaleUpperCase("fr"), 84, 272, {
      face: "display",
      weight: 800,
      size: 64,
      fill: "#ffffff",
    });
  }
  text(ctx, model.subtitle, mx(80), rtl ? 368 : 352, {
    face: "mono",
    weight: 600,
    size: 22,
    fill: SPRING,
    align: rtl ? "right" : "left",
    tracking: rtl ? 0 : 1.76,
  });

  model.rows.forEach((row, index) => {
    const top = 420 + index * 79;
    const mid = top + 39;
    if (index > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(72, top, 936, 1);
    }
    text(ctx, row.rank, mx(72), mid - 30, {
      face: "display",
      weight: 800,
      size: 40,
      fill: row.rankNumber <= 3 ? "energy" : MUTED,
      slant: !rtl,
      align: rtl ? "right" : "left",
    });
    headshot(ctx, mx(171), mid, 28, row.club, row.initials, photos[index] ?? null);
    text(ctx, row.name, mx(220), mid - 36, {
      face: "body",
      weight: 800,
      size: 28,
      fill: "#ffffff",
      align: rtl ? "right" : "left",
      maxWidth: 380,
    });
    text(ctx, row.meta, mx(220), mid + 4, {
      face: "mono",
      weight: 500,
      size: 17,
      fill: MUTED,
      align: rtl ? "right" : "left",
      tracking: rtl ? 0 : 0.68,
      maxWidth: 380,
    });
    for (let segment = 0; segment < 10; segment += 1) {
      const x = rtl ? width - 681 - 17 - segment * 22 : 681 + segment * 22;
      ctx.fillStyle = segment < row.segments ? FEED_SEGMENTS[segment]! : "rgba(255,255,255,0.10)";
      roundRect(ctx, x, mid - 10, 17, 20, 3);
      ctx.fill();
    }
    text(ctx, row.score, rtl ? 72 : 1008, mid - 34, {
      face: "display",
      weight: 800,
      size: 48,
      fill: "energy",
      align: rtl ? "left" : "right",
      slant: true,
    });
  });

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(72, 1232, 936, 1);
  text(ctx, model.footer, rtl ? 1008 : 72, 1262, {
    face: "mono",
    weight: 600,
    size: 24,
    fill: "#ffffff",
    align: rtl ? "right" : "left",
  });
  text(ctx, model.legend, rtl ? 72 : 1008, 1264, {
    face: rtl ? "arabic" : "body",
    weight: 700,
    size: 18,
    fill: MUTED,
    align: rtl ? "left" : "right",
  });
  return await toPng(canvas);
}

/**
 * A player's story card (Figma 11:515 / 26:436), 1080×1920: the 390×694
 * card at ×2.769, with the five-slice percentile wheel.
 */
export async function renderStoryImage(model: StoryModel): Promise<Blob> {
  const photo = model.photoUrl ? await loadImage(model.photoUrl) : null;
  try {
    return await drawStory(model, photo);
  } catch (error) {
    if (photo) return await drawStory(model, null);
    throw error;
  }
}

async function drawStory(model: StoryModel, photo: HTMLImageElement | null) {
  const { width, height } = STORY_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(width, height, model.lang);
  await loadFonts(model.lang);
  const rtl = model.lang === "ar";
  const k = width / 390;
  ctx.scale(k, k);
  const w = 390;
  const mx = (x: number) => (rtl ? w - x : x);

  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, w, height / k);
  glow(ctx, mx(180), 310, 140, model.club, 0.6, 40);
  if (model.ghost) {
    text(ctx, model.ghost, rtl ? 38 : 160, 30, {
      face: "display",
      weight: 800,
      size: 190,
      fill: "transparent",
      slant: true,
      stroke: { width: 1.5, colour: "rgba(255,255,255,0.12)" },
    });
  }
  goMark(ctx, mx(20), 26, 1, model.brand, rtl);
  text(ctx, model.kicker, rtl ? 20 : 370, 32, {
    face: "mono",
    weight: 500,
    size: 9,
    fill: SOFT,
    align: rtl ? "left" : "right",
    tracking: rtl ? 0 : 0.72,
  });
  const align: CanvasTextAlign = rtl ? "right" : "left";
  if (model.firstName) {
    text(ctx, isolate(model.firstName), mx(22), 68, {
      face: "display",
      weight: 800,
      size: 38,
      fill: "#ffffff",
      align,
      slant: !rtl,
      maxWidth: 340,
    });
  }
  text(ctx, isolate(model.lastName), mx(22), model.firstName ? 104 : 86, {
    face: "display",
    weight: 800,
    size: 38,
    fill: "energy",
    align,
    slant: !rtl,
    maxWidth: 340,
  });
  text(ctx, model.meta, mx(20), 158, {
    face: "mono",
    weight: 500,
    size: 10,
    fill: SOFT,
    align,
    tracking: rtl ? 0 : 0.6,
    maxWidth: 350,
  });

  // The wheel: five 72° slices from twelve o'clock, clockwise (mirrored in
  // Arabic), a 0.1 rad gap, inner r 62, value to 62 + 66 × p / 100.
  const cx = 195;
  const cy = 318;
  const gap = 0.05;
  model.percentiles.forEach((value, index) => {
    const from = -Math.PI / 2 + (index * 2 * Math.PI) / 5 + gap;
    const to = -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / 5 - gap;
    const [start, end] = rtl ? [Math.PI - to, Math.PI - from] : [from, to];
    sector(ctx, cx, cy, 62, 128, start, end, "rgba(255,255,255,0.06)");
    if (value !== null) {
      sector(
        ctx,
        cx,
        cy,
        62,
        62 + (66 * Math.max(0, Math.min(100, value))) / 100,
        start,
        end,
        SLICE_COLOURS[index]!,
      );
    }
    const midAngle = (start + end) / 2;
    ctx.save();
    ctx.fillStyle = SOFT;
    ctx.font = font("mono", 600, 10);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      value === null ? "–" : formatNumber(Math.round(value), model.lang),
      cx + Math.cos(midAngle) * 142,
      cy + Math.sin(midAngle) * 142,
    );
    ctx.restore();
  });
  headshot(ctx, cx, cy, 58, model.club, model.initials, photo, "#0b1a3d");

  // Legend: four on the first row, the fifth on the second, centred.
  const legendRows = [model.legend.slice(0, 4), model.legend.slice(4)];
  legendRows.forEach((labels, row) => {
    ctx.font = font(rtl ? "arabic" : "body", 700, 10);
    const widths = labels.map((label) => 8 + 4 + ctx.measureText(label).width);
    const total = widths.reduce((sum, value) => sum + value, 0) + (labels.length - 1) * 10;
    let x = rtl ? 195 + total / 2 : 195 - total / 2;
    labels.forEach((label, index) => {
      const colour = SLICE_COLOURS[row * 4 + index]!;
      const itemW = widths[index]!;
      const swatchX = rtl ? x - 8 : x;
      ctx.fillStyle = colour;
      roundRect(ctx, swatchX, 470 + row * 21 + 6.5, 8, 8, 2);
      ctx.fill();
      text(ctx, label, rtl ? x - 12 : x + 12, 470 + row * 21 + 1, {
        face: rtl ? "arabic" : "body",
        weight: 700,
        size: 10,
        fill: SOFT,
        align: rtl ? "right" : "left",
      });
      x = rtl ? x - itemW - 10 : x + itemW + 10;
    });
  });

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(20, 540, 350, 1);
  text(ctx, model.score, rtl ? 384 : 22, 556, {
    face: "display",
    weight: 800,
    size: 64,
    fill: "energy",
    align: rtl ? "right" : "left",
    slant: true,
  });
  const column = rtl ? 270 : 120;
  text(ctx, model.rankLine, column, 570, {
    face: "mono",
    weight: 600,
    size: 9,
    fill: SPRING,
    align,
    tracking: rtl ? 0 : 1.08,
  });
  text(ctx, model.statsLine, column, 588, {
    face: "mono",
    weight: 500,
    size: 9,
    fill: SOFT,
    align,
    maxWidth: 240,
  });
  text(ctx, model.footer, column, 612, {
    face: "mono",
    weight: 600,
    size: 10,
    fill: "#ffffff",
    align,
  });
  return await toPng(canvas);
}

function sector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, outer, start, end);
  ctx.arc(cx, cy, inner, end, start, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
