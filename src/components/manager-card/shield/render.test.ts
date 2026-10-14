import { describe, expect, it } from "bun:test";

import { findUnsafeMarkup, HOSTILE_NAMES } from "../markup-safety";
import { TIER_CODES, type CardProfile } from "../types";
import { founderDetail, fullCard, SERIAL_ON_FACE } from "./full";
import { shieldRenderer } from "./index";
import { METAL } from "./metal";
import { tableEm } from "./name";
import {
  STRINGS,
  arabicName,
  classesOf,
  forming,
  founder,
  longName,
  noClub,
  rated,
  textOf,
} from "./test-support";

const draw = (profile: CardProfile, lang: "fr" | "ar" = "fr", extra = {}) =>
  fullCard(profile, { strings: STRINGS[lang], theme: "light", ...extra }, tableEm);

describe("the shield's full card", () => {
  it("is one root with the label, the direction, the metal and every layer", () => {
    const html = draw(rated);
    expect(html.startsWith('<div class="mc-shield mc-shield--pro')).toBe(true);
    expect(html).toContain('role="img"');
    expect(html).toContain('data-mc-tier="pro"');
    expect(html).toContain('dir="ltr"');
    for (const layer of ["frame", "face", "art", "text", "num", "lines", "foil", "emblem"]) {
      expect(html).toContain(`mc-sl--${layer}`);
    }
    // the tier's colours arrive as custom properties from the one table
    expect(html).toContain(`--sh-ink:${METAL.pro.ink}`);
    expect(draw(rated, "ar")).toContain('dir="rtl"');
  });

  it("draws the rating, « OVR », the tier word, the four stats, the club and its crest", () => {
    const html = draw(rated);
    expect(textOf(html, "mc-shield__ovr")).toBe("84");
    expect(html).toContain('data-mc="ovr"');
    expect(textOf(html, "mc-shield__ovrl")).toBe("OVR");
    expect(textOf(html, "mc-shield__tier")).toBe("PRO");
    expect(textOf(html, "mc-shield__club")).toBe("Raja CA");
    for (const value of ["91", "82", "86", "78"]) expect(html).toContain(`>${value}</span>`);
    for (const code of ["CAP", "SEL", "TRF", "CON"]) expect(html).toContain(`>${code}</span>`);
    expect(textOf(html, "mc-shield__crest")).toBe("RCA");
  });

  it("writes the name as the autograph and its initials as the monogram, in the name's own script", () => {
    const latin = draw(rated, "ar");
    expect(latin).toContain("mc-shield__sig--latin");
    expect(textOf(latin, "mc-shield__sig-line")).toBe("Ali");
    expect(textOf(latin, "mc-shield__mono")).toBe("A");
    const arabic = draw(arabicName, "fr");
    expect(arabic).toContain("mc-shield__sig--arabic");
    expect(textOf(arabic, "mc-shield__sig-line")).toBe("فاطمة الزهراء");
    expect(textOf(arabic, "mc-shield__mono")).toBe("فا");
  });

  it("breaks a name too long for one line once, and keeps every line inside the art", () => {
    const html = draw(longName);
    expect(html).toContain("mc-shield__sig--two");
    expect(html.match(/mc-shield__sig-line/g)).toHaveLength(2);
    const size = Number(
      /mc-shield__sig[^"]*" aria-hidden="true" style="font-size:([\d.]+)cqw"/.exec(html)![1],
    );
    for (const line of ["Abdelkarim", "Benjelloun-Alaoui"]) {
      expect((tableEm(line, "latin") + 0.36) * size).toBeLessThanOrEqual(80.5);
    }
  });

  it("LASTREET for the lowest tier, in either language, set left to right", () => {
    for (const lang of ["fr", "ar"] as const) {
      const html = draw({ ...rated, ovr: 61, tier: "homa" }, lang);
      expect(textOf(html, "mc-shield__tier")).toBe("LASTREET");
      expect(html).toContain('mc-shield__tier" dir="ltr"');
    }
    // an Arabic tier word is set right to left and never tracked (`--ar` drops the letter spacing)
    const ar = draw(rated, "ar");
    expect(ar).toContain("mc-shield__tier mc-shield__tier--ar");
  });

  it("follows the earned tier: graphite with no tier yet, then silver, gold, red-gold, cyan, prism", () => {
    expect(draw(forming)).toContain("mc-shield--base");
    const order = TIER_CODES.map((tier) => draw({ ...rated, tier }));
    expect(order.map((html) => /mc-shield--(\w+)/.exec(html)![1])).toEqual([...TIER_CODES]);
    // the holographic layer is CHAMPION's and LEGEND's alone
    expect(order.map((html) => html.includes("mc-shield--holo"))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("prints a dash and the forming marks, never 0, while there is no number", () => {
    const html = draw(forming);
    expect(textOf(html, "mc-shield__ovr")).toBe("—");
    expect(html).not.toMatch(/>\s*0\s*</);
    expect(html).not.toContain("mc-shield__ovrl");
    expect(html).not.toContain("mc-shield__tier");
    const marks = html.match(/mc-shield__mark\b[^"]*"/g)!;
    expect(marks).toHaveLength(forming.minRated!);
    expect(marks.filter((m) => m.includes("--on"))).toHaveLength(forming.counted!);
    // the newest mark is marked whether or not a beat plays, so the tick beat is a root class alone
    expect(html.match(/mc-shield__mark--new/g)).toHaveLength(1);
    for (const value of html.match(/mc-shield__stat-v" dir="ltr">([^<]*)</g)!) {
      expect(value).toContain(">—<");
    }
  });

  it("draws its empty parts: no club, no name, no serial, no founder", () => {
    const html = draw(noClub);
    expect(html).not.toContain("mc-shield__club");
    expect(html).not.toContain("mc-shield__crest");
    const unnamed = draw({ ...rated, name: "" });
    expect(unnamed).not.toContain("mc-shield__sig");
    expect(unnamed).not.toContain("mc-shield__mono");
    if (SERIAL_ON_FACE) {
      expect(textOf(draw({ ...rated, serial: null }), "mc-shield__serial")).toBe(
        "BOT #— · 2026/27",
      );
    }
    expect(draw(rated)).not.toContain("mc-shield__founder");
  });

  it("a founder carries the capsule with the year; the detail crops the card's foot", () => {
    const html = draw(founder);
    expect(textOf(html, "mc-shield__founder-y")).toBe("2026");
    const detail = founderDetail(founder, { strings: STRINGS.fr, theme: "light" }, tableEm)!;
    expect(detail.match(/role="img"/g)).toHaveLength(1);
    expect(detail).toContain(`aria-label="${STRINGS.fr.founderLine}"`);
    expect(detail).toContain("mc-shield-detail__crop");
    expect(founderDetail(rated, { strings: STRINGS.fr, theme: "light" }, tableEm)).toBeNull();
  });

  it("draws the club's crest only from an address the card accepts", () => {
    const withCrest = { ...rated, club: { ...rated.club!, crest: "https://cdn.example/rca.png" } };
    const html = draw(withCrest);
    expect(html).toContain('<image href="https://cdn.example/rca.png"');
    expect(html).not.toContain(">RCA<");
    const refused = draw({ ...rated, club: { ...rated.club!, crest: "javascript:alert(1)" } });
    expect(refused).not.toContain("<image");
    expect(textOf(refused, "mc-shield__crest")).toBe("RCA");
  });

  it("prints the sample label on a development fixture, and has a compact variant", () => {
    expect(textOf(draw({ ...rated, sample: true }), "mc-shield__sample")).toBe("Exemple");
    expect(draw(rated, "fr", { compact: true })).toContain("mc-shield--compact");
  });

  it("escapes a hostile name in the autograph and the monogram", () => {
    for (const name of HOSTILE_NAMES) {
      for (const lang of ["fr", "ar"] as const) {
        const html = draw({ ...rated, name }, lang);
        expect(findUnsafeMarkup(html)).toEqual([]);
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<script");
      }
    }
  });

  it("is laid out with logical properties: no layer is flipped, no text is mirrored", () => {
    const ar = draw(rated, "ar");
    expect(ar).not.toContain("scaleX(-1)");
    expect(classesOf(ar).has("mc-shield")).toBe(true);
  });

  it("is the renderer's full()", () => {
    const viaRenderer = shieldRenderer.full(rated, { strings: STRINGS.fr, theme: "dark" });
    expect(viaRenderer).toContain("mc-shield--dark");
  });
});
