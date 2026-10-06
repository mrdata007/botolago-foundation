import wordmark from "@/assets/brand/botolago-wordmark-light.svg";
import type { PepitesEdition, PepitesPlayerCard, PositionGroup } from "@/backend/pepites/contracts";
import { clubPalette, resolvePaletteColour } from "@/lib/club-palette";
import { toHex } from "@/lib/colour";
import type { Language } from "@/types/domain";

import { initials, segments, teamKit } from "./pepites-design";
import { formatCount, formatNumber, playerPhotoUrl } from "./pepites-format";

/**
 * The share images (architecture §1, §3.3), drawn in the reader's browser:
 *
 * - the Top 10 post, 1080×1350;
 * - a player's story card, 1080×1920: a 390×694 card at ×2.769.
 *
 * Their content and its order come from the Figma page "Share images"
 * (`29:386` / Arabic `29:581`, `11:515` / `26:436`). Their look is the main
 * app's (BG-0153, after the owner retired the Pépites night look in BG-0152):
 * the app's two navies with white type, Changa for titles and standalone
 * figures, Manrope (Noto Sans Arabic in Arabic) for the rest, the approved
 * white wordmark, club colour only where the data supplies it, and the action
 * gradient once per picture with intent. No slant, no mono, no gradient text.
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

/**
 * Every colour the pictures paint apart from a club's: kit tokens from
 * `src/styles.css`, as sRGB hex for the canvas. Each value was read from the
 * pixels Chromium paints for the token, not computed from its `oklch`.
 */
export const SHARE_PALETTE = {
  /** `--ui-ink-deep`, Tunnel Navy, oklch(0.24 0.09 258): the ground, and text on the gradient and the score plate. */
  ground: "#001c49",
  /** `--ui-ink`, Floodlight Navy, oklch(0.32 0.1 258): panels, the wheel's track, ghost figures. */
  panel: "#0c3164",
  /** `--ui-on-ink-plain` (and `--ui-scorebox`), Home Shirt White: type, lit segments, the score plate. */
  white: "#ffffff",
  /** `--ui-on-ink-muted`, color-mix(in srgb, on-ink-plain 78%, ink): the quieter lines on navy. */
  muted: "#cad2dd",
  /** `--ui-accent-spring`, Fresh Turf, oklch(0.88 0.19 152): the action gradient's top stop. */
  spring: "#60fa97",
  /** `--ui-accent-sky`, Matchday Sky, oklch(0.88 0.11 205): the action gradient's bottom stop. */
  sky: "#73edfa",
  /** `--ui-rule` (dark: 14% of the text colour), flattened on the panel. */
  rulePanel: "#2c4d79",
  /** `--ui-rule` (dark), flattened on the ground. */
  ruleGround: "#223b62",
} as const;

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

/**
 * The faces, as the app sets them: Changa for display (it carries Arabic
 * too), Manrope for French body text, Noto Sans Arabic for Arabic body text.
 */
export const SHARE_FONTS = {
  display: `"Changa", "Manrope", "Noto Sans Arabic", sans-serif`,
  body: `"Manrope", "Noto Sans Arabic", sans-serif`,
  arabic: `"Noto Sans Arabic", "Manrope", sans-serif`,
} as const;

/** Changa's heaviest weight (The 800 Ceiling Rule). */
const DISPLAY_MAX_WEIGHT = 800;

/** The label step's letter-spacing, 0.025em, set in French only (The No Arabic Tracking Rule). */
const LABEL_TRACKING = 0.025;

/** The ascent a "line-height: normal" box puts above the baseline. */
const ASCENT = { display: 1.227, body: 1.066, arabic: 1.25 } as const;

type Face = keyof typeof SHARE_FONTS;

/** The body face for a language: Manrope in French, Noto Sans Arabic in Arabic. */
export const bodyFace = (lang: Language): Face => (lang === "ar" ? "arabic" : "body");

export function shareFont(face: Face, weight: number, size: number) {
  const capped = face === "display" ? Math.min(weight, DISPLAY_MAX_WEIGHT) : weight;
  return `${capped} ${size}px ${SHARE_FONTS[face]}`;
}

