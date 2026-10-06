import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import type { PepitesEdition, PepitesPlayerCard } from "@/backend/pepites/contracts";
import { renderRecapImage, type RecapImageModel } from "@/components/fantasy/recap-image";
import { contrastRatio, parseHex } from "@/lib/colour";

import {
  renderShareImage,
  renderStoryImage,
  SHARE_PALETTE,
  shareClubColours,
  shareImageModel,
  sliceAngles,
  storyModel,
} from "./share-image";

/**
 * The share pictures on the main design (BG-0153): what they paint, in
 * which faces, and that Arabic mirrors French. The pictures are drawn on a
 * canvas, so each one is drawn here on a recording stand-in for the 2D
 * context, which keeps every text, rectangle, path fill and image in device
 * pixels with the colour, font, alignment and letter-spacing it was drawn
 * with.
 */

/* ------------------------------------------------------- recording canvas */

type Paint = string | Gradient;

class Gradient {
  readonly stops: [number, string][] = [];
  addColorStop(offset: number, colour: string) {
    this.stops.push([offset, colour]);
  }
}

interface Op {
  kind: "text" | "rect" | "fill" | "stroke" | "image";
  text?: string;
  /** The device-pixel horizontal extent of what was drawn. */
  left: number;
  right: number;
  /** For text: the anchor, the alignment and the width the alignment applies to. */
  anchor?: number;
  align?: string;
  paint?: Paint;
  font?: string;
  letterSpacing?: string;
}

interface State {
  font: string;
  fillStyle: Paint;
  strokeStyle: Paint;
  textAlign: string;
  textBaseline: string;
  direction: string;
  lineWidth: number;
  globalAlpha: number;
  letterSpacing: string;
  matrix: [number, number, number, number, number, number];
}

const fontSize = (font: string) => Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
/** A deterministic width: the same text in the same font measures the same in both languages. */
const measure = (value: string, font: string) => [...value].length * fontSize(font) * 0.55;

function recordingContext() {
  const ops: Op[] = [];
  const gradients: Gradient[] = [];
  let state: State = {
    font: "10px sans-serif",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "ltr",
    lineWidth: 1,
    globalAlpha: 1,
    letterSpacing: "0px",
    matrix: [1, 0, 0, 1, 0, 0],
  };
  const stack: State[] = [];
  let path: number[] = [];
  const x = (px: number, py: number) => {
    const [a, , c, , e] = state.matrix;
    return a * px + c * py + e;
  };
  const scale = () => state.matrix[0];
  const ctx = {
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: Paint) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: Paint) {
      state.strokeStyle = value;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(value: string) {
      state.textAlign = value;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    set textBaseline(value: string) {
      state.textBaseline = value;
    },
    get direction() {
      return state.direction;
    },
    set direction(value: string) {
      state.direction = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    get letterSpacing() {
      return state.letterSpacing;
    },
    set letterSpacing(value: string) {
      state.letterSpacing = value;
    },
    save() {
      stack.push({ ...state, matrix: [...state.matrix] as State["matrix"] });
    },
    restore() {
      state = stack.pop() ?? state;
    },
    scale(sx: number, sy: number) {
      const [a, b, c, d, e, f] = state.matrix;
      state.matrix = [a * sx, b * sx, c * sy, d * sy, e, f];
    },
    translate(tx: number, ty: number) {
      const [a, b, c, d, e, f] = state.matrix;
      state.matrix = [a, b, c, d, e + a * tx + c * ty, f + b * tx + d * ty];
    },
    transform() {
      throw new Error("no skew or slant on the share pictures");
    },
    beginPath() {
      path = [];
    },
    moveTo(px: number, py: number) {
      path.push(x(px, py));
    },
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      path.push(x(x1, y1), x(x2, y2));
    },
    arc(cx: number, cy: number, r: number) {
      path.push(x(cx - r, cy), x(cx + r, cy));
    },
    closePath() {},
    clip() {},
    fill() {
      ops.push({
        kind: "fill",
        left: Math.min(...path),
        right: Math.max(...path),
        paint: state.fillStyle,
      });
    },
    stroke() {
      ops.push({
        kind: "stroke",
        left: Math.min(...path),
        right: Math.max(...path),
        paint: state.strokeStyle,
      });
    },
    fillRect(px: number, py: number, w: number) {
      const a = x(px, py);
      const b = x(px + w, py);
      ops.push({
        kind: "rect",
        left: Math.min(a, b),
        right: Math.max(a, b),
        paint: state.fillStyle,
      });
    },
    fillText(value: string, px: number, py: number, maxWidth?: number) {
      const anchor = x(px, py);
      const w = Math.min(measure(value, state.font), maxWidth ?? Infinity) * scale();
      const align = state.textAlign;
      const left = align === "right" ? anchor - w : align === "center" ? anchor - w / 2 : anchor;
      ops.push({
        kind: "text",
        text: value,
        left,
        right: left + w,
        anchor,
        align,
        paint: state.fillStyle,
        font: state.font,
        letterSpacing: state.letterSpacing,
      });
    },
    strokeText() {
      throw new Error("no outlined text on the share pictures");
    },
    measureText(value: string) {
      return { width: measure(value, state.font) };
    },
    drawImage(_image: unknown, ...args: number[]) {
      const [dx, dy, dw] = args.length >= 8 ? args.slice(4) : args;
      const a = x(dx!, dy!);
      const b = x(dx! + dw!, dy!);
      ops.push({ kind: "image", left: Math.min(a, b), right: Math.max(a, b) });
    },
    createLinearGradient() {
      const gradient = new Gradient();
      gradients.push(gradient);
      return gradient;
    },
    createRadialGradient() {
      const gradient = new Gradient();
      gradients.push(gradient);
      return gradient;
    },
  };
  return { ctx, ops, gradients };
}

