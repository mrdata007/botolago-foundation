import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";
import { SHARE_PALETTE } from "@/components/pepites/share-image";
import { contrastRatio, parseHex } from "@/lib/colour";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { eclatRenderer } from "../eclat";
import { plainRenderer } from "../plain-renderer";
import { fromMyCard } from "../to-profile";
import type { CardProfile } from "../types";
import {
  CARD_IMAGE_LAYOUT,
  CARD_IMAGE_SIZE,
  cardShareImageModel,
  drawCardShareImage,
  renderCardShareImage,
} from "./card-share-image";
import { recordingContext, type Op, type Recording } from "./card-share-image.test-support";

/**
 * The card's share picture (plan 4.7 and 6.7), drawn on a recording stand-in for the 2D canvas
 * (the way `src/components/pepites/share-image.draw.test.ts` draws the Pépites pictures): what it
 * paints, in which faces, where, and that Arabic is the French picture mirrored.
 */

let restore: (() => void) | null = null;
let recordings: Recording[] = [];
let canvases: { width: number; height: number }[] = [];

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, Image: g.Image };
  recordings = [];
  canvases = [];
  g.document = {
    createElement: () => {
      const recording = recordingContext();
      recordings.push(recording);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => recording.ctx,
        toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"], { type: "image/png" })),
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  g.Image = class {
    crossOrigin = "";
    naturalWidth = 760;
    naturalHeight = 1166;
    width = 760;
    height = 1166;
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

const dict = (lang: Language) => (key: TranslationKey) => dictionaries[lang][key];

function profileOf(
  id: FixtureId,
  over: Partial<CardProfile> = {},
): { profile: CardProfile; card: MyCardDto } {
  const card = FIXTURES[id].card!;
  return { profile: { ...fromMyCard(card), ...over }, card };
}

async function draw(
  id: FixtureId,
  lang: Language,
  over: Partial<CardProfile> = {},
): Promise<{ ops: Op[]; model: NonNullable<ReturnType<typeof cardShareImageModel>> }> {
  const { profile, card } = profileOf(id, over);
  recordings = [];
  const model = cardShareImageModel({
    profile,
    throughGameweekSeq: card.throughGameweekSeq,
    lang,
    t: dict(lang),
    renderer: eclatRenderer,
  })!;
  await renderCardShareImage(model);
  return { ops: recordings.at(-1)!.ops, model };
}

const W = CARD_IMAGE_SIZE.width;
const L = CARD_IMAGE_LAYOUT;
const texts = (ops: Op[]) => ops.filter((op) => op.kind === "text");
const outsideCard = (ops: Op[]) => {
  const art = ops.find((op) => op.kind === "image" && op.shadowBlur);
  return texts(ops).filter((op) => !art || op.baseline! < art.top || op.baseline! > art.bottom);
};
const find = (ops: Op[], text: string) => texts(ops).find((op) => op.text === text);
const contrast = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

describe("the picture", () => {
  it("is 1080 × 1920 on Tunnel Navy, filled first", async () => {
    const { ops } = await draw("rated", "fr");
    expect(canvases.at(-1)).toMatchObject({ width: 1080, height: 1920 });
    expect(ops[0]).toMatchObject({
      kind: "rect",
      left: 0,
      top: 0,
      right: 1080,
      bottom: 1920,
      paint: SHARE_PALETTE.ground,
    });
  });

  it("draws the wordmark and the card's art, and nothing else as an image: no crest, no photo", async () => {
    const { ops } = await draw("rated", "fr");
    const images = ops.filter((op) => op.kind === "image");
    expect(images).toHaveLength(2);
    const [logo, art] = images as [Op, Op];
    expect(logo.right - logo.left).toBe(L.logo.width);
    // The card, hanging in front of the ground on a soft shadow.
    expect(art.shadowBlur).toBeGreaterThan(0);
    expect(art.right - art.left).toBeLessThanOrEqual(760);
  });

  it("draws no card art at all when the art cannot be decoded, and says so by throwing", async () => {
    const { profile, card } = profileOf("rated");
    const model = cardShareImageModel({
      profile,
      throughGameweekSeq: card.throughGameweekSeq,
      lang: "fr",
      t: dict("fr"),
      renderer: eclatRenderer,
    })!;
    model.art = { ...model.art, svg: "<svg broken/>" };
    // The fake Image fails on a URL containing "broken"; a Blob URL does not, so simulate the failure.
    const g = globalThis as Record<string, unknown>;
    const Original = g.Image as new () => { src: string };
    g.Image = class extends Original {
      override set src(_url: string) {
        queueMicrotask(() => (this as unknown as { onerror?: () => void }).onerror?.());
      }
    };
    await expect(renderCardShareImage(model)).rejects.toThrow("card_share_art");
  });

  it("is nothing for a card with no number", async () => {
    for (const id of ["born0", "forming1", "eve2", "insufficient3"] as const) {
      const { profile, card } = profileOf(id);
      expect(profile.ovr).toBeNull();
      const blob = await drawCardShareImage({
        profile,
        throughGameweekSeq: card.throughGameweekSeq,
        lang: "fr",
        t: dict("fr"),
        renderer: eclatRenderer,
      });
      expect(blob).toBeNull();
    }
  });

  it("returns a PNG for a rated card", async () => {
    const { profile, card } = profileOf("rated");
    const blob = await drawCardShareImage({
      profile,
      throughGameweekSeq: card.throughGameweekSeq,
      lang: "fr",
      t: dict("fr"),
      renderer: plainRenderer,
    });
    expect(blob?.type).toBe("image/png");
  });
});

describe("what it says", () => {
  it("a provisional number carries « Note provisoire · J7 » / «تقييم مبدئي · الجولة 7», in words", async () => {
    const fr = await draw("rated", "fr");
    expect(fr.model.provisional).toBe("Note provisoire · J7");
    expect(find(fr.ops, "Note provisoire · J7")).toBeDefined();
    const ar = await draw("rated", "ar");
    expect(ar.model.provisional).toContain("تقييم مبدئي");
    expect(ar.model.provisional).toContain("7");
    expect(find(ar.ops, ar.model.provisional!)).toBeDefined();
  });

  it("a number that is no longer provisional has no provisional note", async () => {
    for (const lang of ["fr", "ar"] as const) {
      const { ops, model } = await draw("cleared", "fr", { provisional: false });
      void lang;
      expect(model.provisional).toBeNull();
      expect(texts(ops).some((op) => /provisoire|مبدئي/.test(op.text!))).toBe(false);
    }
  });

  it("the serial line is there with a serial and absent without one", async () => {
    const withSerial = await draw("rated", "fr");
    expect(withSerial.model.serial).toBe("BOT #482913");
    expect(
      texts(withSerial.ops).find(
        (op) => op.text === "BOT #482913" && op.baseline === L.meta.baseline,
      ),
    ).toBeDefined();

    const without = await draw("rated", "fr", { serial: null });
    expect(without.model.serial).toBeNull();
    expect(
      texts(without.ops).some((op) => op.baseline === L.meta.baseline && /BOT/.test(op.text!)),
    ).toBe(false);
    // The season is still on the meta line, alone.
    expect(find(without.ops, "2026/27")).toBeDefined();
  });

  it("the name is in Changa 800, the number and its unit and tier follow", async () => {
    const { ops, model } = await draw("rated", "fr");
    const name = find(ops, "Ali")!;
    expect(name.font).toContain("800");
    expect(name.font).toContain('"Changa"');
    expect(model.rating).toEqual({ number: "84", unit: "OVR", tier: "PRO" });
    const number = find(ops, "84")!;
    expect(number.font).toContain('"Changa"');
    expect(find(ops, "PRO")).toBeDefined();
  });

  it("the club is a colour disc with its initials, in Changa, and nothing like a crest", async () => {
    const { ops, model } = await draw("rated", "fr");
    expect(model.club?.initials).toBe("RCA");
    const initials = find(ops, "RCA")!;
    expect(initials.font).toContain('"Changa"');
    // A disc is two circular paths of equal size: its fill and its ring.
    const disc = ops.filter(
      (op) =>
        (op.kind === "fill" || op.kind === "stroke") && op.right - op.left === L.disc.diameter,
    );
    expect(disc.length).toBeGreaterThanOrEqual(1);
  });

  it("no club, no disc", async () => {
    const { ops, model } = await draw("clubNull", "fr");
    expect(model.club).toBeNull();
    expect(ops.some((op) => op.kind === "fill" && op.right - op.left === L.disc.diameter)).toBe(
      false,
    );
  });

  it("the caption and the address", async () => {
    const fr = await draw("rated", "fr");
    expect(find(fr.ops, "Ma carte BotolaGO")).toBeDefined();
    expect(find(fr.ops, "botolago.com")).toBeDefined();
    const ar = await draw("rated", "ar");
    expect(find(ar.ops, "بطاقتي في \u2066BotolaGO\u2069")).toBeDefined();
  });

  it("the art's own text runs are drawn over the card at its drawn size", async () => {
    const { ops, model } = await draw("rated", "fr");
    const art = ops.find((op) => op.kind === "image" && op.shadowBlur)!;
    const stats = model.art.texts.filter((run) => /^(CAP|SEL|TRF|CON)$/.test(run.text));
    expect(stats).toHaveLength(4);
    for (const run of stats) {
      const drawn = texts(ops).find((op) => op.text === run.text)!;
      expect(drawn.baseline).toBeGreaterThan(art.top);
      expect(drawn.baseline).toBeLessThan(art.bottom);
    }
  });
});

describe("the layout", () => {
  it("nothing leaves the canvas, and the text clears the card", async () => {
    for (const id of ["rated", "founder", "legend", "homa", "longNameLatin"] as const) {
      for (const lang of ["fr", "ar"] as const) {
        const { ops } = await draw(id, lang);
        const art = ops.find((op) => op.kind === "image" && op.shadowBlur)!;
        for (const op of ops) {
          expect(op.left).toBeGreaterThanOrEqual(-1);
          expect(op.right).toBeLessThanOrEqual(W + 1);
          expect(op.top).toBeGreaterThanOrEqual(-1);
          expect(op.bottom).toBeLessThanOrEqual(1921);
        }
        const name = outsideCard(ops).find((op) => op.baseline === L.name.baseline);
        const caption = outsideCard(ops).find((op) => op.baseline === L.caption.baseline);
        expect(caption!.bottom).toBeLessThanOrEqual(art.top);
        expect(name!.top).toBeGreaterThanOrEqual(art.bottom);
      }
    }
  });

  it("a long name is shrunk to its room, never cut", async () => {
    const { ops } = await draw("longNameLatin", "fr");
    const name = find(ops, "Abdelkarim Benjelloun-Alaoui")!;
    const room = W - L.pad * 2 - (L.disc.diameter + 36);
    expect(name.right - name.left).toBeLessThanOrEqual(room + 1);
    expect(name.maxWidth).toBe(room);
    expect(fontOf(name)).toBeGreaterThanOrEqual(L.name.min);
  });

  it("a tall card is scaled to its band, never past it", async () => {
    const { profile, card } = profileOf("rated");
    const model = cardShareImageModel({
      profile,
      throughGameweekSeq: card.throughGameweekSeq,
      lang: "fr",
      t: dict("fr"),
      renderer: eclatRenderer,
    })!;
    model.art = { ...model.art, width: 760, height: 2000 };
    recordings = [];
    await renderCardShareImage(model);
    const art = recordings.at(-1)!.ops.find((op) => op.kind === "image" && op.shadowBlur)!;
    expect(art.bottom - art.top).toBeLessThanOrEqual(L.card.bottom - L.card.top + 0.5);
    expect(art.top).toBeGreaterThanOrEqual(L.card.top - 0.5);
    expect((art.right - art.left) / (art.bottom - art.top)).toBeCloseTo(760 / 2000, 3);
  });

  it("every text outside the card reads at 4.5:1 or more on the ground", async () => {
    for (const id of ["rated", "cleared", "founder"] as const) {
      for (const lang of ["fr", "ar"] as const) {
        const { ops } = await draw(id, lang);
        for (const op of outsideCard(ops)) {
          if (op.paint === SHARE_PALETTE.panel) continue;
          const onPill = op.baseline! < 200 && op.paint === SHARE_PALETTE.white;
          const against = onPill ? SHARE_PALETTE.panel : SHARE_PALETTE.ground;
          if (!/^#/.test(op.paint!)) continue;
          expect(contrast(op.paint!, against)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("paints only the share palette, white and the club's own colours outside the card", async () => {
    const { ops } = await draw("rated", "fr");
    const palette = new Set<string>(Object.values(SHARE_PALETTE));
    const art = ops.find((op) => op.kind === "image" && op.shadowBlur)!;
    for (const op of outsideCard(ops)) {
      if (op.baseline! > art.top && op.baseline! < art.bottom) continue;
      if (
        op.top > L.disc.centreY - L.disc.diameter / 2 &&
        op.bottom < L.disc.centreY + L.disc.diameter / 2 &&
        op.text === "RCA"
      )
        continue;
      expect(palette.has(op.paint!)).toBe(true);
    }
  });
});

describe("Arabic is the French picture mirrored", () => {
  const inline = (op: Op, lang: "fr" | "ar") => (lang === "ar" ? W - op.right : op.left);

  it("the wordmark leads from the right, the text starts at the right edge", async () => {
    const fr = await draw("rated", "fr");
    const ar = await draw("rated", "ar");
    const logo = (ops: Op[]) => ops.find((op) => op.kind === "image")!;
    expect(logo(fr.ops).left).toBe(L.pad);
    expect(W - logo(ar.ops).right).toBe(L.pad);

    const frName = find(fr.ops, "Ali")!;
    const arName = find(ar.ops, "Ali")!;
    expect(frName.align).toBe("left");
    expect(frName.left).toBe(L.pad);
    expect(arName.align).toBe("right");
    expect(arName.right).toBe(W - L.pad);
    expect(inline(arName, "ar")).toBe(inline(frName, "fr"));
  });

  it("the provisional note and the club disc sit at the inline end: left in Arabic, right in French", async () => {
    const fr = await draw("rated", "fr");
    const ar = await draw("rated", "ar");
    const pill = (ops: Op[]) =>
      ops.find((op) => op.kind === "fill" && op.paint === SHARE_PALETTE.panel)!;
    expect(W - pill(fr.ops).right).toBe(L.pad);
    expect(pill(ar.ops).left).toBe(L.pad);
    const disc = (ops: Op[]) =>
      ops.find((op) => op.kind === "fill" && op.right - op.left === L.disc.diameter)!;
    expect(W - disc(fr.ops).right).toBe(L.pad);
    expect(disc(ar.ops).left).toBe(L.pad);
  });

  it("the rating line reads from the right in Arabic: the figure first, then the unit and the tier", async () => {
    const ar = await draw("rated", "ar");
    // the rating line's own runs (the card's art also prints the number and the tier on the card)
    const onLine = (text: string) =>
      texts(ar.ops).find((op) => op.text === text && op.baseline === L.rating.baseline)!;
    const figure = onLine("84");
    const unit = onLine(" OVR");
    const tier = onLine(ar.model.rating.tier!);
    expect(figure.right).toBe(W - L.pad);
    expect(unit.right).toBeLessThanOrEqual(figure.left + 0.5);
    expect(tier.right).toBeLessThan(unit.left);
    // Each Latin run keeps its own direction inside the right-to-left picture.
    expect(figure.direction).toBe("ltr");
    expect(tier.direction).toBe("rtl");
  });

  it("the serial and the season are left-to-right runs, placed from the right", async () => {
    const ar = await draw("rated", "ar");
    const serial = texts(ar.ops).find(
      (op) => op.text === "BOT #482913" && op.baseline === L.meta.baseline,
    )!;
    const season = texts(ar.ops).find(
      (op) => op.text === "2026/27" && op.baseline === L.meta.baseline,
    )!;
    expect(serial.right).toBe(W - L.pad);
    expect(serial.direction).toBe("ltr");
    expect(season.right).toBeLessThan(serial.left);
  });

  it("the Arabic picture uses the Arabic body face and Changa for the name, French the Latin one", async () => {
    const ar = await draw("rated", "ar");
    const fr = await draw("rated", "fr");
    expect(find(ar.ops, "2026/27")!.font).toContain("Noto Sans Arabic");
    expect(find(fr.ops, "2026/27")!.font).toContain('"Manrope"');
    expect(find(ar.ops, "Ali")!.font).toContain('"Changa"');
  });

  it("an Arabic name is drawn right to left and aligned at the right", async () => {
    const { ops } = await draw("arabicName", "ar");
    const name = find(ops, "فاطمة الزهراء")!;
    expect(name.direction).toBe("rtl");
    expect(name.right).toBe(W - L.pad);
  });
});

function fontOf(op: Op): number {
  return Number(/([\d.]+)px/.exec(op.font ?? "")?.[1]);
}

describe("LASTREET, the lowest tier's word", () => {
  for (const lang of ["fr", "ar"] as const) {
    it(`${lang}: the rating line and the card's plaque draw it left to right in Changa, tracked on the card`, async () => {
      const { ops, model } = await draw("homa", lang);
      expect(model.rating.tier).toBe("LASTREET");
      const line = texts(ops).find(
        (op) => op.text === "LASTREET" && op.baseline === L.rating.baseline,
      )!;
      expect(line.direction).toBe("ltr");
      expect(line.font).toContain('"Changa"');
      // the word on the card's plaque is a run of the art, in the display face, spaced
      const plaque = model.art.texts.find((run) => run.text === "LASTREET")!;
      expect(plaque.dir).toBe("ltr");
      expect(plaque.face).toBe("display");
      expect(plaque.tracking).toBeGreaterThan(0);
      const drawn = texts(ops).find(
        (op) => op.text === "LASTREET" && op.baseline !== L.rating.baseline,
      )!;
      expect(drawn.direction).toBe("ltr");
      expect(drawn.letterSpacing).toBeGreaterThan(0);
      expect(texts(ops).some((op) => /HOMA|حومة/.test(op.text!))).toBe(false);
    });
  }

  it("in Arabic the other tiers stay Arabic words, set right to left", async () => {
    const { ops, model } = await draw("rated", "ar");
    expect(model.rating.tier).not.toBe("PRO");
    expect(/\p{Script=Arabic}/u.test(model.rating.tier!)).toBe(true);
    const line = texts(ops).find(
      (op) => op.text === model.rating.tier && op.baseline === L.rating.baseline,
    )!;
    expect(line.direction).toBe("rtl");
  });
});

describe("the card's art in the new style", () => {
  it("turns the founder's « 26 » along the cut corner and keeps it on the canvas", async () => {
    const { ops, model } = await draw("founder", "fr");
    const run = model.art.texts.find((r) => r.rotate)!;
    expect(run).toBeDefined();
    const drawn = texts(ops).find((op) => op.rotate !== undefined)!;
    expect(Math.abs(drawn.rotate!)).toBeCloseTo(Math.abs(run.rotate!), 3);
    expect(drawn.left).toBeGreaterThanOrEqual(0);
    expect(drawn.right).toBeLessThanOrEqual(W);
  });

  it("names the card's second name line in its serif and the Arabic one in Changa Light", async () => {
    const fr = await draw("longNameLatin", "fr");
    const serif = fr.model.art.texts.find((run) => run.face === "serif")!;
    expect(serif).toBeDefined();
    expect(texts(fr.ops).find((op) => op.text === serif.text)!.font).toContain("Instrument Serif");
    const ar = await draw("arabicName", "ar");
    const light = ar.model.art.texts.find((run) => run.face === "displayLight")!;
    expect(light).toBeDefined();
    const drawn = texts(ar.ops).find(
      (op) => op.text === light.text && op.baseline !== L.name.baseline,
    )!;
    expect(drawn.font).toContain("300");
    expect(drawn.font).toContain('"Changa"');
  });
});

describe("a long name stays inside the card's art", () => {
  const LONG = {
    fr: "Zinedine Abdelhakimbenmohammedelalaoui Ali",
    ar: "عبدالرحمنمحمدالعلويالادريسيالحسني",
  } as const;
  for (const lang of ["fr", "ar"] as const) {
    it(`${lang}: a line the card closes up by spacing (textLength) is drawn no wider than 790 units of the art`, async () => {
      const { ops, model } = await draw("rated", lang, { name: LONG[lang] });
      const fitted = model.art.texts.filter((run) => run.fitWidth);
      expect(fitted.length, "the card fits at least one line by spacing").toBeGreaterThan(0);
      const art = ops.find((op) => op.kind === "image" && op.shadowBlur)!;
      const unit = (art.right - art.left) / 1000;
      for (const run of fitted) {
        // the budget travels with the run, in the art's units: 790 less what the line's first and last
        // letters overhang (the name is fitted by its ink, so the ink keeps the 105 to 895 margin)
        const budget = 790 * (model.art.width / 1000);
        expect(run.fitWidth!).toBeLessThanOrEqual(budget + 0.05);
        expect(run.fitWidth!).toBeGreaterThan(budget - 10 * (model.art.width / 1000));
        const drawn = texts(ops).find(
          (op) => op.text === run.text && op.baseline !== L.name.baseline,
        );
        expect(drawn, run.text).toBeDefined();
        expect(drawn!.right - drawn!.left, run.text).toBeLessThanOrEqual(790 * unit + 0.5);
        // and inside the card's art, on both sides
        expect(drawn!.left).toBeGreaterThanOrEqual(art.left);
        expect(drawn!.right).toBeLessThanOrEqual(art.right);
        if (lang === "fr") {
          // a Latin run is closed up by spacing, never squeezed
          expect(drawn!.letterSpacing!).toBeLessThan(0);
          expect(drawn!.maxWidth).toBeUndefined();
        } else {
          // the canvas never spaces the letters of an Arabic run (the width does not move), so it is
          // closed up by the maximum width of `fillText`: narrowed glyphs, not a line past the art
          expect(drawn!.letterSpacing).toBeUndefined();
          expect(drawn!.maxWidth).toBeCloseTo(790 * unit, 1);
        }
      }
    });
  }

  it("a name that fits keeps its natural spacing", async () => {
    const { ops, model } = await draw("rated", "fr");
    expect(model.art.texts.some((run) => run.fitWidth)).toBe(false);
    // nothing is closed up: no run is drawn with a negative letter spacing
    expect(texts(ops).filter((op) => (op.letterSpacing ?? 0) < 0)).toEqual([]);
  });
});

describe("the faces the art is drawn in", () => {
  it("are asked for before the picture is drawn: the serif, Changa Light, and the figures' face in Arabic too", async () => {
    const asked: string[] = [];
    const doc = (globalThis as unknown as { document: Record<string, unknown> }).document;
    doc.fonts = {
      load: (spec: string) => {
        asked.push(spec);
        return Promise.resolve([]);
      },
    };
    await draw("rated", "ar");
    expect(asked.some((spec) => spec.includes('"Instrument Serif"'))).toBe(true);
    expect(asked.some((spec) => spec.startsWith("300 ") && spec.includes('"Changa"'))).toBe(true);
    expect(asked.some((spec) => spec.startsWith("800 ") && spec.includes('"Manrope"'))).toBe(true);
    expect(asked.some((spec) => spec.includes('"Noto Sans Arabic"'))).toBe(true);
  });
});
