import { describe, expect, it } from "bun:test";

import { FOIL, TIER_KEYS, contrast, lstar, shirtColours, type TierKey } from "./foil";
import { OUTLINE, SHIRT_TOKEN, TIER_BAR, TOKEN_WINDOW, n2 } from "./geometry";
import { eclatRenderer } from "./index";
import { measureTable } from "./measure";
import { ladderProfile } from "../to-profile";
import { AR, FR, MOCK_ARABIC, MOCK_CARDS, MOCK_TOKENS, PROFILES } from "./test-data";
import { texts } from "./test-markup";
import { tokenWidth } from "./token";
import type { CardProfile, TokenSize } from "../types";

/** Every size the app draws, and the owner's check size (48) the plan names. */
const SIZES = [80, 64, 56, 48, 44, 32, 28, 24] as const;

const tok = (
  p: CardProfile,
  size: number,
  o: { lang?: "fr" | "ar"; theme?: "light" | "dark" } = {},
) =>
  eclatRenderer.token(p, {
    strings: o.lang === "ar" ? AR : FR,
    theme: o.theme ?? "light",
    size: size as TokenSize,
  });

/** The token of each step of the ladder, as the mock draws them (base, LASTREET, STADE, PRO, CHAMPION, LEGEND). */
const LADDER: readonly (readonly [TierKey, CardProfile])[] = TIER_KEYS.map(
  (k, i) => [k, MOCK_TOKENS[i]!] as const,
);

const u = (size: number) => 1618 / size;
const level = (size: number) => (size >= 80 ? "card" : size >= 28 ? "jersey" : "mini");
/** The jersey's scale and centre height per size (plan 7). */
const PLACEMENT = (size: number): readonly [number, number] =>
  size >= 80 ? [1.86, 720] : size >= 64 ? [1.82, 780] : size >= 44 ? [2.04, 820] : [2.21, 820];