type Recording = ReturnType<typeof recordingContext>;

/** Swaps in a recording canvas and an `Image` that loads unless its URL says "broken". */
let restore: (() => void) | null = null;
let recordings: Recording[] = [];

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, Image: g.Image };
  recordings = [];
  g.document = {
    createElement: () => {
      const recording = recordingContext();
      recordings.push(recording);
      return {
        width: 0,
        height: 0,
        getContext: () => recording.ctx,
        toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"], { type: "image/png" })),
      };
    },
  };
  g.Image = class {
    crossOrigin = "";
    naturalWidth = 400;
    naturalHeight = 300;
    width = 400;
    height = 300;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      queueMicrotask(() => (url.includes("broken") ? this.onerror?.() : this.onload?.()));
    }
  };
  restore = () => {
    g.document = saved.document;
    g.Image = saved.Image;
  };
});

afterEach(() => restore?.());

/* --------------------------------------------------------------- fixtures */

const KITS = ["Wydad AC", "Raja CA", "AS FAR Rabat", "FUS Rabat", "Renaissance Zemamra"];

function card(n: number, photo = false): PepitesPlayerCard {
  return {
    id: `7e500000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: n === 3 ? "Achraf" : `Joueur Numéro ${n}`,
    positionGroup: "MID",
    age: 20,
    team: {
      id: `7e600000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      name: { fr: KITS[n % KITS.length]!, ar: "النادي" },
      shortName: { fr: "CLB", ar: "ن" },
    },
    score: 90 - n,
    rank: n,
    photo: photo
      ? {
          assetId: "7e700000-0000-4000-8000-000000000001",
          storagePath: `football/players/p${n}.webp`,
          scope: "in_app_and_social",
        }
      : null,
  };
}

const edition: Pick<PepitesEdition, "week" | "status" | "entries"> = {
  week: 16,
  status: "published",
  entries: Array.from({ length: 10 }, (_, index) => ({
    rank: index + 1,
    computedRank: index + 1,
    score: 88.4 - index * 4.7,
    reasonFr: null,
    reasonAr: null,
    movement: null,
    player: card(index + 1, index === 0),
  })),
};

/** The same strings in both languages, so a mirrored layout is an exact mirror. */
const COPY = {
  brand: "Pepites",
  kicker: "U23 BOTOLA PRO",
  title: "TOP 10",
  subtitle: "SEMAINE {n} RISING SCORE",
  footer: "botolago.com/pepites",
  legend: "Note forme contribution",
  club: (player: PepitesPlayerCard) => player.team?.name.fr.toUpperCase() ?? "",
  position: () => "MIL",
};

