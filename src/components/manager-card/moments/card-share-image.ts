import wordmark from "@/assets/brand/botolago-wordmark-light.svg";
import {
  bodyFace,
  canvasOf,
  inkCentredBaseline,
  loadImage,
  loadShareFonts,
  roundRect,
  SHARE_PALETTE,
  shareClubColours,
  shareFont,
  toPng,
} from "@/components/pepites/share-image";

import { activeRenderer } from "../active-renderer";
import { cardStrings, type Translate } from "../copy";
import { fillText } from "../interpolate";
import type { CardImageArt, CardRenderer, TextRun } from "../renderer";
import type { CardLang, CardProfile, CardStrings } from "../types";

/**
 * The share picture (plan sections 4.7 and 6.7): 1080 × 1920, drawn in the manager's browser on
 * the share palette the Pépites and recap pictures use (Tunnel Navy ground, white type, the
 * approved wordmark), in the interface language, fully mirrored in Arabic.
 *
 * The card is the renderer's `image()` art: a text-free SVG, drawn through an `Image` from a Blob
 * URL, and the text runs it left out, drawn here with `fillText` once the share fonts are loaded
 * (an SVG drawn as an image cannot use the page's web fonts). Around it: the wordmark, the
 * provisional note when the number is provisional, the caption, the name in Changa 800, the
 * number with its tier, the serial when there is one, the season, the club as a colour disc with
 * its initials (no crest, plan 2.6) and the address.
 *
 * Only the sharer's own card, and only with a number: an unrated card has nothing to share.
 */
export const CARD_IMAGE_SIZE = { width: 1080, height: 1920 } as const;

/** Where each block sits, in image pixels. The caption and the text below keep clear of the card. */
export const CARD_IMAGE_LAYOUT = {
  pad: 88,
  logo: { top: 96, width: 420 },
  pill: { height: 64, top: 90, padding: 28, size: 30 },
  caption: { baseline: 292, size: 66, min: 44 },
  card: { top: 352, bottom: 1496 },
  name: { baseline: 1622, size: 80, min: 44 },
  rating: { baseline: 1706, number: 74, unit: 36, tier: 46 },
  meta: { baseline: 1772, size: 34 },
  footer: { baseline: 1846, size: 30 },
  disc: { diameter: 124, centreY: 1640, ring: 5 },
} as const;

const WORDMARK_RATIO = 1614.8063 / 288.1029;

/** What the picture says, ready to draw; every string already translated and formatted. */
export interface CardShareImageModel {
  lang: CardLang;
  art: CardImageArt;
  caption: string;
  name: string;
  /** « 84 », « OVR » and « PRO »: the three parts of the rating line, each in its own direction. */
  rating: { number: string; unit: string; tier: string | null };
  /** « Note provisoire · J7 », present only when the number is provisional. */
  provisional: string | null;
  /** « BOT #482913 », present only when the card has a serial. */
  serial: string | null;
  season: string;
  club: { initials: string; primary: string } | null;
  footer: string;
}

export const SHARE_FOOTER = "botolago.com";

export interface CardShareImageInput {
  /** What the picture is of: the profile the card renders. */
  profile: CardProfile;
  /** The latest evaluated journée (`card.throughGameweekSeq`), named by the provisional note. */
  throughGameweekSeq: number | null;
  lang: CardLang;
  t: Translate;
  /** The renderer to draw the art with; the active one by default. */
  renderer?: CardRenderer;
}

/**
 * The model of one picture, or null when the card has no number. The art comes from the renderer
 * (`image()`), the words from the app's dictionary through `t`.
 */
export function cardShareImageModel(
  input: Omit<CardShareImageInput, "renderer"> & { renderer: CardRenderer },
): CardShareImageModel | null {
  const { profile, lang, t, renderer, throughGameweekSeq } = input;
  if (profile.ovr === null) return null;
  const strings: CardStrings = cardStrings(t, lang);
  const art = renderer.image(profile, strings);
  return {
    lang,
    art,
    caption: t("gradins.share.caption"),
    name: profile.name.trim(),
    rating: {
      number: String(profile.ovr),
      unit: strings.ovr,
      tier: profile.tier ? strings.tiers[profile.tier] : null,
    },
    provisional: profile.provisional
      ? throughGameweekSeq !== null
        ? fillText(t("card.onboarding.m6.image.provisional"), { gw: throughGameweekSeq })
        : t("card.provisional")
      : null,
    serial: profile.serial ? strings.serial(profile.serial) : null,
    season: profile.season,
    club: profile.club ? { initials: profile.club.initials, primary: profile.club.primary } : null,
    footer: SHARE_FOOTER,
  };
}

/** Everything the picture writes, for the fonts to be loaded for. */
function sampleOf(model: CardShareImageModel): string {
  return [
    model.caption,
    model.name,
    model.rating.number,
    model.rating.unit,
    model.rating.tier ?? "",
    model.provisional ?? "",
    model.serial ?? "",
    model.season,
    model.club?.initials ?? "",
    model.footer,
    ...model.art.texts.map((run) => run.text),
  ].join(" ");
}

