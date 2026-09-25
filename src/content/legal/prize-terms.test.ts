import { describe, expect, it } from "bun:test";

import { findPlaceholders, placeholdersIn } from "../../../scripts/qa/legal-placeholder-gate";
import { LEGAL_DOCUMENTS } from "./documents";
import { PRIZE_TERMS } from "./prize-terms";

const ARABIC = /[؀-ۿ]/;

const textOf = (lang: "fr" | "ar") =>
  [
    PRIZE_TERMS[lang].title,
    ...PRIZE_TERMS[lang].blocks.flatMap((block) =>
      block.type === "list" ? block.items : block.type === "table" ? [] : [block.text],
    ),
  ].join("\n");

describe("the prize terms", () => {
  it.each(["fr", "ar"] as const)("%s carries no unfilled placeholder", (lang) => {
    expect(placeholdersIn(PRIZE_TERMS[lang])).toEqual([]);
    expect(textOf(lang)).not.toContain("TODO");
  });

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

  it("names the same organiser in both languages, in sections 1 and 2", () => {
    for (const lang of ["fr", "ar"] as const) {
      const blocks = PRIZE_TERMS[lang].blocks;
      const after = (number: string) => {
        const at = blocks.findIndex(
          (block) => block.type === "heading" && block.text.startsWith(`${number}.`),
        );
        const next = blocks[at + 1];
        return next?.type === "paragraph" ? next.text : "";
      };
      expect(after("1")).toContain("Go Sports Technologies");
      expect(after("2")).toContain("Go Sports Technologies");
    }
  });

  it("writes Arabic only in the Arabic document", () => {
    expect(ARABIC.test(textOf("fr"))).toBe(false);
    expect(ARABIC.test(textOf("ar"))).toBe(true);
  });

  it("is not one of the always-published legal documents", () => {
    // The General Terms and the Privacy Policy are published whatever the
    // flags say; the prize terms only while PRIZES_ENABLED is on.
    expect(Object.keys(LEGAL_DOCUMENTS)).not.toContain("prizeTerms");
  });
});

describe("the production build gate and the prize terms", () => {
  it("finds nothing to refuse in them once the prize pages are switched on", () => {
    expect(findPlaceholders(true).filter((item) => item.where.startsWith("prizeTerms."))).toEqual(
      [],
    );
  });

  it("leaves them out while the prize pages are switched off", () => {
    expect(findPlaceholders(false).some((item) => item.where.startsWith("prizeTerms."))).toBe(
      false,
    );
  });
});
