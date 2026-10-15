import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { cardShareImageModel, renderCardShareImage } from "../moments/card-share-image";
import {
  recordingContext,
  type Op,
  type Recording,
} from "../moments/card-share-image.test-support";
import type { CardProfile, TierCode } from "../types";
import { IMAGE_WIDTH, cardImage } from "./image";
import { shieldRenderer } from "./index";
import { resetMeasure, tableEm } from "./name";
import { STRINGS, rated } from "./test-support";

/**
 * The shield's share picture against the card in the app (`SHARE_CARD_PARITY_BRIEF.md`): the club
 * name's width budget is in the picture's pixels, and the rating column is laid out as the card's
 * `.mc-shield__rate` is, drawn on the recording stand-in for the canvas the other share tests use.
 */

let restore: (() => void) | null = null;
let recordings: Recording[] = [];

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, Image: g.Image };
  resetMeasure();
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
    naturalWidth = 760;
    naturalHeight = 1166;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  restore = () => {
    g.document = saved.document;
    g.Image = saved.Image;
    resetMeasure();
  };
});
afterEach(() => restore?.());

const dict = (lang: Language) => (key: TranslationKey) => dictionaries[lang][key];

async function draw(lang: Language, over: Partial<CardProfile> = {}) {
  const profile: CardProfile = { ...rated, ...over };
  recordings = [];
  const model = cardShareImageModel({
    profile,
    throughGameweekSeq: 1,
    lang,
    t: dict(lang),
    renderer: shieldRenderer,
  })!;
  await renderCardShareImage(model);
  const ops = recordings.at(-1)!.ops;
  const art = ops.find((op) => op.kind === "image" && op.shadowBlur)!;
  // the art's drawn pixels per art unit, and where a card unit lands
  const unit = (art.right - art.left) / IMAGE_WIDTH;
  const card = (x: number) => art.left + ((x + 8) / 116) * (art.right - art.left);
  return { ops, model, art, unit, card, texts: ops.filter((op: Op) => op.kind === "text") };
}

const CLUBS = {
  fr: { short: "Raja CA", long: "Association Sportive des Forces Armées Royales de Casablanca" },
  ar: { short: "الرجاء الرياضي", long: "الجمعية الرياضية للقوات المسلحة الملكية بالدار البيضاء" },
} as const;

const withClub = (name: string): CardProfile["club"] => ({
  ...rated.club!,
  name: { fr: name, ar: name },
});

describe("the club name on the share picture", () => {
  it("has its width budget in the picture's pixels, the card's 82 units", () => {
    for (const lang of ["fr", "ar"] as const) {
      const art = cardImage(rated, STRINGS[lang], tableEm);
      const club = art.texts.find((run) => run.fitWidth)!;
      expect(club).toBeDefined();
      // 82 of the card's 100 units, at the art's scale (820 px for 116 units)
      expect(club.fitWidth!).toBeCloseTo(82 * (art.width / 116), 0);
      expect(club.fitWidth!).toBeGreaterThan(500);
      expect(club.fitWidth!).toBeLessThan(art.width);
    }
  });

  for (const lang of ["fr", "ar"] as const) {
    it(`${lang}: a normal club name is drawn at its natural width, not squeezed`, async () => {
      const { texts, model, unit } = await draw(lang, {
        club: { ...rated.club!, name: { fr: CLUBS.fr.short, ar: CLUBS.ar.short } },
      });
      const run = model.art.texts.find((r) => r.fitWidth)!;
      const drawn = texts.find((op) => op.text === run.text)!;
      expect(drawn).toBeDefined();
      // not narrowed by `fillText`'s maximum width, and not closed up by negative spacing
      expect(drawn.maxWidth).toBeUndefined();
      expect(drawn.letterSpacing ?? 0).toBeGreaterThanOrEqual(0);
      // and readable: nowhere near the 80 px it was squeezed to (that was 80 / 820 of the art)
      expect((drawn.right - drawn.left) / unit).toBeGreaterThan(150);
      expect(drawn.right - drawn.left).toBeLessThanOrEqual(run.fitWidth! * unit + 0.5);
    });

    it(`${lang}: a very long club name still stays inside the art, closed up to its budget`, async () => {
      const { texts, model, art, unit } = await draw(lang, { club: withClub(CLUBS[lang].long) });
      const run = model.art.texts.find((r) => r.fitWidth)!;
      const drawn = texts.find((op) => op.text === run.text)!;
      expect(drawn.right - drawn.left).toBeLessThanOrEqual(run.fitWidth! * unit + 0.5);
      expect(drawn.left).toBeGreaterThanOrEqual(art.left);
      expect(drawn.right).toBeLessThanOrEqual(art.right);
      // closed up, never squeezed below what the budget allows
      if (lang === "fr") expect(drawn.letterSpacing!).toBeLessThan(0);
      else expect(drawn.maxWidth!).toBeCloseTo(run.fitWidth! * unit, 1);
      expect(drawn.right - drawn.left).toBeGreaterThan(run.fitWidth! * unit * 0.95);
    });
  }
});