const ARABIC = /\p{Script=Arabic}/u;

function textDir(value: string): "ltr" | "rtl" {
  return ARABIC.test(value) ? "rtl" : "ltr";
}

/** Shrinks a line until it fits `maxWidth`, down to `min` px. */
function fit(
  ctx: CanvasRenderingContext2D,
  value: string,
  face: Parameters<typeof shareFont>[0],
  weight: number,
  size: number,
  min: number,
  maxWidth: number,
): number {
  let current = size;
  ctx.font = shareFont(face, weight, current);
  while (current > min && ctx.measureText(value).width > maxWidth) {
    current -= 2;
    ctx.font = shareFont(face, weight, current);
  }
  return current;
}

interface Run {
  text: string;
  font: string;
  fill: string;
  /** The run's own direction: a number and a code read left to right inside Arabic. */
  dir: "ltr" | "rtl";
}

/**
 * Draws runs one after the other from the inline start: from the left in French, from the right
 * in Arabic, where the first run is the rightmost. Each run is drawn on its own with its own
 * direction, so a figure and a Latin code keep their order inside a right-to-left line and the
 * canvas never reorders them.
 */
function drawRuns(
  ctx: CanvasRenderingContext2D,
  runs: readonly Run[],
  start: number,
  baseline: number,
  rtl: boolean,
) {
  let cursor = start;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = rtl ? "right" : "left";
  for (const run of runs) {
    if (!run.text) continue;
    ctx.font = run.font;
    ctx.fillStyle = run.fill;
    ctx.direction = run.dir;
    const width = ctx.measureText(run.text).width;
    ctx.fillText(run.text, cursor, baseline);
    cursor += rtl ? -width : width;
  }
  ctx.restore();
}

/** The card's own text runs, drawn on the art at its drawn size. */
function drawArtText(
  ctx: CanvasRenderingContext2D,
  texts: readonly TextRun[],
  left: number,
  top: number,
  scale: number,
) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  for (const run of texts) {
    ctx.font = shareFont(run.face, run.weight, run.size * scale);
    ctx.fillStyle = run.colour;
    ctx.direction = run.dir;
    ctx.textAlign = run.anchor === "middle" ? "center" : run.anchor === "end" ? "end" : "start";
    ctx.fillText(run.text, left + run.x * scale, top + run.y * scale);
  }
  ctx.restore();
}

/** The club as a colour disc with its initials, ringed in its edge colour measured on the navy. */
function drawClubDisc(
  ctx: CanvasRenderingContext2D,
  club: { initials: string; primary: string },
  centreX: number,
  centreY: number,
  diameter: number,
  ring: number,
) {
  const colours = shareClubColours(club.primary, SHARE_PALETTE.ground);
  const r = diameter / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, r, 0, Math.PI * 2);
  ctx.fillStyle = colours.fill;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, r - ring / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring;
  ctx.strokeStyle = colours.edge;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  const size = diameter * 0.38;
  ctx.fillStyle = colours.on;
  ctx.font = shareFont("display", 800, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.direction = "ltr";
  ctx.fillText(club.initials, centreX, inkCentredBaseline(ctx, club.initials, size, centreY));
  ctx.restore();
}