/** What the ring, the tier bar and the foot band are painted with: the foil gradient or the tier's colour. */
const ringPaint = (key: TierKey, html: string): string => {
  const F = FOIL[key];
  if (!F.foil) return F.tokEdge!;
  return /url\(#(mc-t-\d+-foil)\)/.exec(html)![0];
};

describe("tokens and minis, every size (plan 7)", () => {
  it("is one flat SVG: no layers, filters, blur, patterns, masks, foil overlay or animation", () => {
    for (const size of SIZES) {
      for (const c of [...MOCK_CARDS, ...MOCK_ARABIC]) {
        for (const theme of ["light", "dark"] as const) {
          const h = tok(c.profile, size, { lang: c.lang, theme });
          const label = `${size} ${c.caption}`;
          expect(h.match(/<svg/g), label).toHaveLength(1);
          expect(
            /<filter|<pattern|<mask|feGaussianBlur|mc-eclat|mc-l |mc-rim|animation|<style|<image/.test(
              h,
            ),
            label,
          ).toBe(false);
          expect(h.startsWith(`<span class="mc-tok mc-tok--${size}"`), label).toBe(true);
          expect(h.match(/role="img"/g), label).toHaveLength(1);
          expect(h.length, `${label} markup`).toBeLessThan(6000);
        }
      }
    }
  });

  it("is a box of 0.618 of its height, the one tokenBox reports", () => {
    for (const size of SIZES) {
      const box = { width: Math.round(size * 0.618), height: size };
      expect(tokenWidth(size)).toBe(box.width);
      expect(eclatRenderer.tokenBox(PROFILES.rated, size as TokenSize)).toEqual(box);
      expect(tok(PROFILES.rated, size)).toContain(`width:${box.width}px;height:${size}px`);
    }
  });

  it("places the enlarged shirt per size, the same shirt at every size", () => {
    for (const size of SIZES) {
      const [k, yc] = PLACEMENT(size);
      for (const [, p] of LADDER) {
        const h = tok(p, size);
        expect(h, `${size}`).toContain(
          `transform="translate(500 ${yc}) scale(${k}) translate(-500 -603)"`,
        );
        // the token shirt (short raised sleeves) drawn as fill, volume and keyline, never the full card's
        expect(h.split(`d="${SHIRT_TOKEN}"`).length - 1, `${size}`).toBe(3);
      }
    }
  });

  it("draws the card at 80: window, tier bar and a 1 px metal edge; nothing of the furniture", () => {
    const size = 80;
    const w = n2(2 * u(size));
    for (const [key, p] of LADDER) {
      const h = tok(p, size);
      const paint = FOIL[key].foil ? "foil" : "metal";
      expect(h, key).toContain(`<clipPath id="mc-t-`);
      expect(
        new RegExp(
          `<path d="${TOKEN_WINDOW}" fill="none" stroke="url\\(#mc-t-\\d+-${paint}\\)" stroke-width="${w}"/>`,
        ).test(h),
        `${key} window`,
      ).toBe(true);
      expect(
        new RegExp(`<path d="${TIER_BAR}" fill="url\\(#mc-t-\\d+-${paint}\\)"/>`).test(h),
        `${key} bar`,
      ).toBe(true);
      expect(
        new RegExp(
          `<path d="${OUTLINE}" fill="none" stroke="url\\(#mc-t-\\d+-${paint}\\)" stroke-width="${w}"/>`,
        ).test(h),
        `${key} edge`,
      ).toBe(true);
      // the field fills the window, not the whole outline, and there is no ring
      expect(h.includes(`<path d="${TOKEN_WINDOW}" fill="url(#mc-t-`), key).toBe(true);
      expect(h.includes(`stroke-width="${n2(4 * u(size))}"`), key).toBe(false);
    }
  });

  it("draws the jersey at 64: the whole outline as the field, a 2 px ring, the tier bar in the ring's colour", () => {
    const size = 64;
    for (const [key, p] of LADDER) {
      const h = tok(p, size);
      const paint = ringPaint(key, h);
      expect(h.includes(`d="${TOKEN_WINDOW}"`), key).toBe(false);
      expect(
        h.includes(
          `<path d="${OUTLINE}" fill="none" stroke="${paint}" stroke-width="${n2(4 * u(size))}"/>`,
        ),
        `${key} ring`,
      ).toBe(true);
      expect(h.includes(`<path d="${TIER_BAR}" fill="${paint}"/>`), `${key} bar`).toBe(true);
      expect(h.includes('width="1000" height='), `${key} no foot band`).toBe(false);
      expect(h.includes(`<path d="${OUTLINE}" fill="url(#mc-t-`), key).toBe(true);
    }
  });

  it("draws the jersey at 56, 48, 44, 32 and 28 with a foot band instead of the tier bar", () => {
    for (const size of [56, 48, 44, 32, 28]) {
      const band = n2(3 * u(size));
      for (const [key, p] of LADDER) {
        const h = tok(p, size);
        const paint = ringPaint(key, h);
        expect(h.includes(`d="${TIER_BAR}"`), `${size} ${key} no bar`).toBe(false);
        expect(
          h.includes(
            `<rect x="0" y="${n2(1618 - 3 * u(size))}" width="1000" height="${band}" fill="${paint}"/>`,
          ),
          `${size} ${key} band`,
        ).toBe(true);
        expect(
          h.includes(
            `<path d="${OUTLINE}" fill="none" stroke="${paint}" stroke-width="${n2(4 * u(size))}"/>`,
          ),
          `${size} ${key} ring`,
        ).toBe(true);
      }
    }
  });

  it("draws the mini at 24 as the 32 does but without the number", () => {
    for (const [key, p] of LADDER) {
      const h = tok(p, 24);
      expect(h.includes("data-mc"), key).toBe(false);
      expect(h.includes("<text"), key).toBe(false);
      expect(h.includes(`d="${TIER_BAR}"`), key).toBe(false);
      expect(h.includes(`height="${n2(3 * u(24))}"`), key).toBe(true);
    }
  });

  it("drops every detail below the card: no name, stats, serial, tier word, season, disc or texture", () => {
    for (const size of SIZES) {
      for (const [, p] of LADDER) {
        const h = tok({ ...p, serial: "482913", founder: 2026 }, size);
        // the only text there is the rating (an outline, then its fill), and none at 24
        const t = texts(h);
        expect(t.length, `${size}`).toBe(size >= 28 ? 2 : 0);
        for (const x of t)
          expect(["—", ...Array.from({ length: 99 }, (_, i) => String(i + 1))]).toContain(x.text);
        expect(/<circle|<ellipse|stroke-dasharray|mc-capsule|mc-mark/.test(h), `${size}`).toBe(
          false,
        );
        expect(h.includes("BOT #") || h.includes("OVR</text>"), `${size}`).toBe(false);
      }
    }
  });

  it("keeps the tier readable by value as well as by hue: six rings that differ in lightness, foil on the top two", () => {
    const rings = TIER_KEYS.map((k) => FOIL[k].tokEdge).filter(Boolean);
    expect(rings).toHaveLength(4);
    expect(new Set(rings).size).toBe(4);
    expect(FOIL.champion.tokEdge).toBeUndefined();
    expect(FOIL.legend.tokEdge).toBeUndefined();
    // the four plain rings differ by value, not only by hue (CIE L*, at least 8 apart), so the tiers
    // stay apart for a reader who cannot tell crimson from gold or grey from graphite
    const lums = TIER_KEYS.filter((k) => FOIL[k].tokEdge).map((k) => lstar(FOIL[k].tokEdge!));
    for (let i = 0; i < lums.length; i++)
      for (let j = i + 1; j < lums.length; j++)
        expect(Math.abs(lums[i]! - lums[j]!), `${i}/${j}`).toBeGreaterThanOrEqual(8);
    for (const size of [64, 32]) {
      for (const key of ["champion", "legend"] as const) {
        const h = tok(LADDER.find(([k]) => k === key)![1], size);
        expect(h).toMatch(
          /<linearGradient id="mc-t-\d+-foil"[^>]*>(<stop[^>]*>){6}<\/linearGradient>/,
        );
      }
    }
  });

  it("is static: the same card twice gives the same markup but for ids, and ids never repeat", () => {
    const strip = (h: string) => h.replace(/mc-t-\d+/g, "mc-t-N");
    for (const size of SIZES) {
      const a = tok(PROFILES.champion, size);
      const b = tok(PROFILES.champion, size);
      expect(strip(a)).toBe(strip(b));
      expect(a).not.toBe(b);
      const ids = [...(a + b).matchAll(/ id="(mc-t-\d+-[a-z]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("builds in well under the 3 ms budget", () => {
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) tok(MOCK_TOKENS[i % 6]!, SIZES[i % SIZES.length]!);
    expect((performance.now() - t0) / runs).toBeLessThan(3);
  });
});

describe("the rating on tokens (plan 7)", () => {
  const numberTexts = (h: string) =>
    texts(h).filter((t) => "class" in t.attrs && /mc-f-d/.test(t.attrs.class!));

  it("is two texts, an outline then a solid fill, at 80, 64, 56, 48, 44, 32 and 28", () => {
    for (const size of SIZES.filter((s) => s >= 28)) {
      for (const c of MOCK_CARDS) {
        const t = numberTexts(tok(c.profile, size));
        expect(t, `${size} ${c.caption}`).toHaveLength(2);
        expect(t[0]!.attrs.fill).toBe("none");
        expect(t[1]!.attrs.fill).toMatch(/^#(FFFFFF|0E1116)$/);
        expect(t[0]!.text).toBe(t[1]!.text);
        // not gradient text, never mirrored, always left to right
        expect(t[1]!.attrs.fill!.startsWith("url")).toBe(false);
        expect(t[1]!.attrs.transform).toBeUndefined();
        expect(t[1]!.attrs.direction).toBe("ltr");
      }
    }
  });

  it("is white or ink by 3:1 on the shirt, with an outline that keeps it apart from the shirt", () => {
    for (const size of [80, 64, 32]) {
      for (const c of MOCK_CARDS) {
        const t = numberTexts(tok(c.profile, size));
        const F = FOIL[c.profile.ovr == null ? "base" : (c.profile.tier ?? "base")];
        const col = shirtColours(c.profile.club, F);
        expect(t[1]!.attrs.fill).toBe(col.numberFill);
        expect(
          contrast(t[1]!.attrs.fill!, col.primary),
          `${size} ${c.caption}`,
        ).toBeGreaterThanOrEqual(3);
        const outline = t[0]!.attrs.stroke!;
        expect(contrast(outline, t[1]!.attrs.fill!), `${size} ${c.caption}`).toBeGreaterThanOrEqual(
          3,
        );
        // 2 × half, half = 1.1u on the card composition and 0.8u on the jersey one
        const half = size >= 80 ? 1.1 : 0.8;
        expect(Number(t[0]!.attrs["stroke-width"])).toBeCloseTo(2 * half * u(size), 1);
      }
    }
  });

  it("reads at the sizes the plan sets: two digits 14, 12, 10 and 7 CSS px tall (within 2 %: the plan's figures came from a canvas that rounds the ink)", () => {
    const FLOOR: Record<number, number> = { 80: 14, 64: 12, 48: 10, 32: 7 };
    for (const size of [80, 64, 48, 32]) {
      for (let n = 10; n <= 99; n++) {
        const html = tok({ ...PROFILES.rated, ovr: n, tier: "pro" }, size);
        const t = numberTexts(html)[1]!;
        const ink = measureTable(String(n), "d");
        const px = ((ink.a + ink.d) * t.size * size) / 1618;
        expect(px, `${size} ${n}`).toBeGreaterThanOrEqual(FLOOR[size]! * 0.98);
      }
    }
  });

  it("is never smaller as the token grows, one digit or two (a one-digit 8 differs by 0.3 % between 64 and 80: the boxes are the plan's)", () => {
    const px = (n: number, size: number) => {
      const t = numberTexts(tok({ ...PROFILES.rated, ovr: n, tier: "pro" }, size))[1]!;
      return (t.size * size) / 1618;
    };
    const sizes = [28, 32, 44, 48, 56, 64, 80];
    for (const n of [8, 44, 88]) {
      for (let i = 1; i < sizes.length; i++) {
        expect(px(n, sizes[i]!), `${n} @${sizes[i]}`).toBeGreaterThanOrEqual(
          px(n, sizes[i - 1]!) * 0.99,
        );
      }
    }
  });

  it("prints a dash for a card with no rating yet, never a 0", () => {
    for (const size of [80, 64, 32]) {
      const t = numberTexts(tok(PROFILES.born0, size));
      expect(t.map((x) => x.text)).toEqual(["—", "—"]);
    }
    for (const p of [PROFILES.born0, PROFILES.forming1, PROFILES.insufficient3, PROFILES.guest]) {
      for (const size of SIZES) expect(tok(p, size)).not.toMatch(/>\s*0\s*</);
    }
  });
});

describe("tokens in Arabic (plan 7, mirrored with the card)", () => {
  it("mirrors the shapes as a group and never the number", () => {
    for (const size of SIZES) {
      const h = tok(MOCK_ARABIC[0]!.profile, size, { lang: "ar" });
      expect(h).toContain('dir="rtl"');
      expect(h.match(/matrix\(-1 0 0 1 1000 0\)/g), `${size}`).toHaveLength(1);
      for (const t of texts(h)) expect(t.attrs.transform, `${size}`).toBeUndefined();
    }
  });

  it("puts the card's thickness on the trailing side in both languages: right in French, left in Arabic", () => {
    for (const size of SIZES) {
      for (const lang of ["fr", "ar"] as const) {
        const h = tok(PROFILES.rated, size, { lang });
        // the first path is the outline copy; its offset is in the group mirrored in Arabic
        const m =
          /<path d="[^"]*" fill="#[0-9a-f]{6}" transform="translate\(([\d.]+) ([\d.]+)\)"\/>/.exec(
            h,
          )!;
        const local = Number(m[1]);
        expect(local, `${size} ${lang}`).toBeCloseTo(u(size), 1);
        expect(Number(m[2]), `${size} ${lang}`).toBeCloseTo(u(size), 1);
        const screen = lang === "ar" ? -local : local;
        expect(Math.sign(screen), `${size} ${lang}`).toBe(lang === "ar" ? -1 : 1);
      }
    }
  });

  it("takes the right words in the label, tier word first in the app's own language", () => {
    expect(
      /aria-label="([^"]*)"/.exec(tok(MOCK_ARABIC[0]!.profile, 64, { lang: "ar" }))![1],
    ).toContain("OVR");
    expect(/aria-label="([^"]*)"/.exec(tok(PROFILES.born0, 64, { lang: "ar" }))![1]).toContain(
      "لا تقييم بعد",
    );
  });
});

