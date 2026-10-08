import { contrastRatio, parseHex } from "@/lib/colour";

import { cardLabel } from "./copy";
import type { CardImageArt, CardRenderer, RenderOptions, TextRun, TokenOptions } from "./renderer";
import type { BeatName, CardProfile, CardStrings, TokenSize } from "./types";

/**
 * The plain renderer (plan section 6.1): a small, fast stand-in for a card direction. A rounded
 * rectangle in the club colour, the number or a dash, the name, the tier word. It is what the
 * unit tests render and what `active-renderer.ts` serves until the Écharpe port (WP2) replaces
 * it. It follows the full contract: one root element with `role="img"`, an escaped label, no
 * animation (`beats` is empty), a text-free `image()`.
 *
 * Every attribute and text node goes through `esc`; nothing else reaches the output.
 */
const WIDTH = 240;
const HEIGHT = 360;
const NEUTRAL = "#5a667d";
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111827";

/** Control characters and the bidi overrides and embeddings, which no name may carry into a card. */
function stripControls(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const hidden =
      code < 0x20 ||
      code === 0x7f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    if (!hidden) out += ch;
  }
  return out;
}

export function esc(value: unknown): string {
  return stripControls(String(value))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** White or near-black text, whichever reads better on the colour (WCAG contrast). */
function inkOn(background: string): string {
  const fill = parseHex(background);
  if (!fill) return LIGHT_TEXT;
  const light = contrastRatio(fill, parseHex(LIGHT_TEXT)!);
  const dark = contrastRatio(fill, parseHex(DARK_TEXT)!);
  return light >= dark ? LIGHT_TEXT : DARK_TEXT;
}

function ground(profile: CardProfile): string {
  return profile.club?.primary ?? NEUTRAL;
}

const dashOr = (ovr: number | null): string => (ovr === null ? "–" : String(ovr));

function fullText(profile: CardProfile, strings: CardStrings): TextRun[] {
  const colour = inkOn(ground(profile));
  const dir = strings.lang === "ar" ? "rtl" : "ltr";
  const mid = WIDTH / 2;
  const runs: TextRun[] = [
    {
      text: dashOr(profile.ovr),
      x: mid,
      y: 140,
      size: 84,
      weight: 800,
      face: "display",
      anchor: "middle",
      dir: "ltr",
      colour,
    },
  ];
  if (profile.tier) {
    runs.push({
      text: strings.tiers[profile.tier],
      x: mid,
      y: 176,
      size: 20,
      weight: 800,
      face: strings.lang === "ar" ? "arabic" : "display",
      anchor: "middle",
      dir,
      colour,
    });
  }
  if (profile.name.trim()) {
    runs.push({
      text: profile.name.trim().slice(0, 24),
      x: mid,
      y: 290,
      size: 22,
      weight: 800,
      face: strings.lang === "ar" ? "arabic" : "display",
      anchor: "middle",
      dir: "ltr",
      colour,
    });
  }
  if (profile.serial !== null) {
    runs.push({
      text: strings.serial(profile.serial),
      x: mid,
      y: 328,
      size: 13,
      weight: 600,
      face: "body",
      anchor: "middle",
      dir: "ltr",
      colour,
    });
  }
  if (profile.founder !== null) {
    runs.push({
      text: `·${String(profile.founder).slice(-2)}`,
      x: mid,
      y: 310,
      size: 14,
      weight: 700,
      face: "body",
      anchor: "middle",
      dir: "ltr",
      colour,
    });
  }
  if (profile.sample) {
    runs.push({
      text: strings.sample,
      x: mid,
      y: 36,
      size: 12,
      weight: 600,
      face: strings.lang === "ar" ? "arabic" : "body",
      anchor: "middle",
      dir,
      colour,
    });
  }
  return runs;
}

function textElement(run: TextRun): string {
  const anchor = run.anchor === "middle" ? "middle" : run.anchor === "end" ? "end" : "start";
  return (
    `<text x="${run.x}" y="${run.y}" font-size="${run.size}" font-weight="${run.weight}" ` +
    `text-anchor="${anchor}" fill="${esc(run.colour)}" direction="${run.dir}">${esc(run.text)}</text>`
  );
}

function body(profile: CardProfile, strings: CardStrings, withText: boolean): string {
  const colour = inkOn(ground(profile));
  const marks =
    profile.counted !== null && profile.minRated !== null && profile.ovr === null
      ? Array.from({ length: profile.minRated }, (_, index) => {
          const filled = index < (profile.counted ?? 0);
          const x = WIDTH / 2 - (profile.minRated! * 18) / 2 + index * 18;
          return `<rect x="${x}" y="212" width="14" height="6" rx="2" fill="${esc(colour)}" opacity="${filled ? 1 : 0.35}"/>`;
        }).join("")
      : "";
  return (
    `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="24" fill="${esc(ground(profile))}"/>` +
    marks +
    (withText ? fullText(profile, strings).map(textElement).join("") : "")
  );
}

function root(label: string, lang: "fr" | "ar", inner: string, width: number, height: number) {
  return (
    `<div class="mc-plain" role="img" aria-label="${esc(label)}" dir="${lang === "ar" ? "rtl" : "ltr"}" ` +
    `style="display:block;width:100%">` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" ` +
    `style="display:block;height:auto" aria-hidden="true" focusable="false">${inner}</svg></div>`
  );
}

function tokenSvg(profile: CardProfile, options: TokenOptions): string {
  const { size, strings } = options;
  const showNumber = size >= 44;
  const colour = inkOn(ground(profile));
  const inner =
    `<rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size / 4)}" fill="${esc(ground(profile))}"/>` +
    (showNumber
      ? `<text x="${size / 2}" y="${Math.round(size * 0.66)}" font-size="${Math.round(size * 0.42)}" font-weight="800" text-anchor="middle" fill="${esc(colour)}">${esc(dashOr(profile.ovr))}</text>`
      : "");
  return root(cardLabel(profile, strings), strings.lang, inner, size, size);
}

const BEATS: readonly BeatName[] = [];

export const plainRenderer: CardRenderer = {
  id: "plain-v1",
  beats: BEATS,
  full(profile: CardProfile, options: RenderOptions): string {
    return root(
      cardLabel(profile, options.strings),
      options.strings.lang,
      body(profile, options.strings, true),
      WIDTH,
      HEIGHT,
    );
  },
  token(profile: CardProfile, options: TokenOptions): string {
    return tokenSvg(profile, options);
  },
  aspect(): number {
    return HEIGHT / WIDTH;
  },
  tokenBox(_profile: CardProfile, size: TokenSize) {
    return { width: size, height: size };
  },
  detail(profile: CardProfile, part: "founder", options: RenderOptions): string | null {
    if (part !== "founder" || profile.founder === null) return null;
    const colour = inkOn(ground(profile));
    const inner =
      `<rect x="0" y="0" width="${WIDTH}" height="80" rx="16" fill="${esc(ground(profile))}"/>` +
      textElement({
        text: `${options.strings.founderLine}`,
        x: WIDTH / 2,
        y: 48,
        size: 20,
        weight: 800,
        face: "display",
        anchor: "middle",
        dir: options.strings.lang === "ar" ? "rtl" : "ltr",
        colour,
      });
    return root(options.strings.founderLine, options.strings.lang, inner, WIDTH, 80);
  },
  image(profile: CardProfile, strings: CardStrings): CardImageArt {
    // The share image's art at 760 px wide: the shape with no text, and the runs it would have drawn.
    const scale = 760 / WIDTH;
    const texts = fullText(profile, strings).map((run) => ({
      ...run,
      x: run.x * scale,
      y: run.y * scale,
      size: run.size * scale,
    }));
    return {
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${HEIGHT * scale}" width="760" height="${HEIGHT * scale}">` +
        `<g transform="scale(${scale})">${body(profile, strings, false)}</g></svg>`,
      width: 760,
      height: HEIGHT * scale,
      texts,
    };
  },
  label(profile: CardProfile, strings: CardStrings): string {
    return cardLabel(profile, strings);
  },
  beatMs(): number {
    return 0;
  },
};
