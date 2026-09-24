import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

/**
 * The top slot of /news falls back to a carousel of the newest articles when
 * no editor has picked a lead or top stories. There is no React component
 * harness in this repo, so the wiring is pinned as source text, the way
 * `article-hero-fallback.test.ts` pins the hero plate.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (...parts: string[]) => stripComments(readFileSync(join(ROOT, ...parts), "utf8"));

const PAGE = read("src", "routes", "news.tsx");
const CAROUSEL = read("src", "components", "news", "LatestCarousel.tsx");
const FEED = read("src", "components", "news", "LatestFeed.tsx");

describe("the /news top slot", () => {
  it("shows the carousel only when no lead and no top stories are picked", () => {
    expect(PAGE).toMatch(/!lead && featured\.length === 0\s*\?\s*\(homeQ\.data\?\.latest/);
    expect(PAGE).toContain("<LatestCarousel articles={carousel} clubs={clubs} />");
  });

  it("does not repeat the carousel's articles in the Latest feed below", () => {
    expect(PAGE).toContain("...carousel.map((item) => item.id)");
  });

  it("never falls back to an empty box above a full feed", () => {
    expect(PAGE).not.toContain('t("state.empty")');
  });

  it("says 'no articles' only when there are none, not when the carousel holds them all", () => {
    expect(FEED).toContain("if (fetched.length === 0) {");
    expect(FEED).toContain("if (items.length === 0 && !query.hasNextPage) return null;");
  });
});

describe("the carousel follows the house rules", () => {
  it("uses no physical direction utility, so it works right-to-left", () => {
    expect(CAROUSEL).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr|left|right)-[\w.[\]/-]+/m);
    expect(CAROUSEL).not.toMatch(/\btext-(left|right)\b/);
    expect(CAROUSEL).toContain("snap-x");
  });

  it("gives every dot a touch target, not just an 8 px dot", () => {
    expect(CAROUSEL).toContain("grid h-8 min-w-6 place-items-center");
  });

  it("does not move on its own", () => {
    expect(CAROUSEL).not.toMatch(/setInterval|setTimeout/);
  });

  it("names its controls in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const key of ["news.carousel.previous", "news.carousel.next", "news.carousel.slide"]) {
        expect(dictionaries[lang][key as TranslationKey]).toBeTruthy();
      }
    }
  });
});
