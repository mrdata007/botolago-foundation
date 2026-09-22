import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { plateTokenForCategory } from "./ArticleHeroFallback";

/**
 * BG-0076. The branded hero plate is a Tailwind/CSS artifact: almost nothing
 * about it is observable at runtime in this repo (there is no React
 * component-test harness — see the BG-0012 builder report). So it is pinned
 * as source text, the same way `ui-kit.contract.test.ts` pins the kit, plus a
 * real check that every token it names actually exists in both themes.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Strip comments so prose about a forbidden pattern is not itself matched. */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FALLBACK = stripComments(read("src", "components", "common", "ArticleHeroFallback.tsx"));
const MEDIA = stripComments(read("src", "components", "common", "FailureAwareImage.tsx"));
const CARD = stripComments(read("src", "components", "common", "ArticleCard.tsx"));
const CSS = read("src", "styles.css");

const CATEGORIES = ["for_you", "latest", "transfers", "analysis", "interviews"] as const;

describe("BG-0076: the plate colour exists for every category, in both themes", () => {
  for (const category of CATEGORIES) {
    it(`${category} maps to a token declared in light and dark`, () => {
      const token = plateTokenForCategory(category);
      expect(token).toMatch(/^--news-plate-[a-z-]+$/);
      // Declared twice: once at `:root` level and once inside the `.dark`
      // block, so the plate follows the theme instead of pinning one.
      const declarations = [...CSS.matchAll(new RegExp(`${token}\\s*:`, "g"))];
      expect(declarations).toHaveLength(2);
      const darkBlock = CSS.slice(CSS.lastIndexOf(".dark {"));
      expect(darkBlock).toContain(`${token}:`);
    });
  }

  it("an unknown or absent slug still resolves to a real token", () => {
    expect(plateTokenForCategory(undefined)).toBe("--news-plate-latest");
    expect(plateTokenForCategory("not-a-category")).toBe("--news-plate-latest");
  });
});

describe("BG-0076: the plate obeys the house rules", () => {
  it("uses no physical direction utility", () => {
    expect(FALLBACK).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr)-[\w.[\]/-]+/m);
    expect(FALLBACK).not.toMatch(/(^|[\s"'`{])-?(left|right)-[\w.[\]/-]+/m);
    expect(FALLBACK).not.toMatch(/\btext-(left|right)\b/);
    expect(FALLBACK).not.toMatch(/\bborder-(l|r)(-[\w.[\]/-]+)?(?![\w-])/);
    expect(FALLBACK).not.toMatch(/\b(margin|padding)-(left|right)\b/);
  });

  it("letter-spaces nothing unless ltr:", () => {
    const offenders = [...FALLBACK.matchAll(/(.{0,4})tracking-[\w[\]./-]+/g)]
      .filter((match) => !match[1].endsWith("ltr:"))
      .map((match) => match[0].trim());
    expect(offenders).toEqual([]);
  });

  it("hardcodes no colour and no Tailwind radius ramp", () => {
    expect(FALLBACK).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(FALLBACK).not.toMatch(/\brgba?\(/);
    expect(FALLBACK).not.toMatch(/\b(bg|text|border|ring|fill|stroke)-(white|black)\b/);
    expect(FALLBACK).not.toMatch(/\brounded-(lg|xl|2xl|3xl)\b/);
  });

  it("angles no gradient in degrees", () => {
    // `135deg` is a physical direction: it would run corner-to-corner the
    // wrong way under dir="rtl". Only `to bottom`/`to top` are safe here.
    expect(FALLBACK).not.toMatch(/-?\d+(\.\d+)?deg/);
    expect(FALLBACK).toContain("linear-gradient(to bottom");
  });

  it("is absolutely positioned, so it cannot change the media box", () => {
    expect(FALLBACK).toContain("absolute inset-0");
  });
});

describe("BG-0076: the plate is wired to the existing failure path", () => {
  it("MediaImage shows the placeholder only with no src or a failed src", () => {
    expect(MEDIA).toContain("const showPlaceholder = !src || failedSrc === src;");
    // The failure is reported by the same FailureAwareImage attempt that
    // already removes the broken image from layout — not by a second
    // mechanism bolted on beside it.
    expect(MEDIA).toContain("onFailed?.(src)");
    expect(MEDIA).toContain("onFailed={setFailedSrc}");
  });

  it("every ArticleCard variant passes a placeholder", () => {
    const mediaImages = CARD.match(/<MediaImage\b/g) ?? [];
    const placeholders = CARD.match(/placeholder=\{heroPlaceholder\(/g) ?? [];
    // Five variants: lead, row, compact, horizontal, imageLed.
    expect(mediaImages).toHaveLength(5);
    expect(placeholders).toHaveLength(5);
  });

  it("the article detail hero passes one too", () => {
    const detail = stripComments(read("src", "routes", "news.$articleId.tsx"));
    expect(detail).toContain("placeholder={<ArticleHeroFallback");
  });
});