/** Loads the faces a picture uses; a canvas does not wait for them by itself. */
export async function loadShareFonts(lang: Language, sample: string) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const body = bodyFace(lang);
  await Promise.all(
    [
      shareFont("display", 800, 40),
      shareFont("display", 600, 40),
      shareFont(body, 800, 28),
      shareFont(body, 700, 18),
      shareFont(body, 600, 18),
    ].map((spec) => document.fonts.load(spec, sample).catch(() => [])),
  );
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * The action gradient (`--ui-grad-action`): Fresh Turf at the top of the box
 * to Matchday Sky at its bottom. Once per picture, never as a text colour;
 * text on it is Tunnel Navy (The Earned Gradient Rule).
 */
export function actionGradient(ctx: CanvasRenderingContext2D, top: number, bottom: number) {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, SHARE_PALETTE.spring);
  gradient.addColorStop(1, SHARE_PALETTE.sky);
  return gradient;
}

/**
 * A club's colours on the pictures, from the club palette (never a raw kit
 * hex): its fill and the text on it as a light screen paints them, so the
 * club keeps its own colour, and its dark-theme edge, which clears 3:1 on a
 * dark surface, for the ring and the edge bar on the navy.
 */
export function shareClubColours(base: string): { fill: string; on: string; edge: string } {
  const palette = clubPalette({ primaryColor: base });
  const hex = (value: string, theme: "light" | "dark") => {
    const rgb = resolvePaletteColour(value, theme);
    return rgb ? toHex(rgb) : SHARE_PALETTE.panel;
  };
  return {
    fill: hex(palette.light.fill, "light"),
    on: palette.light.on === "var(--ui-ink-deep)" ? SHARE_PALETTE.ground : SHARE_PALETTE.white,
    edge: hex(palette.dark.edge, "dark"),
  };
}

/** A position measured from the inline start: from the left in French, from the right in Arabic. */
export const inlineX = (x: number, width: number, rtl: boolean) => (rtl ? width - x : x);

/**
 * A wheel slice's arc: five 72° slices from twelve o'clock, clockwise, less a
 * small gap at each end. Arabic reads them counter-clockwise: each slice is
 * the French one mirrored across the vertical axis.
 */
export function sliceAngles(index: number, rtl: boolean, gap = 0.05): [number, number] {
  const from = -Math.PI / 2 + (index * 2 * Math.PI) / 5 + gap;
  const to = -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / 5 - gap;
  return rtl ? [Math.PI - to, Math.PI - from] : [from, to];
}

