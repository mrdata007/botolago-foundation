import { describe, expect, it } from "bun:test";

import { findPlaceholders, placeholdersIn } from "../../../scripts/qa/legal-placeholder-gate";
import { PRIZES_ENABLED } from "@/lib/feature-flags";
import { LEGAL_DOCUMENTS } from "./documents";
import { PRIZE_TERMS, PRIZE_TERMS_OPEN_SECTIONS } from "./prize-terms";

const ARABIC = /[؀-ۿ]/;

describe("the placeholder prize terms", () => {
  it.each(["fr", "ar"] as const)(
    "%s carries exactly the five open sections, each marked TODO",
    (lang) => {
      const spans = placeholdersIn(PRIZE_TERMS[lang]);
      expect(spans).toHaveLength(PRIZE_TERMS_OPEN_SECTIONS.length);
      for (const span of spans) expect(span.startsWith("TODO")).toBe(true);
    },
  );

  it("keeps French and Arabic the same document", () => {
    const shape = (lang: "fr" | "ar") =>
      PRIZE_TERMS[lang].blocks.map((block) =>
        block.type === "list" ? `list:${block.items.length}` : block.type,
      );
    expect(shape("ar")).toEqual(shape("fr"));
    const headings = (lang: "fr" | "ar") =>
      PRIZE_TERMS[lang].blocks.flatMap((block) =>
        block.type === "heading" ? [block.text.split(".")[0]] : [],
      );
    expect(headings("ar")).toEqual(headings("fr"));
  });

  it("writes Arabic only in the Arabic document", () => {
    const text = (lang: "fr" | "ar") =>
      [
        PRIZE_TERMS[lang].title,
        ...PRIZE_TERMS[lang].blocks.flatMap((block) =>
          block.type === "list" ? block.items : block.type === "table" ? [] : [block.text],
        ),
      ].join("\n");
    expect(ARABIC.test(text("fr"))).toBe(false);
    expect(ARABIC.test(text("ar"))).toBe(true);
  });

  it("is not one of the always-published legal documents", () => {
    // The General Terms and the Privacy Policy must be publishable today; the
    // prize terms must not be until the owner fills them in.
    expect(Object.keys(LEGAL_DOCUMENTS)).not.toContain("prizeTerms");
  });
});

describe("the production build gate and the prize terms", () => {
  it("reports every open prize section once the prize pages are switched on", () => {
    const prize = findPlaceholders(true).filter((item) => item.where.startsWith("prizeTerms."));
    expect(prize.filter((item) => item.where === "prizeTerms.fr")).toHaveLength(5);
    expect(prize.filter((item) => item.where === "prizeTerms.ar")).toHaveLength(5);
  });

  it("ignores them while the prize pages are switched off", () => {
    expect(findPlaceholders(false).some((item) => item.where.startsWith("prizeTerms."))).toBe(
      false,
    );
  });

  it("follows the shipped flag by default", () => {
    expect(findPlaceholders().some((item) => item.where.startsWith("prizeTerms."))).toBe(
      PRIZES_ENABLED,
    );
  });
});