const TIERS: TierCode[] = ["homa", "stade", "pro", "champion", "legend"];

describe("the rating column on the share picture", () => {
  for (const lang of ["fr", "ar"] as const) {
    for (const tier of TIERS) {
      it(`${lang} ${tier}: the tier word and the number share the card's column, inside the card`, async () => {
        const { texts, model, art, card } = await draw(lang, { tier, ovr: 91 });
        const word = model.art.texts.find(
          (run) => run.column && run.text !== "91" && run.text !== STRINGS[lang].ovr,
        )!;
        const number = model.art.texts.find((run) => run.text === "91")!;
        expect(word.column).toBeDefined();
        const w = texts.find(
          (op) => op.text === word.text && op.baseline! < art.top + (art.bottom - art.top) * 0.4,
        )!;
        const n = texts.find(
          (op) => op.text === "91" && op.baseline! < art.top + (art.bottom - art.top) * 0.4,
        )!;
        // the same centre: the card centres both in the column
        expect((w.left + w.right) / 2).toBeCloseTo((n.left + n.right) / 2, 0);
        expect(number.column!.from).toBe(lang === "ar" ? "right" : "left");
        // the column starts 4.5 units in from the inline start, and nothing runs out of it
        if (lang === "fr") {
          expect(Math.min(w.left, n.left)).toBeGreaterThanOrEqual(card(4.5) - 1);
        } else {
          expect(Math.max(w.right, n.right)).toBeLessThanOrEqual(card(95.5) + 1);
        }
        // the whole word is inside the card's outline
        expect(w.left).toBeGreaterThanOrEqual(card(0));
        expect(w.right).toBeLessThanOrEqual(card(100));
      });
    }
  }

  it("fr: a tier word wider than the number starts at the column's edge, the number centred on it", async () => {
    const { texts, art, card } = await draw("fr", { tier: "champion", ovr: 91 });
    const top = art.top + (art.bottom - art.top) * 0.4;
    const w = texts.find((op) => op.text === "CHAMPION" && op.baseline! < top)!;
    const n = texts.find((op) => op.text === "91" && op.baseline! < top)!;
    expect(w.left).toBeCloseTo(card(4.5), 0);
    expect(w.right - w.left).toBeGreaterThan(n.right - n.left);
    // « OVR » follows the number's end, as the card's does
    const tag = texts.find((op) => op.text === "OVR" && op.baseline! < top)!;
    expect(tag.left).toBeGreaterThan(n.right);
    expect(tag.left - n.right).toBeLessThan(card(2) - card(0));
  });

  it("ar: the column starts at the right edge and « OVR » sits left of the number", async () => {
    const { texts, art, card } = await draw("ar", { tier: "legend", ovr: 97 });
    const top = art.top + (art.bottom - art.top) * 0.4;
    const n = texts.find((op) => op.text === "97" && op.baseline! < top)!;
    const tag = texts.find((op) => op.text === STRINGS.ar.ovr && op.baseline! < top)!;
    expect(tag.right).toBeLessThan(n.left);
    expect(n.left - tag.right).toBeLessThan(card(2) - card(0));
    expect(n.right).toBeLessThanOrEqual(card(95.5) + 1);
  });

  it("never tracks an Arabic tier word", () => {
    const art = cardImage({ ...rated, tier: "champion" }, STRINGS.ar, tableEm);
    const word = art.texts.find((run) => run.text === STRINGS.ar.tiers.champion)!;
    expect(word.tracking).toBeUndefined();
  });
});