const STORY_COPY = {
  brand: "Pepites",
  kicker: "U23 BOTOLA PRO",
  meta: "WYDAD AC ATTAQUANT",
  legend: ["Note", "Forme", "Contribution", "Progression", "Temps"],
  rankLine: "N°{n} RISING SCORE",
  statsLine: "{minutes} MIN NOTE {rating}",
  footer: "botolago.com/pepites",
};

const SCORE = {
  score: 70.4,
  rank: 5,
  minutes: 1159,
  ratingAvg: 6.6,
  percentiles: { rating: 65, form: 77, contribution: 90, progression: 62, minutes: null },
};

function recapModel(lang: "fr" | "ar"): RecapImageModel {
  return {
    lang,
    kicker: "Ma journee BotolaGO",
    heading: "Journee 9 Resultat final",
    teamName: "Les Lions FC",
    total: "67",
    unit: "pts",
    lines: ["Capitaine ⁨Rahimi⁩ : ⁦8 × 2 = 16⁩ pts", "Transferts : ⁦−4⁩ pts"],
    footer: "botolago.com Fantasy",
  };
}

type Picture = "post" | "story" | "recap";

/** Draws one picture in one language and returns everything it painted. */
async function draw(picture: Picture, lang: "fr" | "ar"): Promise<Recording> {
  recordings = [];
  if (picture === "post") {
    const model = shareImageModel(edition, lang, COPY)!;
    // A stand-in photo for the leader, so the photo path is drawn too.
    await renderShareImage({
      ...model,
      rows: model.rows.map((row, index) =>
        index === 0 ? { ...row, photoUrl: "photo.webp" } : row,
      ),
    });
  } else if (picture === "story") {
    await renderStoryImage(storyModel(card(1), SCORE, lang, STORY_COPY));
  } else {
    await renderRecapImage(recapModel(lang));
  }
  return recordings.at(-1)!;
}

/** Every club colour the fixtures can paint, through the club palette, on either navy. */
const CLUB_COLOURS = new Set(
  [
    ...shareImageModel(edition, "fr", COPY)!.rows.map((row) => row.club),
    storyModel(card(1), SCORE, "fr", STORY_COPY).club,
  ].flatMap((base) =>
    [SHARE_PALETTE.panel, SHARE_PALETTE.ground].flatMap((surface) =>
      Object.values(shareClubColours(base, surface)),
    ),
  ),
);

/** Every kit primary the kit table can hand the pictures. */
const KIT_PRIMARIES = [
  ...new Set(
    [...readFileSync("src/lib/kits.ts", "utf8").matchAll(/primary: "(#[0-9a-f]{6})"/g)].map(
      (match) => match[1]!,
    ),
  ),
];

const contrast = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);
const PALETTE = new Set<string>(Object.values(SHARE_PALETTE));

function hueAndSaturation(hex: string): [number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60;
  return [h, s];
}

/** Violet or purple: a hue between 240° and 330° that is not close to grey. */
const isViolet = (hex: string) => {
  const [h, s] = hueAndSaturation(hex);
  return h >= 240 && h <= 330 && s > 0.25;
};

const PICTURES: Picture[] = ["post", "story", "recap"];

/* ------------------------------------------------------------------ tests */

