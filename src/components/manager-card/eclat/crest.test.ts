import { describe, expect, it } from "bun:test";

import { findUnsafeMarkup } from "../markup-safety";
import type { CardProfile } from "../types";
import { CREST, CREST_PLATE, DISC } from "./geometry";
import { eclatRenderer } from "./index";
import { AR, FR, PROFILES } from "./test-data";
import { layer, texts } from "./test-markup";

/**
 * The club's crest on the tab's disc (owner request 2026-10-10): drawn when the profile's club
 * carries one the card may draw, else the initials disc exactly as before.
 */

const CREST_URL = "https://media.example.test/storage/v1/object/public/football-media/rca.png";
const withCrest = (p: CardProfile, crest: string): CardProfile => ({
  ...p,
  club: { ...p.club!, crest },
});
const full = (
  p: CardProfile,
  lang: "fr" | "ar" = "fr",
  theme: "light" | "dark" = "light",
  compact = false,
) => eclatRenderer.full(p, { strings: lang === "ar" ? AR : FR, theme, compact });
const images = (html: string) => [...html.matchAll(/<image\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const initials = (html: string) => texts(html).filter((t) => t.attrs["data-meta"] === "initials");

describe("the tab's disc: crest or initials", () => {
  it("draws the initials disc and no picture when the club has no crest", () => {
    for (const lang of ["fr", "ar"] as const) {
      const html = full(PROFILES.rated, lang);
      expect(images(html)).toEqual([]);
      expect(initials(html).map((t) => t.text)).toEqual(["RCA"]);
      expect(html.includes('data-meta="crest-plate"')).toBe(false);
    }
  });

  it("draws the crest on a light plate in the disc's place, instead of the initials", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const theme of ["light", "dark"] as const) {
        const html = full(withCrest(PROFILES.rated, CREST_URL), lang, theme);
        const where = `${lang} ${theme}`;
        const [image, ...more] = images(html);
        expect(more, where).toEqual([]);
        expect(attr(image!, "href"), where).toBe(CREST_URL);
        expect(attr(image!, "data-meta"), where).toBe("crest");
        expect(attr(image!, "preserveAspectRatio"), where).toBe("xMidYMid meet");
        // centred on the disc, mirrored by its x (never by a transform: the crest is not flipped)
        const cx = lang === "ar" ? 1000 - DISC.cx : DISC.cx;
        expect(Number(attr(image!, "x")) + CREST.box / 2, where).toBe(cx);
        expect(Number(attr(image!, "y")) + CREST.box / 2, where).toBe(DISC.cy);
        expect(Number(attr(image!, "width")), where).toBe(CREST.box);
        expect(attr(image!, "transform"), where).toBeUndefined();
        expect(initials(html), where).toEqual([]);
        expect(html.includes(`fill="${CREST_PLATE[theme]}" data-meta="crest-plate"`), where).toBe(
          true,
        );
        // the season stays on the tab
        expect(
          texts(html).some((t) => t.attrs["data-meta"] === "season"),
          where,
        ).toBe(true);
        expect(findUnsafeMarkup(html), where).toEqual([]);
      }
    }
  });

  it("puts the picture in the frame layer, after the mirrored shapes", () => {
    const frame = layer(full(withCrest(PROFILES.rated, CREST_URL), "ar"), "frame")!;
    expect(images(frame)).toHaveLength(1);
  });

  it("draws the crest on the face-à-face card too, where the initials never are", () => {
    const html = full(withCrest(PROFILES.rated, CREST_URL), "fr", "light", true);
    expect(images(html)).toHaveLength(1);
    expect(initials(html)).toEqual([]);
    expect(images(full(PROFILES.rated, "fr", "light", true))).toEqual([]);
  });

  it("refuses a crest address it may not draw, and keeps the initials", () => {
    const hostile = [
      "javascript:alert(1)",
      'https://x.test/a.png" onload="alert(1)',
      "https://x.test/a.png'><script>",
      "http://evil.test/crest.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "https://user:pw@x.test/a.png",
      "//x.test/a.png",
      "",
    ];
    for (const crest of hostile) {
      for (const lang of ["fr", "ar"] as const) {
        const html = full(withCrest(PROFILES.rated, crest), lang);
        expect(images(html), crest).toEqual([]);
        expect(
          initials(html).map((t) => t.text),
          crest,
        ).toEqual(["RCA"]);
        expect(findUnsafeMarkup(html), crest).toEqual([]);
      }
    }
  });

  it("escapes a query string in the address", () => {
    const resized =
      "https://media.example.test/storage/v1/render/image/public/football-media/rca.png?width=128&height=128&resize=contain";
    const html = full(withCrest(PROFILES.rated, resized));
    expect(attr(images(html)[0]!, "href")).toBe(resized.replace(/&/g, "&amp;"));
    expect(findUnsafeMarkup(html)).toEqual([]);
  });

  it("leaves a card with no club as it was: the neutral hexagon, no picture", () => {
    expect(images(full(PROFILES.clubNull))).toEqual([]);
  });

  it("does not change the tokens, which have no disc", () => {
    for (const size of [80, 64, 44, 32, 28, 24] as const) {
      const strip = (s: string) => s.replace(/mc-t-\d+/g, "id");
      const a = eclatRenderer.token(PROFILES.rated, { strings: FR, theme: "light", size });
      const b = eclatRenderer.token(withCrest(PROFILES.rated, CREST_URL), {
        strings: FR,
        theme: "light",
        size,
      });
      expect(strip(b), String(size)).toBe(strip(a));
    }
  });
});

describe("the share picture's art", () => {
  it("keeps the initials disc in the SVG and hands the crest to the canvas", () => {
    for (const [lang, strings] of [
      ["fr", FR],
      ["ar", AR],
    ] as const) {
      const art = eclatRenderer.image(withCrest(PROFILES.rated, CREST_URL), strings);
      expect(art.svg.includes("<image")).toBe(false);
      expect(art.svg.includes("crest-plate")).toBe(false);
      const marked = art.texts.filter((run) => run.part === "clubInitials");
      expect(marked.map((run) => run.text)).toEqual(["RCA"]);
      const scale = art.width / 1000;
      const cx = (lang === "ar" ? 1000 - DISC.cx : DISC.cx) * scale;
      expect(art.crest).toMatchObject({
        href: CREST_URL,
        cx,
        cy: DISC.cy * scale,
        r: CREST.r * scale,
        plate: CREST_PLATE.dark,
        ring: PROFILES.rated.club!.primary,
        box: CREST.box * scale,
      });
    }
  });

  it("has no crest for a club without one, and the same art otherwise", () => {
    const plain = eclatRenderer.image(PROFILES.rated, FR);
    const crested = eclatRenderer.image(withCrest(PROFILES.rated, CREST_URL), FR);
    expect(plain.crest).toBeUndefined();
    const strip = (s: string) => s.replace(/mc-\d+/g, "id");
    expect(strip(crested.svg)).toBe(strip(plain.svg));
    expect(crested.texts).toEqual(plain.texts);
  });
});
