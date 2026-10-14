import { describe, expect, it } from "bun:test";

import { findUnsafeMarkup } from "../markup-safety";
import { ladderProfile } from "../to-profile";
import { TIER_CODES, type TokenSize } from "../types";
import { ASPECT } from "./estimate";
import { cardImage, IMAGE_HEIGHT, IMAGE_WIDTH } from "./image";
import { shieldRenderer } from "./index";
import { tableEm } from "./name";
import { tokenMarkup, tokenWidth } from "./token";
import { STRINGS, arabicName, forming, founder, rated } from "./test-support";

const SIZES: TokenSize[] = [24, 28, 32, 44, 56, 64, 80];
const numbers = (html: string) =>
  [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("the shield's tokens", () => {
  it("are mini shields of the card's shape, size tall", () => {
    for (const size of SIZES) {
      const box = shieldRenderer.tokenBox(rated, size);
      expect(box.height).toBe(size);
      expect(box.width).toBe(tokenWidth(size));
      expect(box.height / box.width).toBeCloseTo(ASPECT, 1);
      const html = tokenMarkup(rated, STRINGS.fr, size, "light");
      expect(html).toContain(`class="mc-tok mc-tok--${size} mc-tok--pro"`);
      expect(html).toContain(`width:${tokenWidth(size)}px;height:${size}px`);
      expect(findUnsafeMarkup(html)).toEqual([]);
    }
  });

  it("print the rating from 28 px up (the row prints it beside the 24 px mini), and a dash without one", () => {
    expect(numbers(tokenMarkup(rated, STRINGS.fr, 24, "light"))).toEqual([]);
    for (const size of [28, 44, 80] as const) {
      expect(new Set(numbers(tokenMarkup(rated, STRINGS.fr, size, "light")))).toEqual(
        new Set(["84"]),
      );
      expect(new Set(numbers(tokenMarkup(forming, STRINGS.fr, size, "dark")))).toEqual(
        new Set(["—"]),
      );
    }
  });

  it("draw the ladder's five tiers in five materials, the prism (`-foil`) on CHAMPION and LEGEND only", () => {
    const tokens = TIER_CODES.map((tier) =>
      tokenMarkup(ladderProfile(forming, tier), STRINGS.fr, 44, "light").replace(/mc-t-\d+/g, "T"),
    );
    expect(new Set(tokens).size).toBe(5);
    expect(tokens.map((html) => html.includes("-foil"))).toEqual([false, false, false, true, true]);
    for (const html of tokens) expect(new Set(numbers(html))).toEqual(new Set(["—"]));
    expect(tokens[0]).toContain("LASTREET");
  });

  it("speak the token's sentence", () => {
    expect(tokenMarkup(rated, STRINGS.fr, 44, "light")).toContain('aria-label="Ali, 84 OVR, PRO"');
  });
});

describe("the shield's share art", () => {
  it("is a portrait, text-free SVG with the card's runs", () => {
    const art = cardImage(rated, STRINGS.fr, tableEm);
    expect(art.width).toBe(IMAGE_WIDTH);
    expect(art.height).toBe(IMAGE_HEIGHT);
    expect(art.height).toBeGreaterThan(art.width);
    expect(art.svg).not.toMatch(/<text|<tspan|<image|<style/);
    const texts = art.texts.map((run) => run.text);
    for (const text of ["84", "OVR", "PRO", "A", "Ali", "RAJA CA", "91", "CAP", "RCA"]) {
      expect(texts, text).toContain(text);
    }
    // the serial is data, not drawn
    expect(texts.some((text) => text.includes("BOT #"))).toBe(false);
  });

  it("writes the autograph in the signature face, turned as on the card", () => {
    const latin = cardImage(rated, STRINGS.fr, tableEm).texts.find((run) => run.text === "Ali")!;
    expect(latin.face).toBe("signature");
    expect(latin.rotate).toBe(-7);
    expect(latin.dir).toBe("ltr");
    const arabic = cardImage(arabicName, STRINGS.ar, tableEm).texts.find(
      (run) => run.face === "signature",
    )!;
    expect(arabic.dir).toBe("rtl");
    expect(arabic.rotate).toBe(6);
  });

  it("mirrors the rating to the right in Arabic, and never tracks an Arabic run", () => {
    const fr = cardImage(rated, STRINGS.fr, tableEm).texts.find((run) => run.text === "84")!;
    const ar = cardImage(rated, STRINGS.ar, tableEm);
    const number = ar.texts.find((run) => run.text === "84")!;
    expect(number.x).toBeGreaterThan(IMAGE_WIDTH / 2);
    expect(fr.x).toBeLessThan(IMAGE_WIDTH / 2);
    for (const run of ar.texts) if (run.dir === "rtl") expect(run.tracking).toBeUndefined();
  });

  it("hands back the crest for the canvas when the club has one, over an initials run it can drop", () => {
    const art = cardImage(
      { ...rated, club: { ...rated.club!, crest: "https://cdn.example/rca.png" } },
      STRINGS.fr,
      tableEm,
    );
    expect(art.crest?.href).toBe("https://cdn.example/rca.png");
    expect(art.texts.find((run) => run.part === "clubInitials")?.text).toBe("RCA");
    expect(cardImage(rated, STRINGS.fr, tableEm).crest).toBeUndefined();
  });

  it("carries the founder's year", () => {
    expect(cardImage(founder, STRINGS.fr, tableEm).texts.map((run) => run.text)).toContain("2026");
  });
});