describe("the share pictures' palette", () => {
  it("the palette is the kit's navies, white, the muted foreground and the gradient's two stops", () => {
    expect(SHARE_PALETTE).toEqual({
      ground: "#001c49",
      panel: "#0c3164",
      white: "#ffffff",
      muted: "#cad2dd",
      spring: "#60fa97",
      sky: "#73edfa",
      rulePanel: "#2c4d79",
      ruleGround: "#223b62",
    });
    for (const colour of PALETTE) {
      expect(colour).not.toBe("#070d24");
      expect(isViolet(colour)).toBe(false);
    }
    // The test itself catches the retired colours.
    for (const old of ["#7c6cf0", "#8b6cf6"]) expect(isViolet(old)).toBe(true);
  });

  for (const picture of PICTURES) {
    for (const lang of ["fr", "ar"] as const) {
      it(`${picture} (${lang}) paints only the palette and the clubs' own colours`, async () => {
        const { ops, gradients } = await draw(picture, lang);
        expect(ops.length).toBeGreaterThan(10);
        for (const op of ops) {
          if (op.paint === undefined) continue;
          if (op.paint instanceof Gradient) continue;
          const colour = op.paint.toLowerCase();
          expect(PALETTE.has(colour) || CLUB_COLOURS.has(colour)).toBe(true);
          expect(colour).not.toBe("#070d24");
          expect(isViolet(colour)).toBe(false);
        }
        // The action gradient, once, from Fresh Turf to Matchday Sky, never a text colour.
        expect(gradients).toHaveLength(1);
        expect(gradients[0]!.stops).toEqual([
          [0, SHARE_PALETTE.spring],
          [1, SHARE_PALETTE.sky],
        ]);
        expect(ops.filter((op) => op.kind === "text" && op.paint instanceof Gradient)).toEqual([]);
      });
    }
  }

  it("text on the gradient is Tunnel Navy", async () => {
    const post = await draw("post", "fr");
    expect(post.ops.find((op) => op.text === "SEMAINE 16 RISING SCORE")?.paint).toBe(
      SHARE_PALETTE.ground,
    );
    const recap = await draw("recap", "fr");
    for (const value of ["67", "pts"]) {
      expect(recap.ops.find((op) => op.text === value)?.paint).toBe(SHARE_PALETTE.ground);
    }
  });

  it("a club disc takes the club palette's colours; its ring and edge clear 3:1 on the navy they are drawn on", () => {
    // Wydad's red keeps its fill and white initials; its edge is lifted until
    // it clears 3:1 on each navy (the palette's own dark edge, #ca1c32,
    // measures 2.27:1 on the panel).
    expect(shareClubColours("#c8102e", SHARE_PALETTE.panel)).toEqual({
      fill: "#c8102e",
      on: "#ffffff",
      edge: "#d64a4f",
    });
    expect(shareClubColours("#c8102e", SHARE_PALETTE.ground).edge).toBe("#cc2536");
    // A white kit takes Tunnel Navy initials and keeps a white edge.
    expect(shareClubColours("#ffffff", SHARE_PALETTE.panel)).toEqual({
      fill: "#ffffff",
      on: SHARE_PALETTE.ground,
      edge: "#ffffff",
    });
    // A navy kit's ring is lifted off each navy.
    expect(shareClubColours("#1a3a7a", SHARE_PALETTE.panel).edge).toBe("#647daa");
    expect(shareClubColours("#1a3a7a", SHARE_PALETTE.ground).edge).toBe("#4e6a9d");
    // Every kit in the table, on both navies (WCAG 1.4.11).
    expect(KIT_PRIMARIES.length).toBeGreaterThan(10);
    for (const primary of KIT_PRIMARIES) {
      for (const surface of [SHARE_PALETTE.panel, SHARE_PALETTE.ground]) {
        expect(contrast(shareClubColours(primary, surface).edge, surface)).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  it("the post measures its edges against the panel, the story against the ground", async () => {
    const model = shareImageModel(edition, "fr", COPY)!;
    const post = await draw("post", "fr");
    const panelEdges = new Set(
      model.rows.map((row) => shareClubColours(row.club, SHARE_PALETTE.panel).edge),
    );
    // Ten edge bars (11px wide at the panel's inline start) and ten rings,
    // all in the panel's edge colours.
    const bars = post.ops.filter((op) => op.kind === "rect" && op.left === 40 && op.right === 51);
    expect(bars).toHaveLength(10);
    for (const bar of bars) expect(panelEdges.has(bar.paint as string)).toBe(true);
    const rings = post.ops.filter((op) => op.kind === "stroke");
    expect(rings).toHaveLength(10);
    for (const ring of rings) expect(panelEdges.has(ring.paint as string)).toBe(true);

    const story = await draw("story", "fr");
    const edge = shareClubColours(
      storyModel(card(1), SCORE, "fr", STORY_COPY).club,
      SHARE_PALETTE.ground,
    ).edge;
    // The stripe down the inline-start edge (4 card units, about 11px).
    const stripe = story.ops.filter((op) => op.kind === "rect" && op.left === 0 && op.right < 12);
    expect(stripe.map((op) => op.paint)).toEqual([edge]);
    expect(story.ops.filter((op) => op.kind === "stroke" && op.paint === edge)).toHaveLength(1);
  });
});

describe("the share pictures' faces", () => {
  for (const picture of PICTURES) {
    for (const lang of ["fr", "ar"] as const) {
      it(`${picture} (${lang}): Changa at most 800, no mono, Noto Sans Arabic for Arabic body text`, async () => {
        const { ops } = await draw(picture, lang);
        const fonts = ops.filter((op) => op.kind === "text").map((op) => op.font!);
        expect(fonts.length).toBeGreaterThan(3);
        for (const font of fonts) {
          expect(font).not.toMatch(/plex|mono/i);
          const [, weight, family] = /^(\d+) [\d.]+px "([^"]+)"/.exec(font) ?? [];
          expect(["Changa", "Manrope", "Noto Sans Arabic"]).toContain(family);
          if (family === "Changa") expect(Number(weight)).toBeLessThanOrEqual(800);
        }
        const bodyFamilies = new Set(
          fonts
            .filter((font) => !font.includes('px "Changa"'))
            .map((font) => /"([^"]+)"/.exec(font)![1]),
        );
        if (lang === "ar") expect(bodyFamilies.has("Noto Sans Arabic")).toBe(true);
        else expect(bodyFamilies).toEqual(new Set(["Manrope"]));
      });

      it(`${picture} (${lang}): letter-spacing in French only`, async () => {
        const { ops } = await draw(picture, lang);
        const spaced = ops.filter((op) => op.kind === "text" && op.letterSpacing !== "0px");
        if (lang === "ar") expect(spaced).toEqual([]);
        else if (picture !== "recap") expect(spaced.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("the share pictures mirror in Arabic", () => {
  const W = 1080;
  const flip: Record<string, string> = { left: "right", right: "left", center: "center" };

  /**
   * The Arabic drawing is the French one reflected across the vertical axis:
   * every shape's extent, and every text's extent or its anchor with the
   * alignment turned round (a title is set a size smaller in Arabic).
   */
  function expectMirrored(fr: Op[], ar: Op[]) {
    expect(ar.length).toBe(fr.length);
    fr.forEach((a, index) => {
      const b = ar[index]!;
      expect(b.kind).toBe(a.kind);
      const boxMirrors =
        Math.abs(b.left - (W - a.right)) < 0.01 && Math.abs(b.right - (W - a.left)) < 0.01;
      const anchorMirrors =
        a.kind === "text" &&
        Math.abs(b.anchor! - (W - a.anchor!)) < 0.01 &&
        b.align === flip[a.align!];
      if (!boxMirrors && !anchorMirrors) {
        throw new Error(
          `op ${index} (${a.kind} ${a.text ?? ""}) does not mirror: fr ${a.left}–${a.right}, ar ${b.left}–${b.right}`,
        );
      }
    });
  }

  it("the Top 10 post", async () => {
    const fr = await draw("post", "fr");
    const ar = await draw("post", "ar");
    expectMirrored(fr.ops, ar.ops);
    // The kicker and the scores sit at the inline end: right in French, left in Arabic.
    const kicker = (ops: Op[]) => ops.find((op) => op.text === "U23 BOTOLA PRO")!;
    expect(kicker(fr.ops).right).toBeGreaterThan(900);
    expect(kicker(ar.ops).left).toBeLessThan(180);
  });

  it("the story card", async () => {
    const fr = await draw("story", "fr");
    const ar = await draw("story", "ar");
    expectMirrored(fr.ops, ar.ops);
  });

  it("the recap, its Arabic factual lines drawn run by run from the right", async () => {
    const fr = await draw("recap", "fr");
    const ar = await draw("recap", "ar");
    // Everything but the factual lines mirrors; French draws each line as one
    // string and Arabic draws its runs one by one.
    expectMirrored(
      fr.ops.filter((op) => op.kind !== "text"),
      ar.ops.filter((op) => op.kind !== "text"),
    );
    for (const value of [
      "Ma journee BotolaGO",
      "Journee 9 Resultat final",
      "Les Lions FC",
      "67",
      "pts",
      "botolago.com Fantasy",
    ]) {
      expectMirrored(
        [fr.ops.find((op) => op.text === value)!],
        [ar.ops.find((op) => op.text === value)!],
      );
    }
    // The sum and the signed figure are each one left-to-right run, marked
    // LRM, and each run sits to the left of the run read before it.
    const runs = ar.ops.filter((op) => op.kind === "text" && /^[‎‏]/.test(op.text!));
    const sum = runs.find((op) => op.text === "‎8 × 2 = 16")!;
    const minus = runs.find((op) => op.text === "‎−4")!;
    expect(sum).toBeDefined();
    expect(minus).toBeDefined();
    for (let index = 1; index < runs.length; index += 1) {
      const sameLine = runs[index]!.anchor! < runs[index - 1]!.anchor!;
      if (sameLine) expect(runs[index]!.right).toBeLessThanOrEqual(runs[index - 1]!.left + 0.01);
    }
  });

  it("the wheel runs counter-clockwise in Arabic: each slice is the French one reflected", () => {
    for (let index = 0; index < 5; index += 1) {
      const [from, to] = sliceAngles(index, false);
      const [arFrom, arTo] = sliceAngles(index, true);
      expect(arFrom).toBeCloseTo(Math.PI - to, 10);
      expect(arTo).toBeCloseTo(Math.PI - from, 10);
      // The French wheel starts at twelve o'clock and turns clockwise.
      expect(from).toBeCloseTo(-Math.PI / 2 + (index * 2 * Math.PI) / 5 + 0.05, 10);
    }
  });
});

describe("the story's figures", () => {
  it("the French stats line keeps a visible group separator", async () => {
    // The model keeps formatCount's narrow no-break space; Manrope sets it at
    // 0.1em, so the canvas draws a no-break space (0.2em) in its place.
    const model = storyModel(card(1), SCORE, "fr", STORY_COPY);
    expect(model.statsLine).toBe("1\u202f159 MIN NOTE 6,60");
    const { ops } = await draw("story", "fr");
    const stats = ops.find((op) => op.kind === "text" && op.text!.endsWith("MIN NOTE 6,60"));
    expect(stats?.text).toBe("1\u00a0159 MIN NOTE 6,60");
    expect(ops.some((op) => op.kind === "text" && op.text!.includes("\u202f"))).toBe(false);
  });
});

describe("the share pictures keep their fallbacks", () => {
  it("a photo that fails to load gives way to the club disc and initials", async () => {
    const model = shareImageModel(edition, "fr", COPY)!;
    await renderShareImage({
      ...model,
      rows: model.rows.map((row, index) =>
        index === 0 ? { ...row, photoUrl: "broken.webp" } : row,
      ),
    });
    const { ops } = recordings.at(-1)!;
    // The wordmark is the only image; the leader's initials are drawn instead.
    expect(ops.filter((op) => op.kind === "image")).toHaveLength(1);
    expect(ops.some((op) => op.kind === "text" && op.text === model.rows[0]!.initials)).toBe(true);
  });

  it("a canvas a photo would taint is drawn again without photos", async () => {
    const model = shareImageModel(edition, "fr", COPY)!;
    let first = true;
    const g = globalThis as Record<string, unknown>;
    const create = (g.document as { createElement: () => { toBlob: unknown } }).createElement;
    g.document = {
      createElement: () => {
        const canvas = create();
        if (first) {
          first = false;
          canvas.toBlob = () => {
            throw new Error("SecurityError: tainted");
          };
        }
        return canvas;
      },
    };
    const blob = await renderShareImage({
      ...model,
      rows: model.rows.map((row, index) =>
        index === 0 ? { ...row, photoUrl: "photo.webp" } : row,
      ),
    });
    expect(blob.type).toBe("image/png");
    expect(recordings).toHaveLength(2);
    // The second drawing carries the wordmark and no photo.
    expect(recordings[1]!.ops.filter((op) => op.kind === "image")).toHaveLength(1);
  });
});
