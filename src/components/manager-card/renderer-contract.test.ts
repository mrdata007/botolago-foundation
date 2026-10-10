import { describe, expect, it } from "bun:test";

import { FIXTURE_IDS, FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

import { activeRenderer } from "./active-renderer";
import { cardStrings, type Translate } from "./copy";
import { ALLOWED_CARD_TAGS, HOSTILE_NAMES, findUnsafeMarkup } from "./markup-safety";
import { plainRenderer } from "./plain-renderer";
import type { CardRenderer } from "./renderer";
import { fromMyCard, guestProfile } from "./to-profile";
import { TIER_CODES, type CardProfile, type TokenSize } from "./types";

const tFor =
  (lang: "fr" | "ar"): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;
const STRINGS = { fr: cardStrings(tFor("fr"), "fr"), ar: cardStrings(tFor("ar"), "ar") };
const SIZES: TokenSize[] = [24, 28, 32, 44, 56, 64, 80];
const rated: CardProfile = fromMyCard(FIXTURES.rated.card!);

/** The attribute value of the first `name="…"` in the markup, with its entities decoded. */
function attribute(html: string, name: string): string | null {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(html)?.[1];
  return value === undefined
    ? null
    : value
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replaceAll("&amp;", "&");
}
const stripControls = (text: string) =>
  [...text]
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return !(
        code < 0x20 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
    .join("");

/**
 * What every card renderer must do (plan 6.3 and 6.5), run on the plain renderer and on whichever
 * renderer `active-renderer.ts` serves: switching the app to a card direction puts it under the
 * same checks. Only what the plan requires is asserted here; a direction's own look, its beats
 * and its hooks are tested in its own folder.
 */
function describeRendererContract(name: string, renderer: CardRenderer) {
  describe(`${name}: the renderer contract`, () => {
    it("draws every fixture, in both languages and both themes, without throwing", () => {
      for (const id of FIXTURE_IDS) {
        const card = FIXTURES[id].card;
        if (!card) continue;
        const profile = fromMyCard(card, { sample: true });
        for (const lang of ["fr", "ar"] as const) {
          for (const theme of ["light", "dark"] as const) {
            const html = renderer.full(profile, { strings: STRINGS[lang], theme });
            expect(html.length).toBeGreaterThan(0);
            expect(findUnsafeMarkup(html)).toEqual([]);
          }
          for (const size of SIZES) {
            const token = renderer.token(profile, { strings: STRINGS[lang], theme: "light", size });
            expect(findUnsafeMarkup(token)).toEqual([]);
          }
        }
      }
    });

    it("has one root element with role=img, the label and the language's direction", () => {
      for (const lang of ["fr", "ar"] as const) {
        const html = renderer.full(rated, { strings: STRINGS[lang], theme: "light" });
        expect(html.match(/role="img"/g)).toHaveLength(1);
        expect(html.startsWith("<")).toBe(true);
        expect(attribute(html, "dir")).toBe(lang === "ar" ? "rtl" : "ltr");
        const label = renderer.label(rated, STRINGS[lang]);
        expect(attribute(html, "aria-label")).toBe(stripControls(label));
        // What a screen reader gets names the manager and the rating, in whatever order.
        expect(label).toContain("Ali");
        expect(label).toContain("84");
      }
    });

    it("prints a dash, never 0, for a card with no number, and says so in its label", () => {
      const forming = fromMyCard(FIXTURES.forming1.card!);
      const html = renderer.full(forming, { strings: STRINGS.fr, theme: "light" });
      expect(html).not.toMatch(/>\s*0\s*</);
      expect(renderer.label(forming, STRINGS.fr)).toContain("pas encore de note");
      expect(renderer.label(forming, STRINGS.ar)).toContain("لا تقييم بعد");
    });

    it("draws the empty parts of a card: no club, no serial, no founder, no name", () => {
      for (const lang of ["fr", "ar"] as const) {
        const html = renderer.full(guestProfile(), { strings: STRINGS[lang], theme: "dark" });
        expect(findUnsafeMarkup(html)).toEqual([]);
        expect(html.length).toBeGreaterThan(0);
      }
      const noClub = fromMyCard(FIXTURES.clubNull.card!);
      expect(renderer.full(noClub, { strings: STRINGS.fr, theme: "light" }).length).toBeGreaterThan(
        0,
      );
      expect(
        renderer.full(
          { ...rated, serial: null, founder: null },
          {
            strings: STRINGS.ar,
            theme: "light",
          },
        ).length,
      ).toBeGreaterThan(0);
    });

    it("draws every tier", () => {
      for (const tier of TIER_CODES) {
        const html = renderer.full({ ...rated, tier }, { strings: STRINGS.fr, theme: "light" });
        expect(html.length).toBeGreaterThan(0);
      }
    });

    it("escapes a hostile name everywhere: full, token, detail and the share art", () => {
      for (const name of HOSTILE_NAMES) {
        const profile: CardProfile = { ...rated, name, founder: 2026, serial: "482913" };
        for (const lang of ["fr", "ar"] as const) {
          const strings = STRINGS[lang];
          const outputs = [
            renderer.full(profile, { strings, theme: "light" }),
            renderer.token(profile, { strings, theme: "dark", size: 64 }),
            renderer.detail(profile, "founder", { strings, theme: "light" }) ?? "",
            renderer.image(profile, strings).svg,
          ];
          for (const html of outputs) {
            expect(findUnsafeMarkup(html)).toEqual([]);
            // The name may sit in the label as text, escaped; it never becomes a tag.
            expect(html).not.toContain("<img");
            expect(html).not.toContain("<script");
          }
        }
      }
    });

    it("keeps a hostile club colour out of every attribute: full, token, detail and the share art", () => {
      const profile: CardProfile = {
        ...rated,
        founder: 2026,
        serial: "482913",
        club: {
          ...rated.club!,
          primary: "red;}</style><script>",
          secondary: '"><svg onload=alert(1)>',
        },
      };
      for (const lang of ["fr", "ar"] as const) {
        const strings = STRINGS[lang];
        const outputs = [
          renderer.full(profile, { strings, theme: "light" }),
          ...SIZES.map((size) => renderer.token(profile, { strings, theme: "dark", size })),
          renderer.detail(profile, "founder", { strings, theme: "light" }) ?? "",
          renderer.image(profile, strings).svg,
        ];
        for (const html of outputs) {
          expect(findUnsafeMarkup(html)).toEqual([]);
          expect(html).not.toContain("<script");
          expect(html).not.toContain("onload");
        }
      }
    });

    it("computes its aspect without the DOM, and a token box for every size", () => {
      expect(renderer.aspect(rated, STRINGS.fr)).toBeGreaterThan(1);
      expect(renderer.aspect(rated, STRINGS.ar)).toBeGreaterThan(1);
      for (const size of SIZES) {
        const box = renderer.tokenBox(rated, size);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    });

    it("has a founder detail for a founder", () => {
      const founder = fromMyCard(FIXTURES.founder.card!);
      expect(
        renderer.detail(founder, "founder", { strings: STRINGS.fr, theme: "light" }),
      ).not.toBeNull();
    });

    it("gives the share art as a text-free SVG plus the runs it would have drawn", () => {
      const art = renderer.image(rated, STRINGS.fr);
      expect(art.svg).not.toContain("<text");
      expect(art.svg).not.toContain("<tspan");
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(art.width);
      // The card's own text is a run: the rating (84 on this fixture; 91 on the patch's) and its
      // serial. A direction that drew the number as geometry would have no run for it; one that
      // prints it (Éclat, the plain renderer) has.
      const spoken = art.texts.map((run) => run.text);
      expect(spoken.some((text) => text === "84" || text === "91")).toBe(true);
      expect(spoken).toContain("BOT #482913");
      for (const run of art.texts) {
        expect(run.size).toBeGreaterThan(0);
        expect(["start", "middle", "end"]).toContain(run.anchor);
        expect(["ltr", "rtl"]).toContain(run.dir);
      }
    });

    it("lists its beats with a length each, and answers 0 for any it does not list", () => {
      for (const beat of renderer.beats) expect(renderer.beatMs(beat)).toBeGreaterThan(0);
      for (const beat of [
        "make",
        "tick",
        "first",
        "tier",
        "legend",
        "founder",
        "castoff",
      ] as const) {
        if (!renderer.beats.includes(beat)) expect(renderer.beatMs(beat)).toBe(0);
      }
    });

    it("keeps to the tags the card may use", () => {
      const html = renderer.full(rated, { strings: STRINGS.fr, theme: "dark" });
      const tags = new Set(
        [...html.matchAll(/<([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]!),
      );
      for (const tag of tags) expect(ALLOWED_CARD_TAGS as readonly string[]).toContain(tag);
    });
  });
}

describeRendererContract("plain renderer", plainRenderer);
const active = await activeRenderer.load();
if (active !== plainRenderer) describeRendererContract(`active renderer (${active.id})`, active);

describe("the active renderer (active-renderer.ts)", () => {
  it("loads the renderer it names", () => {
    expect(active.id).toBe(activeRenderer.id);
  });

  it("reserves the box the card really has, in either language: one shape, so the page never jumps", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const id of ["rated", "forming1", "founder", "longNameLatin", "arabicName"] as const) {
        const profile = fromMyCard(FIXTURES[id].card!, { sample: true });
        const estimate = activeRenderer.estimateAspect(profile, lang);
        const real = active.aspect(profile, STRINGS[lang]);
        // Every Éclat card is 1 : 1.618 (plan D6), so the estimate is exact.
        expect(estimate).toBe(1.618);
        expect(real).toBe(1.618);
      }
    }
  });
});