function draw(
  model: CardShareImageModel,
  logo: HTMLImageElement | null,
  art: HTMLImageElement,
): Promise<Blob> {
  const { width, height } = CARD_IMAGE_SIZE;
  const L = CARD_IMAGE_LAYOUT;
  const rtl = model.lang === "ar";
  const { canvas, ctx } = canvasOf(width, height, model.lang);
  const body = bodyFace(model.lang);
  const inner = width - L.pad * 2;
  const start = rtl ? width - L.pad : L.pad;
  const align: CanvasTextAlign = rtl ? "right" : "left";

  ctx.fillStyle = SHARE_PALETTE.ground;
  ctx.fillRect(0, 0, width, height);

  // The approved wordmark, unmodified, at the inline start.
  if (logo) {
    const w = L.logo.width;
    ctx.drawImage(logo, rtl ? width - L.pad - w : L.pad, L.logo.top, w, w / WORDMARK_RATIO);
  }

  // The provisional note, at the inline end of the same row: small, present, in words.
  if (model.provisional) {
    ctx.save();
    ctx.font = shareFont(body, 800, L.pill.size);
    ctx.direction = rtl ? "rtl" : "ltr";
    const textWidth = ctx.measureText(model.provisional).width;
    const pillWidth = Math.min(inner - L.logo.width - 40, textWidth + L.pill.padding * 2);
    const pillLeft = rtl ? L.pad : width - L.pad - pillWidth;
    ctx.fillStyle = SHARE_PALETTE.panel;
    roundRect(ctx, pillLeft, L.pill.top, pillWidth, L.pill.height, L.pill.height / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SHARE_PALETTE.rulePanel;
    ctx.stroke();
    ctx.fillStyle = SHARE_PALETTE.white;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      model.provisional,
      pillLeft + pillWidth / 2,
      inkCentredBaseline(ctx, model.provisional, L.pill.size, L.pill.top + L.pill.height / 2),
      pillWidth - L.pill.padding,
    );
    ctx.restore();
  }

  // The caption, in Changa 800.
  ctx.save();
  ctx.fillStyle = SHARE_PALETTE.white;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.direction = rtl ? "rtl" : "ltr";
  fit(ctx, model.caption, "display", 800, L.caption.size, L.caption.min, inner);
  ctx.fillText(model.caption, start, L.caption.baseline, inner);
  ctx.restore();

  // The card: its art at the largest size the band allows, never wider than 760 px, with a soft
  // drop shadow under it so it hangs in front of the ground.
  const box = L.card.bottom - L.card.top;
  const scale = Math.min(1, box / model.art.height, inner / model.art.width);
  const drawnW = model.art.width * scale;
  const drawnH = model.art.height * scale;
  const left = (width - drawnW) / 2;
  const top = L.card.top + (box - drawnH) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0, 8, 28, 0.55)";
  ctx.shadowBlur = 56;
  ctx.shadowOffsetY = 26;
  ctx.drawImage(art, left, top, drawnW, drawnH);
  ctx.restore();
  drawArtText(ctx, model.art.texts, left, top, scale);

  // The club disc at the inline end of the text block, centred on the name and the rating.
  const discRoom = model.club ? L.disc.diameter + 36 : 0;
  if (model.club) {
    const centreX = rtl ? L.pad + L.disc.diameter / 2 : width - L.pad - L.disc.diameter / 2;
    drawClubDisc(ctx, model.club, centreX, L.disc.centreY, L.disc.diameter, L.disc.ring);
  }

  // The name, in Changa 800 at the inline start; shrunk to fit beside the disc, never cut.
  if (model.name) {
    ctx.save();
    ctx.fillStyle = SHARE_PALETTE.white;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.direction = textDir(model.name);
    const room = inner - discRoom;
    fit(ctx, model.name, "display", 800, L.name.size, L.name.min, room);
    ctx.fillText(model.name, start, L.name.baseline, room);
    ctx.restore();
  }

  // The rating line: « 84 OVR · PRO ». The number is a figure; the unit and the tier follow it.
  const dot = (size: number): Run => ({
    text: "  ·  ",
    font: shareFont("display", 700, size),
    fill: SHARE_PALETTE.muted,
    dir: "ltr",
  });
  drawRuns(
    ctx,
    [
      {
        text: model.rating.number,
        font: shareFont("display", 800, L.rating.number),
        fill: SHARE_PALETTE.white,
        dir: "ltr",
      },
      {
        text: ` ${model.rating.unit}`,
        font: shareFont("display", 700, L.rating.unit),
        fill: SHARE_PALETTE.muted,
        dir: "ltr",
      },
      ...(model.rating.tier
        ? [
            dot(L.rating.unit),
            {
              text: model.rating.tier,
              font: shareFont("display", 800, L.rating.tier),
              fill: SHARE_PALETTE.white,
              dir: textDir(model.rating.tier),
            },
          ]
        : []),
    ],
    start,
    L.rating.baseline,
    rtl,
  );

  // The serial (only when there is one) and the season: Latin codes, each its own run.
  const meta = (text: string, fill: string): Run => ({
    text,
    font: shareFont(body, 700, L.meta.size),
    fill,
    dir: "ltr",
  });
  drawRuns(
    ctx,
    [
      ...(model.serial
        ? [meta(model.serial, SHARE_PALETTE.muted), meta("  ·  ", SHARE_PALETTE.muted)]
        : []),
      meta(model.season, SHARE_PALETTE.muted),
    ],
    start,
    L.meta.baseline,
    rtl,
  );

  // The address, at the inline start of the foot.
  ctx.save();
  ctx.fillStyle = SHARE_PALETTE.white;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.direction = "ltr";
  ctx.font = shareFont("body", 800, L.footer.size);
  ctx.fillText(model.footer, start, L.footer.baseline, inner);
  ctx.restore();

  return toPng(canvas);
}

/** The SVG art as an image, through a Blob URL; null when the browser cannot decode it. */
async function loadArt(svg: string): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draws the picture. Throws only when the browser has no 2D canvas or cannot decode the card's
 * art (the sheet then offers the link without a picture, as the other share sheets do); a
 * wordmark that fails to load gives way to nothing.
 */
export async function renderCardShareImage(model: CardShareImageModel): Promise<Blob> {
  await loadShareFonts(model.lang, sampleOf(model));
  const [logo, art] = await Promise.all([loadImage(wordmark), loadArt(model.art.svg)]);
  if (!art) throw new Error("card_share_art");
  return await draw(model, logo, art);
}

/**
 * The picture of a card, or null when it has no number. This is the one call the share sheet
 * makes: the model from the renderer's art and the dictionary, then the canvas.
 */
export async function drawCardShareImage(input: CardShareImageInput): Promise<Blob | null> {
  const renderer = input.renderer ?? (await activeRenderer.load());
  const model = cardShareImageModel({ ...input, renderer });
  if (!model) return null;
  return await renderCardShareImage(model);
}