describe("the label and the escape", () => {
  it("names the manager, the rating and the tier, and nothing a name can break out of", () => {
    expect(/aria-label="([^"]*)"/.exec(tok(MOCK_CARDS[3]!.profile, 64))![1]).toBe(
      "Ali, 84 OVR, PRO",
    );
    const hostile = { ...PROFILES.rated, name: '"><script>alert(1)</script>' };
    for (const size of SIZES) {
      const h = tok(hostile, size);
      expect(h.includes("<script"), `${size}`).toBe(false);
      expect(/aria-label="[^"]*"/.test(h)).toBe(true);
      expect(h).toContain("&lt;script&gt;");
    }
  });
});

describe("the tier ladder's tokens (Gradins G2)", () => {
  const TIERS = ["homa", "stade", "pro", "champion", "legend"] as const;
  /** The markup without what is unique per draw: the id scope. */
  const plain = (html: string) => html.replace(/mc-t-\d+/g, "mc-t-N");

  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: draws each tier in its own material, with a dash and no number`, () => {
      const drawn = TIERS.map((tier) => tok(ladderProfile(PROFILES.rated, tier), 44, { theme }));
      // five different tokens: the ring, the foil and the label all differ
      expect(new Set(drawn.map(plain)).size).toBe(5);
      TIERS.forEach((tier, i) => {
        const html = drawn[i]!;
        const F = FOIL[tier];
        const ring = F.foil
          ? /stroke="url\(#mc-t-\d+-foil\)"/
          : new RegExp(`stroke="${F.tokEdge}"`);
        expect(ring.test(html), `${tier} ring`).toBe(true);
        // the foil gradient is CHAMPION's and LEGEND's alone
        expect(html.includes("-foil"), `${tier} foil`).toBe(
          tier === "champion" || tier === "legend",
        );
        // the number is a dash, never a rating the server did not give
        expect(new Set(texts(html).map((t) => t.text)), tier).toEqual(new Set(["—"]));
        // and the token says its tier to a screen reader
        const label = /aria-label="([^"]*)"/.exec(html)![1]!;
        expect(label, tier).toContain(tier === "homa" ? "LASTREET" : tier.toUpperCase());
      });
    });
  }

  it("is the only way a tier is drawn without a rating: the same profile without `ladder` is the base token", () => {
    const base = plain(tok({ ...PROFILES.rated, ovr: null, tier: null }, 44));
    for (const tier of TIERS) {
      const bare = tok({ ...PROFILES.rated, ovr: null, tier }, 44);
      expect(plain(bare).replace(/aria-label="[^"]*"/, "")).toBe(
        base.replace(/aria-label="[^"]*"/, ""),
      );
    }
  });

  it("keeps the dash at 3:1 on the shirt for every tier and club: the number's fill is chosen for it", () => {
    for (const tier of TIERS) {
      for (const c of [PROFILES.rated, PROFILES.ratedWydad, PROFILES.ratedFar, PROFILES.ratedFus]) {
        const col = shirtColours(c.club, FOIL[tier]);
        expect(
          contrast(col.numberFill, col.primary),
          `${tier} ${c.club?.initials}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