/** Text whose box top is at `y`. Letter-spacing applies in French only. */
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: {
    face: Face;
    weight: number;
    size: number;
    fill: string | CanvasGradient;
    align?: CanvasTextAlign;
    tracking?: number;
    maxWidth?: number;
  },
) {
  ctx.save();
  ctx.font = shareFont(options.face, options.weight, options.size);
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "alphabetic";
  // No letter-spacing in Arabic: it pulls the joined letters apart.
  if ("letterSpacing" in ctx && options.tracking && ctx.direction !== "rtl") {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${options.tracking}px`;
  }
  ctx.fillStyle = options.fill;
  ctx.fillText(value, x, y + options.size * ASCENT[options.face], options.maxWidth);
  ctx.restore();
}

/** Draws `image` over the box like `object-fit: cover`: filled, centred, never stretched. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) {
    ctx.drawImage(image, x, y, w, h);
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * The player's disc: the photo, or the club's fill with the initials in the
 * club's own text colour, inside a ring in the club's edge colour, so a navy
 * or black kit stays a disc on the navy (the screens' `ui.club.ring`).
 */
function headshot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  club: string,
  label: string,
  photo: HTMLImageElement | null,
  ring: number,
) {
  const colours = shareClubColours(club);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = colours.fill;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (photo) {
    drawCover(ctx, photo, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = colours.on;
    ctx.font = shareFont("display", 800, r * 0.72);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + r * 0.04);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - ring / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring;
  ctx.strokeStyle = colours.edge;
  ctx.stroke();
  ctx.restore();
}

/** The wordmark's own proportions (`botolago-wordmark-light.svg`). */
const WORDMARK_RATIO = 1614.8063 / 288.1029;

/**
 * The brand lock-up: the approved white BotolaGO wordmark, a hairline and the
 * section's name ("Pépites" / "جواهر"), `h` tall, from the inline start `x`
 * (the left edge in French, the right edge in Arabic, where the wordmark
 * still leads). Without the wordmark (it failed to load) the name stands alone.
 */
function brandLockup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  brand: string,
  lang: Language,
  logo: HTMLImageElement | null,
) {
  const rtl = lang === "ar";
  const logoW = logo ? h * WORDMARK_RATIO : 0;
  const gap = h * 0.4;
  const ruleW = Math.max(1, h / 16);
  const size = h * 0.68;
  ctx.save();
  ctx.font = shareFont("display", 700, size);
  const brandW = ctx.measureText(brand).width;
  ctx.restore();
  const total = logo ? logoW + gap + ruleW + gap + brandW : brandW;
  const left = rtl ? x - total : x;
  // The wordmark leads from the inline start in both languages; only the
  // positions turn round, so the parts draw in the same order.
  const at = (offset: number, w: number) => (rtl ? left + total - offset - w : left + offset);
  if (logo) {
    ctx.drawImage(logo, at(0, logoW), y, logoW, h);
    ctx.fillStyle = SHARE_PALETTE.muted;
    ctx.fillRect(at(logoW + gap, ruleW), y + h * 0.1, ruleW, h * 0.8);
  }
  ctx.save();
  ctx.fillStyle = SHARE_PALETTE.white;
  ctx.font = shareFont("display", 700, size);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(brand, at(logo ? logoW + gap + ruleW + gap : 0, brandW), y + h / 2);
  ctx.restore();
}

export function roundRect(
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

export async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
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

export function canvasOf(width: number, height: number, lang: Language) {
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
 * The Top 10 post. Throws only when the browser has no 2D canvas; a photo
 * that fails to load, or would taint the canvas, gives way to the club disc.
 */
export async function renderShareImage(model: ShareImageModel): Promise<Blob> {
  const [logo, ...photos] = await Promise.all([
    loadImage(wordmark),
    ...model.rows.map((row) => (row.photoUrl ? loadImage(row.photoUrl) : Promise.resolve(null))),
  ]);
  try {
    return await drawTopTen(model, logo ?? null, photos);
  } catch (error) {
    if (photos.some(Boolean))
      return await drawTopTen(
        model,
        logo ?? null,
        photos.map(() => null),
      );
    throw error;
  }
}

/** The Top 10 post's rows: the panel's box and each row's pitch. */
const TOP_TEN = { panelX: 40, panelTop: 456, rowsTop: 464, row: 76, edge: 11 } as const;

async function drawTopTen(
  model: ShareImageModel,
  logo: HTMLImageElement | null,
  photos: (HTMLImageElement | null)[],
) {
  const { width, height } = SHARE_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(width, height, model.lang);
  await loadShareFonts(model.lang, `${model.title} ${model.brand} ${model.legend}`);
  const rtl = model.lang === "ar";
  const mx = (x: number) => inlineX(x, width, rtl);
  const body = bodyFace(model.lang);
  const start: CanvasTextAlign = rtl ? "right" : "left";
  const end: CanvasTextAlign = rtl ? "left" : "right";

  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.fillRect(0, 0, width, height);
  brandLockup(ctx, mx(72), 64, 44, model.brand, model.lang, logo);
  // The kicker sits at the inline end: right in French, left in Arabic.
  text(ctx, model.kicker, mx(1008), 71, {
    face: body,
    weight: 800,
    size: 22,
    fill: SHARE_PALETTE.muted,
    align: end,
    tracking: 22 * LABEL_TRACKING,
  });

  text(ctx, model.title, mx(72), rtl ? 92 : 108, {
    face: "display",
    weight: 800,
    size: rtl ? 140 : 150,
    fill: SHARE_PALETTE.white,
    align: start,
  });
  text(ctx, rtl ? model.brand : model.brand.toLocaleUpperCase("fr"), mx(80), rtl ? 290 : 286, {
    face: "display",
    weight: 800,
    size: 64,
    fill: SHARE_PALETTE.white,
    align: start,
  });

  // The week, on the picture's one use of the action gradient: a pill like
  // the Fantasy deadline pill, its text in Tunnel Navy.
  ctx.save();
  ctx.font = shareFont(body, 800, 22);
  if ("letterSpacing" in ctx && !rtl) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${22 * LABEL_TRACKING}px`;
  }
  const pillW = ctx.measureText(model.subtitle).width + 2 * 22;
  ctx.restore();
  const pillTop = 396;
  const pillH = 44;
  const pillX = rtl ? mx(80) - pillW : 80;
  ctx.fillStyle = actionGradient(ctx, pillTop, pillTop + pillH);
  roundRect(ctx, pillX, pillTop, pillW, pillH, pillH / 2);
  ctx.fill();
  text(ctx, model.subtitle, rtl ? pillX + pillW - 22 : pillX + 22, pillTop + 9, {
    face: body,
    weight: 800,
    size: 22,
    fill: SHARE_PALETTE.ground,
    align: start,
    tracking: 22 * LABEL_TRACKING,
  });

  // The rows on one Floodlight Navy panel, each with its club's colour on the
  // inline-start edge, as the Top 10 cards on /pepites carry it.
  const panelW = width - TOP_TEN.panelX * 2;
  const panelH = TOP_TEN.rowsTop - TOP_TEN.panelTop + model.rows.length * TOP_TEN.row + 8;
  ctx.save();
  ctx.fillStyle = SHARE_PALETTE.panel;
  roundRect(ctx, TOP_TEN.panelX, TOP_TEN.panelTop, panelW, panelH, 40);
  ctx.fill();
  ctx.clip();
  model.rows.forEach((row, index) => {
    const top = TOP_TEN.rowsTop + index * TOP_TEN.row;
    const band = index === 0 ? top - 8 : top + 2;
    const bandEnd = index === model.rows.length - 1 ? top + TOP_TEN.row + 8 : top + TOP_TEN.row - 2;
    ctx.fillStyle = shareClubColours(row.club).edge;
    ctx.fillRect(
      rtl ? width - TOP_TEN.panelX - TOP_TEN.edge : TOP_TEN.panelX,
      band,
      TOP_TEN.edge,
      bandEnd - band,
    );
  });
  ctx.restore();

  model.rows.forEach((row, index) => {
    const top = TOP_TEN.rowsTop + index * TOP_TEN.row;
    const mid = top + TOP_TEN.row / 2;
    if (index > 0) {
      ctx.fillStyle = SHARE_PALETTE.rulePanel;
      ctx.fillRect(72, top, 936, 2);
    }
    text(ctx, row.rank, mx(72), mid - 30, {
      face: "display",
      weight: 800,
      size: 40,
      fill: row.rankNumber <= 3 ? SHARE_PALETTE.white : SHARE_PALETTE.muted,
      align: start,
    });
    headshot(ctx, mx(171), mid, 28, row.club, row.initials, photos[index] ?? null, 3);
    text(ctx, row.name, mx(220), mid - 36, {
      face: body,
      weight: 800,
      size: 28,
      fill: SHARE_PALETTE.white,
      align: start,
      maxWidth: 380,
    });
    text(ctx, row.meta, mx(220), mid + 4, {
      face: body,
      weight: 700,
      size: 17,
      fill: SHARE_PALETTE.muted,
      align: start,
      tracking: 17 * LABEL_TRACKING,
      maxWidth: 380,
    });
    // Seg10Bar: lit in white over the recessed Tunnel Navy track.
    for (let segment = 0; segment < 10; segment += 1) {
      const x = rtl ? width - 681 - 17 - segment * 22 : 681 + segment * 22;
      ctx.fillStyle = segment < row.segments ? SHARE_PALETTE.white : SHARE_PALETTE.ground;
      roundRect(ctx, x, mid - 10, 17, 20, 4);
      ctx.fill();
    }
    text(ctx, row.score, mx(1008), mid - 34, {
      face: "display",
      weight: 800,
      size: 48,
      fill: SHARE_PALETTE.white,
      align: end,
    });
  });

  const footerTop = TOP_TEN.panelTop + panelH + 34;
  text(ctx, model.footer, mx(72), footerTop, {
    face: "body",
    weight: 800,
    size: 24,
    fill: SHARE_PALETTE.white,
    align: start,
  });
  text(ctx, model.legend, mx(1008), footerTop + 3, {
    face: body,
    weight: 700,
    size: 18,
    fill: SHARE_PALETTE.muted,
    align: end,
  });
  return await toPng(canvas);
}

