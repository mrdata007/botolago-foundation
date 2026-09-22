import { describe, expect, it } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import {
  noticeConsentSegments,
  registerConsentSegments,
  type ConsentSegment,
} from "./consent-segments";

/**
 * The consent sentences are the one place in the app where a reader is asked
 * to agree to the two legal documents, so the links have to be there — and be
 * there identically — in both languages. The Arabic half is the part that
 * breaks silently: a sentence split by character offset looks fine in French
 * and hands the Arabic reader a broken word or a link over the wrong phrase.
 *
 * These run against the real dictionaries through a `t` bound to each language,
 * which is exactly what the components do.
 */

const LANGS = ["fr", "ar"] as const;

function translatorFor(lang: (typeof LANGS)[number]) {
  return (key: TranslationKey) => {
    const value = (dictionaries[lang] as Record<string, string>)[key];
    // A missing key would otherwise surface as the key name rendered on screen.
    if (value === undefined) throw new Error(`missing ${lang} translation for ${key}`);
    return value;
  };
}

const BUILDERS = [
  ["register consent", registerConsentSegments],
  ["login/register notice", noticeConsentSegments],
] as const satisfies ReadonlyArray<
  readonly [string, (t: (key: TranslationKey) => string) => ConsentSegment[]]
>;

function sentence(segments: readonly ConsentSegment[]): string {
  return segments.map((s) => s.text).join("");
}

function links(segments: readonly ConsentSegment[]) {
  return segments.filter((s): s is Extract<ConsentSegment, { kind: "link" }> => s.kind === "link");
}

describe.each(BUILDERS)("%s", (_name, build) => {
  describe.each(LANGS)("in %s", (lang) => {
    const segments = build(translatorFor(lang));

    it("links to /terms and to /privacy, exactly once each", () => {
      expect(links(segments).map((l) => l.to)).toEqual(["/terms", "/privacy"]);
    });

    it("gives both links visible text in this language", () => {
      for (const link of links(segments)) {
        expect(link.text.trim().length).toBeGreaterThan(0);
        // A label that is still a dictionary key never made it through `t`.
        expect(link.text).not.toMatch(/^[a-z_.]+$/);
      }
    });

    it("has no empty segment", () => {
      // An empty value is an i18n gate error (E2) in its own right; an empty
      // segment here would also collapse the spacing around a link.
      for (const segment of segments) expect(segment.text.length).toBeGreaterThan(0);
    });

    it("reads as one sentence, with the link labels inside it", () => {
      const full = sentence(segments);
      expect(full.trim().length).toBeGreaterThan(0);
      for (const link of links(segments)) expect(full).toContain(link.text);
      // Nothing doubled or dropped where the segments meet.
      expect(full).not.toMatch(/\s{2,}/);
      expect(full.trim()).toBe(full.trim().replace(/\s+$/, ""));
    });

    it("ends the sentence rather than trailing off after the last link", () => {
      expect(sentence(segments).trim().endsWith(".")).toBe(true);
    });
  });

  it("has the same shape in both languages", () => {
    // The whole point of segmenting rather than pattern-matching: if one
    // language needed a different number of parts, or its link fell in a
    // different position, the two consent sentences would stop being the same
    // statement.
    const [fr, ar] = LANGS.map((lang) => build(translatorFor(lang)));
    expect(ar!.map((s) => s.kind)).toEqual(fr!.map((s) => s.kind));
    expect(ar!.map((s) => (s.kind === "link" ? s.to : null))).toEqual(
      fr!.map((s) => (s.kind === "link" ? s.to : null)),
    );
  });

  it("actually translates: the two languages do not share their wording", () => {
    const [fr, ar] = LANGS.map((lang) => build(translatorFor(lang)));
    // Guards a copy/paste that leaves French text under the `ar` keys.
    expect(links(ar!).map((l) => l.text)).not.toEqual(links(fr!).map((l) => l.text));
    for (const link of links(ar!)) expect(link.text).toMatch(/[؀-ۿ]/);
  });
});

describe("Arabic spacing is the Arabic sentence's own business", () => {
  it("binds the conjunction to the following word instead of copying French spacing", () => {
    // " et la " needs a space on both sides; Arabic "و" attaches directly to
    // the next word. This is the concrete reason the connective is a segment
    // and not something the renderer inserts between the parts.
    const fr = registerConsentSegments(translatorFor("fr"));
    const ar = registerConsentSegments(translatorFor("ar"));
    expect(fr[2]!.text).toMatch(/^\s.*\s$/);
    expect(ar[2]!.text).toMatch(/^\s\S+$/);
  });
});
