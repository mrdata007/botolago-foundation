// Audit MOB-03 and MOB-04 (Phase C, lane C4): the prediction deck's dots clear
// the 44px touch floor, and its role descriptions are read in the reader's
// language, not in English.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { SwipeDeck } from "./SwipeDeck";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SOURCE = readFileSync(join(ROOT, "src/components/predictions/SwipeDeck.tsx"), "utf8");
const fr = dictionaries.fr;
const ar = dictionaries.ar;

function render(count: number): string {
  const slides = Array.from({ length: count }, (_, i) => ({
    key: `m${i}`,
    node: <div>Carte {i}</div>,
  }));
  return renderToString(
    <I18nProvider>
      <SwipeDeck label="Votes" slides={slides} testId="deck" />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("MOB-04: the deck's role descriptions are localized", () => {
  const html = render(4);

  it("reads the French words, not the English ones", () => {
    expect(html).toContain(`aria-roledescription="${fr["predictions.votes.role"]}"`);
    expect(html).toContain(`aria-roledescription="${fr["predictions.votes.slide_role"]}"`);
    expect(html).not.toContain('aria-roledescription="carousel"');
    expect(html).not.toContain('aria-roledescription="slide"');
  });

  it("keeps a role description on every slide", () => {
    expect(html.match(/role="group" aria-roledescription=/g)).toHaveLength(4);
  });

  it("has the words in Arabic too, and none of them is English", () => {
    expect(ar["predictions.votes.role"]).toBe("عرض دوّار");
    expect(ar["predictions.votes.slide_role"]).toBe("شريحة");
    for (const word of [
      fr["predictions.votes.role"],
      fr["predictions.votes.slide_role"],
      ar["predictions.votes.role"],
      ar["predictions.votes.slide_role"],
    ])
      expect(word).not.toMatch(/^(carousel|slide)$/i);
  });

  it("writes no role description as a literal", () => {
    expect(SOURCE).not.toMatch(/aria-roledescription="/);
  });
});

describe("MOB-03: the dots are 44px targets around a small dot", () => {
  const html = render(4);
  const dots = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);

  it("renders one button per card, each on the kit's tap floor", () => {
    expect(dots).toHaveLength(4);
    for (const tag of dots) {
      expect(tag).toContain("min-h-[var(--ui-tap-min)]");
      expect(tag).toContain("min-w-[var(--ui-tap-min)]");
      // The old 24 x 32 box.
      expect(tag).not.toContain("h-8");
      expect(tag).not.toContain("min-w-6");
    }
  });

  it("keeps the painted dot as small as it was", () => {
    expect(html.match(/h-2\.5 w-2\.5 rounded-full/g)).toHaveLength(4);
  });

  it("lets a long deck wrap rather than shrink a target", () => {
    expect(html).toContain("flex flex-wrap items-center justify-center");
  });

  it("names each dot and marks the current one", () => {
    expect(html).toContain(
      `aria-label="${fr["predictions.votes.slide"].replace("{n}", "1").replace("{total}", "4")}"`,
    );
    expect(dots.filter((tag) => tag.includes('aria-current="true"'))).toHaveLength(1);
  });

  it("uses no physical direction utility on the dots", () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr|left|right)-[\w.[\]/-]+/m);
  });
});