/**
 * A player's story card, 1080×1920: the 390×694 card at ×2.769, with the
 * five-slice percentile wheel.
 */
export async function renderStoryImage(model: StoryModel): Promise<Blob> {
  const [logo, photo] = await Promise.all([
    loadImage(wordmark),
    model.photoUrl ? loadImage(model.photoUrl) : Promise.resolve(null),
  ]);
  try {
    return await drawStory(model, logo, photo);
  } catch (error) {
    if (photo) return await drawStory(model, logo, null);
    throw error;
  }
}

/** The wheel, in the card's 390-wide units: centre, the track's radii, the values' radius. */
const WHEEL = { cx: 195, cy: 318, inner: 62, outer: 128, label: 142 } as const;

async function drawStory(
  model: StoryModel,
  logo: HTMLImageElement | null,
  photo: HTMLImageElement | null,
) {
  const { width, height } = STORY_IMAGE_SIZE;
  const { canvas, ctx } = canvasOf(width, height, model.lang);
  await loadShareFonts(
    model.lang,
    `${model.firstName} ${model.lastName} ${model.meta} ${model.legend.join(" ")}`,
  );
  const rtl = model.lang === "ar";
  const k = width / 390;
  ctx.scale(k, k);
  const w = 390;
  const mx = (x: number) => inlineX(x, w, rtl);
  const body = bodyFace(model.lang);
  const start: CanvasTextAlign = rtl ? "right" : "left";
  const end: CanvasTextAlign = rtl ? "left" : "right";
  const club = shareClubColours(model.club);

  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.fillRect(0, 0, w, height / k);
  // The club's colour down the inline-start edge, as on a club-edged card.
  ctx.fillStyle = club.edge;
  ctx.fillRect(rtl ? w - 4 : 0, 0, 4, height / k);
  // The ghost rank at the inline end, tone on tone, ending above the wheel.
  if (model.ghost) {
    text(ctx, model.ghost, mx(372), 2, {
      face: "display",
      weight: 800,
      size: 150,
      fill: SHARE_PALETTE.panel,
      align: end,
    });
  }
  brandLockup(ctx, mx(20), 26, 20, model.brand, model.lang, logo);
  text(ctx, model.kicker, mx(370), 31, {
    face: body,
    weight: 800,
    size: 9,
    fill: SHARE_PALETTE.muted,
    align: end,
    tracking: 9 * LABEL_TRACKING,
  });
  if (model.firstName) {
    text(ctx, isolate(model.firstName), mx(22), 66, {
      face: "display",
      weight: 600,
      size: 32,
      fill: SHARE_PALETTE.white,
      align: start,
      maxWidth: 340,
    });
  }
  text(ctx, isolate(model.lastName), mx(22), model.firstName ? 100 : 84, {
    face: "display",
    weight: 800,
    size: 40,
    fill: SHARE_PALETTE.white,
    align: start,
    maxWidth: 340,
  });
  text(ctx, model.meta, mx(22), 160, {
    face: body,
    weight: 700,
    size: 10,
    fill: SHARE_PALETTE.muted,
    align: start,
    tracking: 10 * LABEL_TRACKING,
    maxWidth: 346,
  });

  // The wheel: each slice's track in Floodlight Navy, its value (0–100, from
  // the inner radius out) in the action gradient, the picture's one use of
  // it, the way the app fills progress; the figure at the slice's tip.
  const fill = actionGradient(ctx, WHEEL.cy - WHEEL.outer, WHEEL.cy + WHEEL.outer);
  model.percentiles.forEach((value, index) => {
    const [startAngle, endAngle] = sliceAngles(index, rtl);
    sector(
      ctx,
      WHEEL.cx,
      WHEEL.cy,
      WHEEL.inner,
      WHEEL.outer,
      startAngle,
      endAngle,
      SHARE_PALETTE.panel,
    );
    if (value !== null) {
      const reach = ((WHEEL.outer - WHEEL.inner) * Math.max(0, Math.min(100, value))) / 100;
      sector(ctx, WHEEL.cx, WHEEL.cy, WHEEL.inner, WHEEL.inner + reach, startAngle, endAngle, fill);
    }
    const midAngle = (startAngle + endAngle) / 2;
    ctx.save();
    ctx.fillStyle = SHARE_PALETTE.white;
    ctx.font = shareFont("display", 800, 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      value === null ? "–" : formatNumber(Math.round(value), model.lang),
      WHEEL.cx + Math.cos(midAngle) * WHEEL.label,
      WHEEL.cy + Math.sin(midAngle) * WHEEL.label,
    );
    ctx.restore();
  });
  headshot(ctx, WHEEL.cx, WHEEL.cy, 58, model.club, model.initials, photo, 1.5);

  // Legend: four on the first row, the fifth on the second, centred. Each
  // label leads with a small wheel that marks its own slice.
  const legendRows = [model.legend.slice(0, 4), model.legend.slice(4)];
  legendRows.forEach((labels, row) => {
    ctx.font = shareFont(body, 700, 10);
    const widths = labels.map((label) => 12 + 4 + ctx.measureText(label).width);
    const total = widths.reduce((sum, value) => sum + value, 0) + (labels.length - 1) * 12;
    let x = rtl ? 195 + total / 2 : 195 - total / 2;
    labels.forEach((label, index) => {
      const slice = row * 4 + index;
      const itemW = widths[index]!;
      const centre = rtl ? x - 6 : x + 6;
      const y = 470 + row * 21 + 10.5;
      for (let other = 0; other < 5; other += 1) {
        const [a, b] = sliceAngles(other, rtl, 0.12);
        sector(
          ctx,
          centre,
          y,
          2,
          6,
          a,
          b,
          other === slice ? SHARE_PALETTE.white : SHARE_PALETTE.panel,
        );
      }
      text(ctx, label, rtl ? x - 16 : x + 16, 470 + row * 21 + 1, {
        face: body,
        weight: 700,
        size: 10,
        fill: SHARE_PALETTE.muted,
        align: start,
      });
      x = rtl ? x - itemW - 12 : x + itemW + 12;
    });
  });

  ctx.fillStyle = SHARE_PALETTE.ruleGround;
  ctx.fillRect(20, 540, 350, 1);

  // The score on the white score plate, its digits in Tunnel Navy.
  const plate = { w: 88, h: 64, top: 560 };
  const plateX = rtl ? mx(20) - plate.w : 20;
  ctx.fillStyle = SHARE_PALETTE.white;
  roundRect(ctx, plateX, plate.top, plate.w, plate.h, 14);
  ctx.fill();
  ctx.save();
  let scoreSize = 44;
  ctx.font = shareFont("display", 800, scoreSize);
  while (scoreSize > 24 && ctx.measureText(model.score).width > plate.w - 20) {
    scoreSize -= 2;
    ctx.font = shareFont("display", 800, scoreSize);
  }
  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(model.score, plateX + plate.w / 2, plate.top + plate.h / 2 + scoreSize * 0.36);
  ctx.restore();

  const column = mx(120);
  text(ctx, model.rankLine, column, 566, {
    face: body,
    weight: 800,
    size: 9,
    fill: SHARE_PALETTE.white,
    align: start,
    tracking: 9 * LABEL_TRACKING,
    maxWidth: 250,
  });
  text(ctx, model.statsLine, column, 584, {
    face: body,
    weight: 600,
    size: 9,
    fill: SHARE_PALETTE.muted,
    align: start,
    maxWidth: 250,
  });
  text(ctx, model.footer, column, 603, {
    face: "body",
    weight: 800,
    size: 10,
    fill: SHARE_PALETTE.white,
    align: start,
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
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, outer, start, end);
  ctx.arc(cx, cy, inner, end, start, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
